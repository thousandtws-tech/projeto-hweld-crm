//! Ports de persistência — módulo operação (ordens de serviço).

use async_trait::async_trait;
use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::operacao::ordem_servico::{
    OrdemServico, OrdemServicoInput, OsHistorico, OsItem, StatusOs,
};
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use uuid::Uuid;

use crate::erro::Resultado;

#[derive(Debug, Clone, Default)]
pub struct FiltroOrdensServico {
    pub status: Option<StatusOs>,
    pub empresa_id: Option<Id<Empresa>>,
    pub pedido_id: Option<Id<hweld_domain::vendas::pedido::Pedido>>,
    pub responsavel_id: Option<Id<Usuario>>,
}

#[async_trait]
pub trait RepositorioOrdensServico: Send + Sync {
    async fn buscar_por_id(&self, id: Id<OrdemServico>) -> Resultado<Option<OrdemServico>>;
    async fn buscar_por_public_id(&self, public_id: Uuid) -> Resultado<Option<OrdemServico>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOrdensServico,
    ) -> Resultado<Pagina<OrdemServico>>;
    async fn listar_itens(&self, os_id: Id<OrdemServico>) -> Resultado<Vec<OsItem>>;
    async fn listar_historico(&self, os_id: Id<OrdemServico>) -> Resultado<Vec<OsHistorico>>;

    async fn criar(
        &self,
        input: OrdemServicoInput,
        usuario_id: Option<Id<Usuario>>,
    ) -> Resultado<OrdemServico>;

    /// `baixar_estoque` grava movimentação `saida` na mesma transação —
    /// a aplicação decide pelo `controla_estoque` do produto.
    async fn adicionar_item(
        &self,
        os_id: Id<OrdemServico>,
        produto_id: Id<Produto>,
        quantidade: Quantidade,
        preco: Dinheiro,
        baixar_estoque: bool,
        usuario_id: Option<Id<Usuario>>,
    ) -> Resultado<OsItem>;

    async fn transicionar(
        &self,
        id: Id<OrdemServico>,
        novo: StatusOs,
        usuario_id: Option<Id<Usuario>>,
        observacao: Option<&str>,
    ) -> Resultado<OrdemServico>;
}
