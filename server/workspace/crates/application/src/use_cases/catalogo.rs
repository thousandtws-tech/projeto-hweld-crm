use std::sync::Arc;

use hweld_domain::catalogo::categoria::{validar_hierarquia, Categoria, CategoriaInput};
use hweld_domain::catalogo::preco::preco_efetivo;
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem, ProdutoInput};
use hweld_domain::catalogo::tabela_preco::{TabelaPreco, TabelaPrecoInput, TabelaPrecoItem};
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use serde::Serialize;

use crate::erro::{ErroApp, Resultado};
use crate::ports::busca::MotorBusca;
use crate::ports::catalogo::{
    FiltroProdutos, RepositorioCategorias, RepositorioProdutos, RepositorioTabelasPreco,
};
use crate::ports::crm::RepositorioEmpresas;
use crate::use_cases::busca::{desindexar_best_effort, indexar_best_effort};

pub struct ServicoCategorias {
    categorias: Arc<dyn RepositorioCategorias>,
}

impl ServicoCategorias {
    pub fn novo(categorias: Arc<dyn RepositorioCategorias>) -> Self {
        Self { categorias }
    }

    pub async fn listar(&self, somente_ativas: bool) -> Resultado<Vec<Categoria>> {
        self.categorias.listar_todas(somente_ativas).await
    }

    pub async fn criar(&self, input: CategoriaInput) -> Resultado<Categoria> {
        let input = input.validar()?;
        self.garantir_pai(input.categoria_pai_id, None).await?;
        self.categorias.criar(input).await
    }

    pub async fn atualizar(
        &self,
        id: Id<Categoria>,
        input: CategoriaInput,
    ) -> Resultado<Categoria> {
        let input = input.validar()?;
        self.garantir_pai(input.categoria_pai_id, Some(id)).await?;
        self.categorias.atualizar(id, input).await
    }

    async fn garantir_pai(
        &self,
        pai: Option<Id<Categoria>>,
        proprio: Option<Id<Categoria>>,
    ) -> Resultado<()> {
        let Some(pai) = pai else { return Ok(()) };
        validar_hierarquia(proprio, Some(pai))?;
        self.categorias
            .buscar_por_id(pai)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("categoria", pai))?;
        if let Some(proprio) = proprio {
            if self.categorias.eh_descendente(pai, proprio).await? {
                return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                    "categoria pai não pode ser descendente da própria categoria (ciclo)",
                )));
            }
        }
        Ok(())
    }
}

// ── Produtos ────────────────────────────────────────────────────────────────

pub struct ServicoProdutos {
    produtos: Arc<dyn RepositorioProdutos>,
    categorias: Arc<dyn RepositorioCategorias>,
    /// Motor de busca opcional — sincronização best-effort pós-commit.
    busca: Option<Arc<dyn MotorBusca>>,
}

impl ServicoProdutos {
    pub fn novo(
        produtos: Arc<dyn RepositorioProdutos>,
        categorias: Arc<dyn RepositorioCategorias>,
        busca: Option<Arc<dyn MotorBusca>>,
    ) -> Self {
        Self {
            produtos,
            categorias,
            busca,
        }
    }

    pub async fn buscar(&self, id: Id<Produto>) -> Resultado<(Produto, Vec<ProdutoImagem>)> {
        let produto = self
            .produtos
            .buscar_por_id(id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", id))?;
        let imagens = self.produtos.listar_imagens(id).await?;
        Ok((produto, imagens))
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroProdutos,
    ) -> Resultado<Pagina<Produto>> {
        self.produtos.listar(paginacao, filtro).await
    }

    pub async fn criar(&self, input: ProdutoInput) -> Resultado<Produto> {
        let input = input.validar()?;
        self.categorias
            .buscar_por_id(input.categoria_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("categoria", input.categoria_id))?;
        if self.produtos.buscar_por_sku(&input.sku).await?.is_some() {
            return Err(ErroApp::conflito(format!(
                "SKU {} já cadastrado",
                input.sku
            )));
        }
        let produto = self.produtos.criar(input).await?;
        indexar_best_effort(&self.busca, &self.categorias, &produto).await;
        Ok(produto)
    }

    pub async fn atualizar(&self, id: Id<Produto>, input: ProdutoInput) -> Resultado<Produto> {
        let input = input.validar()?;
        let atual = self
            .produtos
            .buscar_por_id(id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", id))?;
        if input.sku != atual.sku && self.produtos.buscar_por_sku(&input.sku).await?.is_some() {
            return Err(ErroApp::conflito(format!(
                "SKU {} já cadastrado",
                input.sku
            )));
        }
        let produto = self.produtos.atualizar(id, input).await?;
        indexar_best_effort(&self.busca, &self.categorias, &produto).await;
        Ok(produto)
    }

    pub async fn arquivar(&self, id: Id<Produto>) -> Resultado<()> {
        self.produtos.arquivar(id).await?;
        desindexar_best_effort(&self.busca, id).await;
        Ok(())
    }
}

// ── Tabelas de preço ────────────────────────────────────────────────────────

pub struct ServicoTabelasPreco {
    tabelas: Arc<dyn RepositorioTabelasPreco>,
    produtos: Arc<dyn RepositorioProdutos>,
}

impl ServicoTabelasPreco {
    pub fn novo(
        tabelas: Arc<dyn RepositorioTabelasPreco>,
        produtos: Arc<dyn RepositorioProdutos>,
    ) -> Self {
        Self { tabelas, produtos }
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        ativa: Option<bool>,
    ) -> Resultado<Pagina<TabelaPreco>> {
        self.tabelas.listar(paginacao, ativa).await
    }

    pub async fn buscar(
        &self,
        id: Id<TabelaPreco>,
    ) -> Resultado<(TabelaPreco, Vec<TabelaPrecoItem>)> {
        let tabela = self
            .tabelas
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("tabela_preco", id))?;
        let itens = self.tabelas.listar_itens(id).await?;
        Ok((tabela, itens))
    }

    pub async fn criar(&self, input: TabelaPrecoInput) -> Resultado<TabelaPreco> {
        self.tabelas.criar(input.validar()?).await
    }

    pub async fn atualizar(
        &self,
        id: Id<TabelaPreco>,
        input: TabelaPrecoInput,
    ) -> Resultado<TabelaPreco> {
        self.tabelas.atualizar(id, input.validar()?).await
    }

    pub async fn definir_preco(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
        preco: Dinheiro,
    ) -> Resultado<TabelaPrecoItem> {
        self.produtos
            .buscar_por_id(produto_id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", produto_id))?;
        self.tabelas
            .definir_preco(tabela_id, produto_id, preco)
            .await
    }

    pub async fn remover_item(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
    ) -> Resultado<()> {
        self.tabelas.remover_item(tabela_id, produto_id).await
    }
}

// ── Vitrine do portal B2B ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ItemCatalogoPortal {
    #[serde(flatten)]
    pub produto: Produto,
    pub preco_efetivo: Dinheiro,
}

pub struct ServicoCatalogoPortal {
    produtos: Arc<dyn RepositorioProdutos>,
    tabelas: Arc<dyn RepositorioTabelasPreco>,
    empresas: Arc<dyn RepositorioEmpresas>,
}

impl ServicoCatalogoPortal {
    pub fn novo(
        produtos: Arc<dyn RepositorioProdutos>,
        tabelas: Arc<dyn RepositorioTabelasPreco>,
        empresas: Arc<dyn RepositorioEmpresas>,
    ) -> Self {
        Self {
            produtos,
            tabelas,
            empresas,
        }
    }

    pub async fn catalogo(
        &self,
        empresa_id: Id<Empresa>,
        paginacao: Paginacao,
        filtro: FiltroProdutos,
    ) -> Resultado<Pagina<ItemCatalogoPortal>> {
        let empresa = self
            .empresas
            .buscar_por_id(empresa_id)
            .await?
            .filter(|e| e.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("empresa", empresa_id))?;

        let pagina = self
            .produtos
            .listar(
                paginacao,
                FiltroProdutos {
                    ativo: Some(true),
                    ..filtro
                },
            )
            .await?;

        let tabela = match empresa.tabela_preco_id {
            Some(_) => self.tabelas.tabela_da_empresa(empresa_id).await?,
            None => None,
        };
        let itens = pagina
            .itens
            .iter()
            .map(|p| {
                let item = tabela
                    .as_ref()
                    .and_then(|(_, itens)| itens.iter().find(|i| i.produto_id == p.id));
                ItemCatalogoPortal {
                    preco_efetivo: preco_efetivo(p, tabela.as_ref().map(|(t, _)| t), item),
                    produto: p.clone(),
                }
            })
            .collect();

        Ok(Pagina::nova(itens, pagina.total, paginacao))
    }
}
