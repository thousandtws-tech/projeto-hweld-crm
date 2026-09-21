//! Ports de persistência — módulo fiscal.

use async_trait::async_trait;
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::fiscal::nota_fiscal::{
    NotaFiscal, NotaFiscalItem, StatusNotaFiscal, TipoNotaFiscal,
};
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pedido::Pedido;

use crate::erro::Resultado;
use crate::ports::externos::AutorizacaoFiscal;

#[derive(Debug, Clone)]
pub struct NovaNotaFiscal {
    pub pedido_id: Id<Pedido>,
    pub empresa_id: Id<Empresa>,
    pub tipo: TipoNotaFiscal,
    pub serie: Option<String>,
    pub natureza_operacao: Option<String>,
    pub cfop: Option<String>,
    pub valor_produtos: Dinheiro,
    pub valor_frete: Dinheiro,
    pub valor_desconto: Dinheiro,
    pub valor_total: Dinheiro,
    pub itens: Vec<NovoItemNf>,
}

#[derive(Debug, Clone)]
pub struct NovoItemNf {
    pub produto_id: Option<Id<hweld_domain::catalogo::produto::Produto>>,
    pub codigo: Option<String>,
    pub descricao: Option<String>,
    pub ncm: Option<String>,
    pub cfop: Option<String>,
    pub unidade: Option<String>,
    pub quantidade: Option<rust_decimal::Decimal>,
    pub valor_unitario: Option<Dinheiro>,
    pub valor_total: Option<Dinheiro>,
    pub icms_aliquota: Option<rust_decimal::Decimal>,
    pub icms_valor: Option<Dinheiro>,
    pub ipi_aliquota: Option<rust_decimal::Decimal>,
    pub ipi_valor: Option<Dinheiro>,
    pub pis_valor: Option<Dinheiro>,
    pub cofins_valor: Option<Dinheiro>,
}

#[derive(Debug, Clone, Default)]
pub struct FiltroNotasFiscais {
    pub status: Option<StatusNotaFiscal>,
    pub empresa_id: Option<Id<Empresa>>,
    pub pedido_id: Option<Id<Pedido>>,
}

#[async_trait]
pub trait RepositorioNotasFiscais: Send + Sync {
    async fn buscar_por_id(&self, id: Id<NotaFiscal>) -> Resultado<Option<NotaFiscal>>;
    async fn buscar_itens(&self, nf_id: Id<NotaFiscal>) -> Resultado<Vec<NotaFiscalItem>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroNotasFiscais,
    ) -> Resultado<Pagina<NotaFiscal>>;

    async fn criar(&self, nf: NovaNotaFiscal) -> Resultado<NotaFiscal>;

    async fn registrar_autorizacao(
        &self,
        id: Id<NotaFiscal>,
        autorizacao: &AutorizacaoFiscal,
    ) -> Resultado<NotaFiscal>;

    async fn registrar_status(
        &self,
        id: Id<NotaFiscal>,
        status: StatusNotaFiscal,
    ) -> Resultado<NotaFiscal>;

    async fn cancelar(&self, id: Id<NotaFiscal>, motivo: &str) -> Resultado<NotaFiscal>;
}
