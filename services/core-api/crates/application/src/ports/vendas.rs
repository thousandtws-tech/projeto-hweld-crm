//! Ports de persistência — módulo vendas.
//!
//! Operações multi-escrita expõem comandos atômicos: a aplicação decide
//! (funções puras do domínio) e a infraestrutura garante a atomicidade.

use async_trait::async_trait;
use chrono::NaiveDate;
use uuid::Uuid;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::crm::contato::Contato;
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::crm::endereco::Endereco;
use hweld_domain::crm::orcamento::Orcamento;
use hweld_domain::estoque::movimentacao::MovimentacaoCmd;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::carrinho::{Carrinho, CarrinhoItem, StatusCarrinho};
use hweld_domain::vendas::pagamento::{FormaPagamento, Pagamento, StatusPagamento};
use hweld_domain::vendas::pedido::{
    ItemPedidoNovo, OrigemPedido, Pedido, PedidoItem, StatusPedido,
};

use crate::erro::Resultado;

#[derive(Debug, Clone)]
pub struct NovoPedido {
    pub empresa_id: Id<Empresa>,
    pub contato_id: Id<Contato>,
    pub endereco_faturamento_id: Id<Endereco>,
    pub endereco_entrega_id: Id<Endereco>,
    pub origem: OrigemPedido,
    pub orcamento_id: Option<Id<Orcamento>>,
    pub carrinho_id: Option<Id<Carrinho>>,
    pub vendedor_id: Option<Id<Usuario>>,
    pub subtotal: Dinheiro,
    pub desconto: Dinheiro,
    pub frete: Dinheiro,
    pub total: Dinheiro,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
    pub itens: Vec<ItemPedidoNovo>,
}

#[derive(Debug, Clone)]
pub enum DonoCarrinho {
    Contato {
        contato_id: Id<Contato>,
        empresa_id: Option<Id<Empresa>>,
    },
    Convidado {
        session_id: String,
    },
}

#[async_trait]
pub trait RepositorioCarrinhos: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Carrinho>) -> Resultado<Option<Carrinho>>;
    async fn buscar_por_uuid(&self, uuid: Uuid) -> Resultado<Option<Carrinho>>;
    async fn obter_ou_criar(&self, dono: &DonoCarrinho) -> Resultado<Carrinho>;
    async fn definir_status(&self, id: Id<Carrinho>, status: StatusCarrinho) -> Resultado<()>;

    async fn itens(&self, carrinho_id: Id<Carrinho>) -> Resultado<Vec<CarrinhoItem>>;
    async fn adicionar_item(
        &self,
        carrinho_id: Id<Carrinho>,
        produto_id: Id<Produto>,
        quantidade: rust_decimal::Decimal,
        preco: Dinheiro,
    ) -> Resultado<()>;
    async fn atualizar_item(
        &self,
        carrinho_id: Id<Carrinho>,
        produto_id: Id<Produto>,
        quantidade: rust_decimal::Decimal,
    ) -> Resultado<()>;
    async fn remover_item(
        &self,
        carrinho_id: Id<Carrinho>,
        produto_id: Id<Produto>,
    ) -> Resultado<()>;
    async fn abandonar_inativos(&self, dias: u32) -> Resultado<u64>;
}

#[derive(Debug, Clone, Default)]
pub struct FiltroPedidos {
    /// Lista de status — viabiliza filtros por fase de entrega
    /// (ex.: "a caminho" = enviado; "em preparação" = confirmado..faturado).
    pub statuses: Vec<StatusPedido>,
    pub empresa_id: Option<Id<Empresa>>,
    pub contato_id: Option<Id<Contato>>,
    pub origem: Option<OrigemPedido>,
}

#[async_trait]
pub trait RepositorioPedidos: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Pedido>) -> Resultado<Option<Pedido>>;
    async fn buscar_por_public_id(&self, public_id: Uuid) -> Resultado<Option<Pedido>>;
    async fn buscar_por_numero(&self, numero: &str) -> Resultado<Option<Pedido>>;
    async fn buscar_itens(&self, pedido_id: Id<Pedido>) -> Resultado<Vec<PedidoItem>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroPedidos,
    ) -> Resultado<Pagina<Pedido>>;

    async fn criar_de_carrinho(
        &self,
        pedido: NovoPedido,
        carrinho_id: Id<Carrinho>,
    ) -> Resultado<Pedido>;
    async fn criar_manual(&self, pedido: NovoPedido) -> Resultado<Pedido>;
    async fn transicionar(
        &self,
        id: Id<Pedido>,
        novo: StatusPedido,
        movimentos: &[MovimentacaoCmd],
    ) -> Resultado<Pedido>;
}

#[derive(Debug, Clone, Default)]
pub struct FiltroPagamentos {
    pub pedido_id: Option<Id<Pedido>>,
    pub status: Option<StatusPagamento>,
    pub vencidos_em: Option<NaiveDate>,
}

#[async_trait]
pub trait RepositorioPagamentos: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Pagamento>) -> Resultado<Option<Pagamento>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroPagamentos,
    ) -> Resultado<Pagina<Pagamento>>;
    async fn listar_por_pedido(&self, pedido_id: Id<Pedido>) -> Resultado<Vec<Pagamento>>;
    async fn criar_parcelas(
        &self,
        pedido_id: Id<Pedido>,
        parcelas: Vec<(i32, Dinheiro, NaiveDate)>,
        forma_id: Option<Id<FormaPagamento>>,
    ) -> Resultado<Vec<Pagamento>>;
    async fn baixar(
        &self,
        id: Id<Pagamento>,
        forma_id: Id<FormaPagamento>,
        usuario_id: Option<Id<Usuario>>,
        observacao: Option<&str>,
    ) -> Resultado<Pagamento>;
    async fn estornar(
        &self,
        id: Id<Pagamento>,
        usuario_id: Option<Id<Usuario>>,
        motivo: &str,
    ) -> Resultado<Pagamento>;
    async fn marcar_vencidos(&self, hoje: NaiveDate) -> Resultado<u64>;
}

#[async_trait]
pub trait RepositorioFormasPagamento: Send + Sync {
    async fn buscar_por_id(&self, id: Id<FormaPagamento>) -> Resultado<Option<FormaPagamento>>;
    async fn listar(&self, somente_ativas: bool) -> Resultado<Vec<FormaPagamento>>;
}
