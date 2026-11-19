use std::collections::HashMap;
use std::sync::Arc;

use hweld_domain::catalogo::preco::preco_efetivo;
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem};
use hweld_domain::catalogo::tabela_preco::TabelaPrecoItem;
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Paginacao;
use serde::Serialize;
use tracing::{error, instrument};

use crate::erro::{ErroApp, Resultado};
use crate::ports::busca::{
    ConsultaBuscaProdutos, DocumentoProduto, Facetas, MotorBusca, OperacaoBusca,
    RepositorioBuscaPendentes, SugestaoProduto,
};
use crate::ports::catalogo::{
    FiltroProdutos, RepositorioCategorias, RepositorioProdutos, RepositorioTabelasPreco,
};
use crate::ports::crm::RepositorioEmpresas;

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct BuscaPaginada<T> {
    pub itens: Vec<T>,
    pub total: i64,
    pub pagina: u32,
    pub por_pagina: u32,
    pub total_paginas: u32,
    pub facetas: Facetas,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correcao: Option<String>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ItemBuscaStaff {
    #[serde(flatten)]
    pub produto: Produto,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ItemBuscaPortal {
    #[serde(flatten)]
    pub produto: crate::use_cases::catalogo::ProdutoPortal,
    pub preco_efetivo: hweld_domain::Dinheiro,
    pub imagens: Vec<ProdutoImagem>,
    pub score: f64,
}

pub struct ServicoBusca {
    motor: Arc<dyn MotorBusca>,
    produtos: Arc<dyn RepositorioProdutos>,
    categorias: Arc<dyn RepositorioCategorias>,
    tabelas: Arc<dyn RepositorioTabelasPreco>,
    empresas: Arc<dyn RepositorioEmpresas>,
    pendentes: Arc<dyn RepositorioBuscaPendentes>,
}

impl ServicoBusca {
    pub fn novo(
        motor: Arc<dyn MotorBusca>,
        produtos: Arc<dyn RepositorioProdutos>,
        categorias: Arc<dyn RepositorioCategorias>,
        tabelas: Arc<dyn RepositorioTabelasPreco>,
        empresas: Arc<dyn RepositorioEmpresas>,
        pendentes: Arc<dyn RepositorioBuscaPendentes>,
    ) -> Self {
        Self {
            motor,
            produtos,
            categorias,
            tabelas,
            empresas,
            pendentes,
        }
    }

    pub async fn reprocessar_pendentes(&self, limite: u32) -> Resultado<u64> {
        let itens = self.pendentes.vencidos(limite).await?;
        if itens.is_empty() {
            return Ok(0);
        }
        let nomes = self.mapa_categorias().await?;
        let mut ok = 0u64;
        for item in itens {
            let resultado: Result<(), ErroApp> = match item.operacao {
                OperacaoBusca::Indexar => match self.produtos.buscar_por_id(item.produto_id).await {
                    Ok(Some(p)) if p.deleted_at.is_none() => {
                        let doc = DocumentoProduto::novo(
                            &p,
                            nomes.get(&p.categoria_id.valor()).cloned(),
                        );
                        self.motor.indexar_produto(&doc).await
                    }
                    _ => Ok(()),
                },
                OperacaoBusca::Remover => self.motor.remover_produto(item.produto_id).await,
            };
            match resultado {
                Ok(()) => {
                    self.pendentes.concluir(item.id).await?;
                    ok += 1;
                }
                Err(e) => {
                    let _ = self.pendentes.falhar(item.id, &e.to_string()).await;
                }
            }
        }
        Ok(ok)
    }

    pub async fn buscar(
        &self,
        mut consulta: ConsultaBuscaProdutos,
    ) -> Resultado<BuscaPaginada<ItemBuscaStaff>> {
        consulta.somente_ativos = false;
        let resultado = self.motor.buscar_produtos(&consulta).await?;
        let produtos = self.hidratar(&resultado.hits).await?;
        let itens = resultado
            .hits
            .iter()
            .filter_map(|h| {
                produtos.get(&h.produto_id).map(|p| ItemBuscaStaff {
                    produto: p.clone(),
                    score: h.score,
                })
            })
            .collect();
        let facetas = self.rotular(resultado.facetas).await?;
        Ok(Self::pagina(
            itens,
            resultado.total,
            consulta.paginacao,
            facetas,
            resultado.correcao,
        ))
    }

    pub async fn buscar_portal(
        &self,
        empresa_id: Option<Id<Empresa>>,
        mut consulta: ConsultaBuscaProdutos,
    ) -> Resultado<BuscaPaginada<ItemBuscaPortal>> {
        let tabela = if let Some(empresa_id) = empresa_id {
            let empresa = self
                .empresas
                .buscar_por_id(empresa_id)
                .await?
                .filter(|e| e.deleted_at.is_none())
                .ok_or_else(|| ErroApp::nao_encontrado("empresa", empresa_id))?;
            match empresa.tabela_preco_id {
                Some(_) => self.tabelas.tabela_da_empresa(empresa_id).await?,
                None => None,
            }
        } else {
            None
        };

        consulta.somente_ativos = true;
        let resultado = self.motor.buscar_produtos(&consulta).await?;
        let produtos = self.hidratar(&resultado.hits).await?;

        let ids: Vec<Id<Produto>> = produtos.keys().copied().collect();
        let todas_imagens = self.produtos.listar_imagens_por_produtos(&ids).await?;
        let mut mapa_imagens: HashMap<Id<Produto>, Vec<ProdutoImagem>> = HashMap::new();
        for img in todas_imagens {
            mapa_imagens.entry(img.produto_id).or_default().push(img);
        }

        let mapa_precos: HashMap<Id<Produto>, &TabelaPrecoItem> = tabela
            .as_ref()
            .map(|(_, itens)| itens.iter().map(|i| (i.produto_id, i)).collect())
            .unwrap_or_default();
        let itens = resultado
            .hits
            .iter()
            .filter_map(|h| {
                let p = produtos.get(&h.produto_id)?;
                if !p.visivel_no_catalogo() {
                    return None;
                }
                let item_tabela = mapa_precos.get(&p.id).copied();
                Some(ItemBuscaPortal {
                    preco_efetivo: preco_efetivo(p, tabela.as_ref().map(|(t, _)| t), item_tabela),
                    produto: crate::use_cases::catalogo::ProdutoPortal::from(p.clone()),
                    imagens: mapa_imagens.remove(&p.id).unwrap_or_default(),
                    score: h.score,
                })
            })
            .collect();

        let facetas = self.rotular(resultado.facetas).await?;
        Ok(Self::pagina(
            itens,
            resultado.total,
            consulta.paginacao,
            facetas,
            resultado.correcao,
        ))
    }

    pub async fn sugerir(&self, prefixo: &str, limite: u32) -> Resultado<Vec<SugestaoProduto>> {
        if prefixo.trim().len() < 2 {
            return Ok(vec![]);
        }
        self.motor.sugerir_produtos(prefixo.trim(), limite).await
    }

    #[instrument(skip(self))]
    pub async fn reindexar(&self) -> Resultado<u64> {
        self.motor.recriar_indice().await?;
        let nomes = self.mapa_categorias().await?;
        let mut indexados = 0u64;
        let mut pagina = 1u32;
        loop {
            let lote = self
                .produtos
                .listar(
                    Paginacao::nova(Some(pagina), Some(100))?,
                    FiltroProdutos::default(),
                )
                .await?;
            if lote.itens.is_empty() {
                break;
            }
            let docs: Vec<DocumentoProduto> = lote
                .itens
                .iter()
                .map(|p| DocumentoProduto::novo(p, nomes.get(&p.categoria_id.valor()).cloned()))
                .collect();
            indexados += self.motor.indexar_produtos(&docs).await?;
            if lote.itens.len() < 100 {
                break;
            }
            pagina += 1;
        }
        Ok(indexados)
    }

    async fn hidratar(
        &self,
        hits: &[crate::ports::busca::HitBusca],
    ) -> Resultado<HashMap<Id<Produto>, Produto>> {
        let ids: Vec<Id<Produto>> = hits.iter().map(|h| h.produto_id).collect();
        let encontrados = self.produtos.buscar_por_ids(&ids).await?;
        Ok(encontrados.into_iter().map(|p| (p.id, p)).collect())
    }
    async fn rotular(&self, mut facetas: Facetas) -> Resultado<Facetas> {
        if facetas.categorias.is_empty() {
            return Ok(facetas);
        }
        let nomes = self.mapa_categorias().await?;
        for f in &mut facetas.categorias {
            if let Ok(id) = f.valor.parse::<i64>() {
                f.rotulo = nomes.get(&id).cloned();
            }
        }
        Ok(facetas)
    }

    async fn mapa_categorias(&self) -> Resultado<HashMap<i64, String>> {
        let todas = self.categorias.listar_todas(false).await?;
        Ok(todas.into_iter().map(|c| (c.id.valor(), c.nome)).collect())
    }

    fn pagina<T>(
        itens: Vec<T>,
        total: i64,
        paginacao: Paginacao,
        facetas: Facetas,
        correcao: Option<String>,
    ) -> BuscaPaginada<T> {
        let total_paginas = if total == 0 {
            0
        } else {
            (total as u64).div_ceil(u64::from(paginacao.por_pagina)) as u32
        };
        BuscaPaginada {
            itens,
            total,
            pagina: paginacao.pagina,
            por_pagina: paginacao.por_pagina,
            total_paginas,
            facetas,
            correcao,
        }
    }
}

pub async fn indexar_best_effort(
    motor: &Option<Arc<dyn MotorBusca>>,
    categorias: &Arc<dyn RepositorioCategorias>,
    pendentes: &Arc<dyn RepositorioBuscaPendentes>,
    produto: &Produto,
) {
    let Some(motor) = motor else { return };
    let nome = match categorias.buscar_por_id(produto.categoria_id).await {
        Ok(Some(c)) => Some(c.nome),
        _ => None,
    };
    let doc = DocumentoProduto::novo(produto, nome);
    if let Err(e) = motor.indexar_produto(&doc).await {
        error!(erro = %e, produto_id = produto.id.valor(), "falha ao indexar produto (busca)");
        if let Err(e2) = pendentes
            .enfileirar(produto.id, OperacaoBusca::Indexar, &e.to_string())
            .await
        {
            error!(erro = %e2, produto_id = produto.id.valor(), "falha ao enfileirar indexação pendente");
        }
    }
}

pub async fn desindexar_best_effort(
    motor: &Option<Arc<dyn MotorBusca>>,
    pendentes: &Arc<dyn RepositorioBuscaPendentes>,
    id: Id<Produto>,
) {
    let Some(motor) = motor else { return };
    if let Err(e) = motor.remover_produto(id).await {
        error!(erro = %e, produto_id = id.valor(), "falha ao remover produto do índice");
        if let Err(e2) = pendentes
            .enfileirar(id, OperacaoBusca::Remover, &e.to_string())
            .await
        {
            error!(erro = %e2, produto_id = id.valor(), "falha ao enfileirar remoção pendente");
        }
    }
}
