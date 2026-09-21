//! Ports de persistência — módulo estoque.

use async_trait::async_trait;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::estoque::movimentacao::{EstoqueMovimentacao, EstoqueSaldo, MovimentacaoCmd};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::Resultado;

#[async_trait]
pub trait RepositorioEstoque: Send + Sync {
    async fn saldo(&self, produto_id: Id<Produto>) -> Resultado<EstoqueSaldo>;
    async fn saldos(&self, produto_ids: &[Id<Produto>]) -> Resultado<Vec<EstoqueSaldo>>;
    async fn listar_movimentacoes(
        &self,
        paginacao: Paginacao,
        produto_id: Option<Id<Produto>>,
    ) -> Resultado<Pagina<EstoqueMovimentacao>>;

    async fn movimentar(&self, comandos: &[MovimentacaoCmd])
        -> Resultado<Vec<EstoqueMovimentacao>>;

    async fn abaixo_do_minimo(&self, limite: u32) -> Resultado<Vec<(Produto, EstoqueSaldo)>>;
}
