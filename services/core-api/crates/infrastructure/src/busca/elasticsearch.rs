use async_trait::async_trait;
use elasticsearch::auth::Credentials;
use elasticsearch::http::transport::{SingleNodeConnectionPool, TransportBuilder};
use elasticsearch::http::{StatusCode, Url};
use elasticsearch::indices::{
    IndicesCreateParts, IndicesDeleteParts, IndicesExistsParts, IndicesPutSettingsParts,
    IndicesRefreshParts,
};
use elasticsearch::params::Refresh;
use elasticsearch::{
    BulkOperation, BulkParts, DeleteParts, Elasticsearch, IndexParts, SearchParts,
};
use hweld_application::ports::busca::{
    ConsultaBuscaProdutos, DocumentoProduto, FacetaContagem, Facetas, HitBusca, MotorBusca,
    OrdenacaoBusca, ResultadoMotor, SugestaoProduto,
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
fn definicao_indice() -> Value {
    json!({
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0,
            "analysis": {
                "normalizer": {
                    "minusc": { "type": "custom", "filter": ["lowercase", "fold_pt"] }
                },
                "filter": {
                    "fold_pt": { "type": "asciifolding", "preserve_original": false },
                    "stem_pt": { "type": "stemmer", "language": "brazilian" },
                    "sinonimos_comercio": {
                        "type": "synonym_graph",
                        "synonyms": [
                            "solda, soldagem",
                            "eletrodo, vareta",
                            "mascara de solda, careta de solda",
                            "maquina de solda, inversora de solda",
                            "tocha, antorcha",
                            "epi, equipamento de protecao individual",
                            "cilindro, botija",
                            "esmerilhadeira, lixadeira angular"
                        ]
                    }
                },
                "analyzer": {
                    "texto_pt": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "fold_pt", "stem_pt"]
                    },
                    // sem stemmer — alimenta o did-you-mean com palavras
                    // reais ("eletrodo"), não radicais ("eletrod")
                    "texto_sugestao": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "fold_pt"]
                    },
                    "texto_pt_busca": {
                        "type": "custom",
                        "tokenizer": "standard",
                        "filter": ["lowercase", "fold_pt", "sinonimos_comercio", "stem_pt"]
                    }
                }
            }
        },
        "mappings": {
            "properties": {
                "produto_id":    { "type": "long" },
                "sku":           { "type": "keyword", "normalizer": "minusc" },
                "nome": {
                    "type": "text",
                    "analyzer": "texto_pt",
                    "search_analyzer": "texto_pt_busca",
                    "fields": {
                        "autocomplete": { "type": "search_as_you_type", "analyzer": "texto_pt" },
                        "corrigivel":   { "type": "text", "analyzer": "texto_sugestao" },
                        "keyword":      { "type": "keyword", "ignore_above": 256 }
                    }
                },
                "descricao":      { "type": "text", "analyzer": "texto_pt", "search_analyzer": "texto_pt_busca" },
                "categoria_id":   { "type": "long" },
                "categoria_nome": { "type": "keyword", "normalizer": "minusc" },
                "marca":          { "type": "keyword", "normalizer": "minusc" },
                "preco":          { "type": "scaled_float", "scaling_factor": 100 },
                "ativo":          { "type": "boolean" },
                "destaque":       { "type": "boolean" },
                "criado_em":      { "type": "date" }
            }
        }
    })
}

fn query_busca(consulta: &ConsultaBuscaProdutos) -> Value {
    let q_txt = consulta
        .q
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty());

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

    let consulta_txt = match q_txt {
        Some(q) => json!({
            "bool": {
                "must": [{
                    "multi_match": {
                        "query": q,
                        "type": "best_fields",
                        "fields": ["nome^3", "sku^4", "descricao", "marca^2", "categoria_nome^2"],
                        "fuzziness": "AUTO",
                        "prefix_length": 1,
                        "minimum_should_match": "75%"
                    }
                }],
                "should": [
                    { "term": { "sku": { "value": q, "boost": 10 } } },
                    { "match_phrase": { "nome": { "query": q, "slop": 1, "boost": 4 } } }
                ],
                "filter": filtros
            }
        }),
        None => json!({ "bool": { "must": [{ "match_all": {} }], "filter": filtros } }),
    };

    let consulta_final = json!({
        "function_score": {
            "query": consulta_txt,
            "functions": [
                { "filter": { "term": { "destaque": true } }, "weight": 1.6 },
                { "gauss": { "criado_em": { "origin": "now", "scale": "90d", "decay": 0.5 } } }
            ],
            "score_mode": "sum",
            "boost_mode": "multiply"
        }
    });

    let sort = match consulta.ordenacao {
        OrdenacaoBusca::Relevancia => {
            json!(["_score", { "destaque": "desc" }, { "criado_em": "desc" }])
        }
        OrdenacaoBusca::MenorPreco => {
            json!([{ "preco": "asc" }, { "criado_em": "desc" }])
        }
        OrdenacaoBusca::MaiorPreco => {
            json!([{ "preco": "desc" }, { "criado_em": "desc" }])
        }
        OrdenacaoBusca::NomeAZ => {
            json!([{ "nome.keyword": "asc" }, { "criado_em": "desc" }])
        }
        OrdenacaoBusca::Recentes => json!([{ "criado_em": "desc" }]),
    };

    let mut corpo = json!({
        "track_total_hits": true,
        "from": consulta.paginacao.offset(),
        "size": consulta.paginacao.limite(),
        "query": consulta_final,
        "sort": sort,
        "_source": false,
        "aggs": {
            "categorias": { "terms": { "field": "categoria_id", "size": 50 } },
            "marcas":     { "terms": { "field": "marca", "size": 50, "missing": "—" } },
            "preco":      { "stats": { "field": "preco" } }
        }
    });

    if let Some(q) = q_txt {
        corpo["suggest"] = json!({
            "correcao": {
                "text": q,
                "term": { "field": "nome.corrigivel", "suggest_mode": "popular", "min_word_length": 4 }
            }
        });
    }

    corpo
}

fn correcao_sugerida(body: &Value, consulta: &str) -> Option<String> {
    let entradas = body["suggest"]["correcao"].as_array()?;
    let mut tokens: Vec<String> = Vec::new();
    let mut mudou = false;
    for e in entradas {
        let original = e["text"].as_str()?;
        let melhor = e["options"]
            .as_array()
            .and_then(|o| o.first())
            .and_then(|o| o["text"].as_str());
        match melhor {
            Some(t) if !t.eq_ignore_ascii_case(original) => {
                tokens.push(t.to_string());
                mudou = true;
            }
            _ => tokens.push(original.to_string()),
        }
    }
    let sugestao = tokens.join(" ");
    (mudou && sugestao != consulta).then_some(sugestao)
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
        if res.status_code() != StatusCode::OK && res.status_code() != StatusCode::BAD_REQUEST {
            res.error_for_status_code().map_err(erro_es)?;
        }
        Ok(())
    }

    async fn definir_refresh(&self, intervalo: &str) -> Resultado<()> {
        self.client
            .indices()
            .put_settings(IndicesPutSettingsParts::Index(&[self.indice.as_str()]))
            .body(json!({ "index": { "refresh_interval": intervalo } }))
            .send()
            .await
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;
        Ok(())
    }
}

#[async_trait]
impl MotorBusca for BuscaElastic {
    async fn buscar_produtos(&self, consulta: &ConsultaBuscaProdutos) -> Resultado<ResultadoMotor> {
        let res = self
            .client
            .search(SearchParts::Index(&[self.indice.as_str()]))
            // filtros/aggs são cacheados por shard — mesma combinação
            // de facetas reutiliza resultado sem reexecutar a query.
            .request_cache(true)
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

        let correcao = consulta
            .q
            .as_deref()
            .and_then(|q| correcao_sugerida(&body, q));

        Ok(ResultadoMotor {
            hits,
            total,
            facetas,
            correcao,
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

        self.definir_refresh("-1").await?;

        let mut body: Vec<elasticsearch::BulkOperation<Value>> = Vec::with_capacity(docs.len());
        for d in docs {
            body.push(
                BulkOperation::index(serde_json::to_value(d).map_err(erro_ser)?)
                    .id(d.produto_id.to_string())
                    .into(),
            );
        }
        let res_bulk = self
            .client
            .bulk(BulkParts::Index(self.indice.as_str()))
            .body(body)
            .send()
            .await;

        self.definir_refresh("1s").await?;
        self.client
            .indices()
            .refresh(IndicesRefreshParts::Index(&[self.indice.as_str()]))
            .send()
            .await
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;

        let res = res_bulk
            .map_err(erro_es)?
            .error_for_status_code()
            .map_err(erro_es)?;
        let res_body: Value = res.json().await.map_err(erro_es)?;

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
