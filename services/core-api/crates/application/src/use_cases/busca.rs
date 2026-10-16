//! Use case de busca — full-text com filtros/facetas (motor) + hidratação
//! dos hits com os dados canônicos do Postgres. ES é índice secundário:
//! a ordem vem dele, a verdade vem do banco relacional.

use std::collections::HashMap;
use std::sync::Arc;

use hweld_domain::catalogo::preco::preco_efetivo;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Paginacao;
use serde::Serialize;
use tracing::{error, instrument};

use crate::erro::{ErroApp, Resultado};
use crate::ports::busca::{
    ConsultaBuscaProdutos, DocumentoProduto, Facetas, MotorBusca, SugestaoProduto,
};
use crate::ports::catalogo::{
    FiltroProdutos, RepositorioCategorias, RepositorioProdutos, RepositorioTabelasPreco,
};
use crate::ports::crm::RepositorioEmpresas;

/// Página de resultados + facetas — envelope único para a API.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct BuscaPaginada<T> {
    pub itens: Vec<T>,
    pub total: i64,
    pub pagina: u32,
    pub por_pagina: u32,
    pub total_paginas: u32,
    pub facetas: Facetas,
    /// Sugestão de correção ortográfica ("você quis dizer?").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correcao: Option<String>,
}

/// Item de busca do backoffice — produto + score de relevância.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ItemBuscaStaff {
    #[serde(flatten)]
    pub produto: Produto,
    pub score: f64,
}

/// Item de busca do portal — `ProdutoPortal` sanitizado (sem `preco_custo`,
/// `estoque_minimo`, `controla_estoque`) + `preco_efetivo` B2B + score.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ItemBuscaPortal {
    #[serde(flatten)]
    pub produto: crate::use_cases::catalogo::ProdutoPortal,
    pub preco_efetivo: hweld_domain::Dinheiro,
    pub score: f64,
}

pub struct ServicoBusca {
    motor: Arc<dyn MotorBusca>,
    produtos: Arc<dyn RepositorioProdutos>,
    categorias: Arc<dyn RepositorioCategorias>,
    tabelas: Arc<dyn RepositorioTabelasPreco>,
    empresas: Arc<dyn RepositorioEmpresas>,
}

impl ServicoBusca {
    pub fn novo(
        motor: Arc<dyn MotorBusca>,
        produtos: Arc<dyn RepositorioProdutos>,
        categorias: Arc<dyn RepositorioCategorias>,
        tabelas: Arc<dyn RepositorioTabelasPreco>,
        empresas: Arc<dyn RepositorioEmpresas>,
    ) -> Self {
        Self {
            motor,
            produtos,
            categorias,
            tabelas,
            empresas,
        }
    }

    /// Busca do backoffice — sem resolução de preço B2B.
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

    /// Busca do portal B2B — apenas produtos visíveis na vitrine, com o
    /// `preco_efetivo` da empresa do contato (tabela dedicada ou venda).
    pub async fn buscar_portal(
        &self,
        empresa_id: Id<Empresa>,
        mut consulta: ConsultaBuscaProdutos,
    ) -> Resultado<BuscaPaginada<ItemBuscaPortal>> {
        let empresa = self
            .empresas
            .buscar_por_id(empresa_id)
            .await?
            .filter(|e| e.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("empresa", empresa_id))?;

        consulta.somente_ativos = true;
        let resultado = self.motor.buscar_produtos(&consulta).await?;
        let produtos = self.hidratar(&resultado.hits).await?;

        let tabela = match empresa.tabela_preco_id {
            Some(_) => self.tabelas.tabela_da_empresa(empresa_id).await?,
            None => None,
        };

        let itens = resultado
            .hits
            .iter()
            .filter_map(|h| {
                let p = produtos.get(&h.produto_id)?;
                if !p.visivel_no_catalogo() {
                    return None;
                }
                let item_tabela = tabela
                    .as_ref()
                    .and_then(|(_, itens)| itens.iter().find(|i| i.produto_id == p.id));
                Some(ItemBuscaPortal {
                    preco_efetivo: preco_efetivo(p, tabela.as_ref().map(|(t, _)| t), item_tabela),
                    produto: crate::use_cases::catalogo::ProdutoPortal::from(p.clone()),
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

    /// Autocomplete — sugestões leves para o dropdown de pesquisa.
    pub async fn sugerir(&self, prefixo: &str, limite: u32) -> Resultado<Vec<SugestaoProduto>> {
        if prefixo.trim().len() < 2 {
            return Ok(vec![]);
        }
        self.motor.sugerir_produtos(prefixo.trim(), limite).await
    }

    /// Reconstrução completa do índice — recria o índice (remove docs
    /// obsoletos) e varre o catálogo em páginas fazendo bulk por lote.
    /// Admin-only, roda sob demanda ou pós-migração.
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

    // ── internos ──────────────────────────────────────────────────────────

    /// Busca os produtos canônicos preservando a ordem de relevância do
    /// motor — hits sem correspondência no banco são descartados (índice
    /// pode estar defasado entre duas escritas).
    async fn hidratar(
        &self,
        hits: &[crate::ports::busca::HitBusca],
    ) -> Resultado<HashMap<Id<Produto>, Produto>> {
        let ids: Vec<Id<Produto>> = hits.iter().map(|h| h.produto_id).collect();
        let encontrados = self.produtos.buscar_por_ids(&ids).await?;
        Ok(encontrados.into_iter().map(|p| (p.id, p)).collect())
    }

    /// Preenche `rotulo` das facetas de categoria com o nome real.
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

/// Indexação best-effort — chamada pós-commit pelo `ServicoProdutos`.
/// Falhas do motor são logadas e nunca propagadas: o Postgres segue como
/// fonte de verdade e `reindexar` repara divergências.
pub async fn indexar_best_effort(
    motor: &Option<Arc<dyn MotorBusca>>,
    categorias: &Arc<dyn RepositorioCategorias>,
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
    }
}

/// Remoção best-effort do índice (produto arquivado).
pub async fn desindexar_best_effort(motor: &Option<Arc<dyn MotorBusca>>, id: Id<Produto>) {
    let Some(motor) = motor else { return };
    if let Err(e) = motor.remover_produto(id).await {
        error!(erro = %e, produto_id = id.valor(), "falha ao remover produto do índice");
    }
}
