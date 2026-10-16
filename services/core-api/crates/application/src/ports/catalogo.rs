//! Ports de persistência — módulo catálogo.

use async_trait::async_trait;
use hweld_domain::catalogo::categoria::{Categoria, CategoriaInput};
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem, ProdutoInput};
use hweld_domain::catalogo::tabela_preco::{TabelaPreco, TabelaPrecoInput, TabelaPrecoItem};
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use uuid::Uuid;

use crate::erro::Resultado;

#[async_trait]
pub trait RepositorioCategorias: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Categoria>) -> Resultado<Option<Categoria>>;
    async fn buscar_por_slug(&self, slug: &str) -> Resultado<Option<Categoria>>;
    async fn listar_todas(&self, somente_ativas: bool) -> Resultado<Vec<Categoria>>;
    async fn criar(&self, input: CategoriaInput) -> Resultado<Categoria>;
    async fn atualizar(&self, id: Id<Categoria>, input: CategoriaInput) -> Resultado<Categoria>;
    async fn definir_ativa(&self, id: Id<Categoria>, ativa: bool) -> Resultado<()>;
    async fn eh_descendente(&self, id: Id<Categoria>, ancestral: Id<Categoria>) -> Resultado<bool>;
}

#[derive(Debug, Clone, Default)]
pub struct FiltroProdutos {
    pub categoria_id: Option<Id<Categoria>>,
    pub busca: Option<String>,
    pub ativo: Option<bool>,
    pub destaque: Option<bool>,
}

#[async_trait]
pub trait RepositorioProdutos: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Produto>) -> Resultado<Option<Produto>>;
    async fn buscar_por_public_id(&self, public_id: Uuid) -> Resultado<Option<Produto>>;
    async fn buscar_por_ids(&self, ids: &[Id<Produto>]) -> Resultado<Vec<Produto>>;
    async fn buscar_por_sku(&self, sku: &str) -> Resultado<Option<Produto>>;
    async fn buscar_por_slug(&self, slug: &str) -> Resultado<Option<Produto>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroProdutos,
    ) -> Resultado<Pagina<Produto>>;
    async fn criar(&self, input: ProdutoInput) -> Resultado<Produto>;
    async fn atualizar(&self, id: Id<Produto>, input: ProdutoInput) -> Resultado<Produto>;
    async fn arquivar(&self, id: Id<Produto>) -> Resultado<()>;

    async fn listar_imagens(&self, produto_id: Id<Produto>) -> Resultado<Vec<ProdutoImagem>>;
    async fn adicionar_imagem(
        &self,
        produto_id: Id<Produto>,
        url: &str,
        alt_text: Option<&str>,
        ordem: i32,
        principal: bool,
    ) -> Resultado<ProdutoImagem>;
    async fn atualizar_imagem(
        &self,
        produto_id: Id<Produto>,
        imagem_id: Id<ProdutoImagem>,
        alt_text: Option<&str>,
        ordem: i32,
        principal: bool,
    ) -> Resultado<ProdutoImagem>;
    async fn remover_imagem(&self, imagem_id: Id<ProdutoImagem>) -> Resultado<()>;
}

#[async_trait]
pub trait RepositorioTabelasPreco: Send + Sync {
    async fn buscar_por_id(&self, id: Id<TabelaPreco>) -> Resultado<Option<TabelaPreco>>;
    async fn buscar_por_public_id(&self, public_id: Uuid) -> Resultado<Option<TabelaPreco>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        ativa: Option<bool>,
    ) -> Resultado<Pagina<TabelaPreco>>;
    async fn criar(&self, input: TabelaPrecoInput) -> Resultado<TabelaPreco>;
    async fn atualizar(
        &self,
        id: Id<TabelaPreco>,
        input: TabelaPrecoInput,
    ) -> Resultado<TabelaPreco>;

    async fn listar_itens(&self, tabela_id: Id<TabelaPreco>) -> Resultado<Vec<TabelaPrecoItem>>;
    async fn definir_preco(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
        preco: Dinheiro,
    ) -> Resultado<TabelaPrecoItem>;
    async fn remover_item(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
    ) -> Resultado<()>;

    async fn tabela_da_empresa(
        &self,
        empresa_id: Id<Empresa>,
    ) -> Resultado<Option<(TabelaPreco, Vec<TabelaPrecoItem>)>>;
}
