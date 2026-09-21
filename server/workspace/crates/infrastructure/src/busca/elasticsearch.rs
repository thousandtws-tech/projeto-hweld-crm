use async_trait::async_trait;
use elasticsearch::auth::Credentials;
use elasticsearch::http::transport::{SingleNodeConnectionPool, TransportBuilder};
use elasticsearch::http::{StatusCode, Url};
use elasticsearch::indices::{IndicesCreateParts, IndicesDeleteParts, IndicesExistsParts};
use elasticsearch::params::Refresh;
use elasticsearch::{
    BulkOperation, BulkParts, DeleteParts, Elasticsearch, IndexParts, SearchParts,
};
use hweld_application::ports::busca::{
    ConsultaBuscaProdutos, DocumentoProduto, FacetaContagem, Facetas, HitBusca, MotorBusca,
    ResultadoMotor, SugestaoProduto,
};
use hweld_application::{ErroApp, Resultado};
use hweld_domain::shared::id::Id;
use rust_decimal::prelude::FromPrimitive;
use serde_json::{json, Value};

use crate::config::ConfigBusca;

const CTX: &str = "elasticsearch";

fn erro_es(e: elasticsearch::Error) -> ErroApp {
    ErroApp::interno(CTX, e)
}

fn erro_ser(e: serde_json::Error) -> ErroApp {
    ErroApp::interno(CTX, e)
}

/// Settings/mappings do índice — criado uma vez no boot.
fn definicao_indice() -> Value {
    json!({
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0,
            "analysis": {
                "filter": {
                    "fold_pt": { "type": "asciifolding", "preserve_original": false }
                },
                "analyzer": {
                    "texto_pt": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "fold_pt"]
                    }
                }
            }
        },
        "mappings": {
            "properties": {
                "produto_id":    { "type": "long" },
                "sku":           { "type": "keyword" },
                "nome": {
                    "type": "text",
                    "analyzer": "texto_pt",
                    "fields": {
                        "autocomplete": { "type": "search_as_you_type", "analyzer": "texto_pt" },
                        "keyword":      { "type": "keyword", "ignore_above": 256 }
                    }
                },
                "descricao":      { "type": "text", "analyzer": "texto_pt" },
                "categoria_id":   { "type": "long" },
                "categoria_nome": { "type": "keyword" },
                "marca":          { "type": "keyword" },
                "preco":          { "type": "scaled_float", "scaling_factor": 100 },
                "ativo":          { "type": "boolean" },
                "destaque":       { "type": "boolean" },
                "criado_em":      { "type": "date" }
            }
        }
    })
}

fn query_busca(consulta: &ConsultaBuscaProdutos) -> Value {
    let must = match consulta
        .q
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
    {
        Some(q) => json!({
            "multi_match": {
                "query": q,
                "type": "best_fields",
                "fields": ["nome^3", "sku^4", "descricao", "marca^2", "categoria_nome^2"],
                "fuzziness": "AUTO",
                "prefix_length": 1
            }
        }),
        None => json!({ "match_all": {} }),
    };

    let mut filtros: Vec<Value> = Vec::new();
    if consulta.somente_ativos {
        filtros.push(json!({ "term": { "ativo": true } }));
    }
    if let Some(id) = consulta.categoria_id {
        filtros.push(json!({ "term": { "categoria_id": id.valor() } }));
    }
    if let Some(marca) = consulta.marca.as_deref() {
        filtros.push(json!({ "term": { "marca": marca } }));
    }
    let mut range = json!({});
    if let Some(min) = consulta.preco_min {
        range["gte"] = json!(min.valor().to_string());
    }
    if let Some(max) = consulta.preco_max {
        range["lte"] = json!(max.valor().to_string());
    }
    if range.as_object().is_some_and(|r| !r.is_empty()) {
        filtros.push(json!({ "range": { "preco": range } }));
    }

    json!({
        "track_total_hits": true,
        "from": consulta.paginacao.offset(),
        "size": consulta.paginacao.limite(),
        "query": { "bool": { "must": [must], "filter": filtros } },
        // relevância primeiro; destaque e recência desempatam
        "sort": ["_score", { "destaque": "desc" }, { "criado_em": "desc" }],
        "_source": false,
        "aggs": {
            "categorias": { "terms": { "field": "categoria_id", "size": 50 } },
            "marcas":     { "terms": { "field": "marca", "size": 50, "missing": "—" } },
            "preco":      { "stats": { "field": "preco" } }
        }
    })
}

fn query_sugestoes(prefixo: &str, limite: u32) -> Value {
    json!({
        "size": limite,
        "query": {
            "bool": {
                "must": [{
                    "multi_match": {
                        "query": prefixo,
                        "type": "bool_prefix",
                        "fields": [
                            "nome.autocomplete",
                            "nome.autocomplete._2gram",
                            "nome.autocomplete._3gram"
                        ]
                    }
                }],
                "filter": [{ "term": { "ativo": true } }],
                "should": [{ "prefix": { "sku": { "value": prefixo, "boost": 3 } } }],
                "minimum_should_match": 0
            }
        },
        "_source": ["nome", "sku"]
    })
}

fn buckets(aggs: &Value, nome: &str) -> Vec<FacetaContagem> {
    aggs[nome]["buckets"]
        .as_array()
        .map(|bs| {
            bs.iter()
                .filter_map(|b| {
                    Some(FacetaContagem {
                        valor: b["key"]
                            .as_i64()
                            .map(|k| k.to_string())
                            .or_else(|| b["key"].as_str().map(str::to_string))?,
                        rotulo: None,
                        contagem: b["doc_count"].as_u64().unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub struct BuscaElastic {
    client: Elasticsearch,
    indice: String,
}

impl BuscaElastic {
    /// Constrói o cliente — URL validada aqui; auth Basic opcional.
    pub fn novo(config: &ConfigBusca) -> Result<Self, elasticsearch::Error> {
        let url = Url::parse(config.url.as_deref().unwrap_or_default())?;
        let pool = SingleNodeConnectionPool::new(url);
        let mut builder = TransportBuilder::new(pool);
        if let (Some(u), Some(p)) = (&config.usuario, &config.senha) {
            builder = builder.auth(Credentials::Basic(u.clone(), p.clone()));
        }
        let transport = builder.build()?;
        Ok(Self {
            client: Elasticsearch::new(transport),
            indice: config.indice_produtos.clone(),
        })
    }

    /// Cria o índice se não existir — idempotente no boot.
    pub async fn garantir_indice(&self) -> Resultado<()> {
        let existe = self
            .client
            .indices()
            .exists(IndicesExistsParts::Index(&[self.indice.as_str()]))
            .send()
            .await
            .map_err(erro_es)?
            .status_code()
            == StatusCode::OK;
        if existe {
            return Ok(());
        }
        let res = self
            .client
            .indices()
            .create(IndicesCreateParts::Index(self.indice.as_str()))
            .body(definicao_indice())
            .send()
            .await
            .map_err(erro_es)?;
        // 400 resource_already_exists = criado por outra réplica — ok.
        if res.status_code() != StatusCode::OK && res.status_code() != StatusCode::BAD_REQUEST {
            res.error_for_status_code().map_err(erro_es)?;
        }
        Ok(())
    }
}

#[async_trait]
impl MotorBusca for BuscaElastic {
    async fn buscar_produtos(&self, consulta: &ConsultaBuscaProdutos) -> Resultado<ResultadoMotor> {
        let res = self
            .client
            .search(SearchParts::Index(&[self.indice.as_str()]))
            .body(query_busca(consulta))
            .send()
            .await
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;
        let body: Value = res.json().await.map_err(erro_es)?;

        let total = body["hits"]["total"]["value"].as_i64().unwrap_or(0);
        let hits = body["hits"]["hits"]
            .as_array()
            .map(|hs| {
                hs.iter()
                    .filter_map(|h| {
                        Some(HitBusca {
                            produto_id: Id::novo(h["_id"].as_str()?.parse().ok()?),
                            score: h["_score"].as_f64().unwrap_or(0.0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let aggs = &body["aggregations"];
        let facetas = Facetas {
            categorias: buckets(aggs, "categorias"),
            marcas: buckets(aggs, "marcas"),
            preco_min: aggs["preco"]["min"]
                .as_f64()
                .and_then(rust_decimal::Decimal::from_f64),
            preco_max: aggs["preco"]["max"]
                .as_f64()
                .and_then(rust_decimal::Decimal::from_f64),
        };

        Ok(ResultadoMotor {
            hits,
            total,
            facetas,
        })
    }

    async fn sugerir_produtos(
        &self,
        prefixo: &str,
        limite: u32,
    ) -> Resultado<Vec<SugestaoProduto>> {
        let res = self
            .client
            .search(SearchParts::Index(&[self.indice.as_str()]))
            .body(query_sugestoes(prefixo, limite))
            .send()
            .await
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;
        let body: Value = res.json().await.map_err(erro_es)?;

        Ok(body["hits"]["hits"]
            .as_array()
            .map(|hs| {
                hs.iter()
                    .filter_map(|h| {
                        Some(SugestaoProduto {
                            produto_id: h["_id"].as_str()?.parse().ok()?,
                            nome: h["_source"]["nome"].as_str()?.to_string(),
                            sku: h["_source"]["sku"].as_str()?.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    async fn indexar_produto(&self, doc: &DocumentoProduto) -> Resultado<()> {
        self.client
            .index(IndexParts::IndexId(
                self.indice.as_str(),
                &doc.produto_id.to_string(),
            ))
            .body(doc)
            .refresh(Refresh::WaitFor)
            .send()
            .await
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;
        Ok(())
    }

    async fn indexar_produtos(&self, docs: &[DocumentoProduto]) -> Resultado<u64> {
        if docs.is_empty() {
            return Ok(0);
        }
        let mut body: Vec<elasticsearch::BulkOperation<Value>> = Vec::with_capacity(docs.len());
        for d in docs {
            body.push(
                BulkOperation::index(serde_json::to_value(d).map_err(erro_ser)?)
                    .id(d.produto_id.to_string())
                    .into(),
            );
        }
        let res = self
            .client
            .bulk(BulkParts::Index(self.indice.as_str()))
            .body(body)
            .refresh(Refresh::WaitFor)
            .send()
            .await
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;
        let res_body: Value = res.json().await.map_err(erro_es)?;

        // Bulk retorna 200 mesmo com itens falhos — conta os que indexaram.
        let mut ok = 0u64;
        for item in res_body["items"].as_array().into_iter().flatten() {
            let status = item["index"]["status"].as_u64().unwrap_or(500);
            if (200..300).contains(&status) {
                ok += 1;
            } else {
                tracing::error!(
                    item = %item,
                    "falha ao indexar documento no bulk"
                );
            }
        }
        Ok(ok)
    }

    async fn remover_produto(
        &self,
        produto_id: Id<hweld_domain::catalogo::produto::Produto>,
    ) -> Resultado<()> {
        let res = self
            .client
            .delete(DeleteParts::IndexId(
                self.indice.as_str(),
                &produto_id.valor().to_string(),
            ))
            .refresh(Refresh::WaitFor)
            .send()
            .await
            .map_err(erro_es)?;
        // 404 = já ausente do índice — idempotente por contrato.
        if res.status_code() == StatusCode::NOT_FOUND {
            return Ok(());
        }
        res.error_for_status_code().map_err(erro_es)?;
        Ok(())
    }

    async fn recriar_indice(&self) -> Resultado<()> {
        let res = self
            .client
            .indices()
            .delete(IndicesDeleteParts::Index(&[self.indice.as_str()]))
            .send()
            .await
            .map_err(erro_es)?;
        // 404 = índice nunca existiu — segue para a criação.
        if res.status_code() != StatusCode::NOT_FOUND {
            res.error_for_status_code().map_err(erro_es)?;
        }
        self.client
            .indices()
            .create(IndicesCreateParts::Index(self.indice.as_str()))
            .body(definicao_indice())
            .send()
            .await
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;
        Ok(())
    }
}
