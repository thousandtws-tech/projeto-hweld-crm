//! Ports de persistência — módulo financeiro (caixa).

use async_trait::async_trait;
use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::financeiro::caixa::{Caixa, CaixaMovimentacao, TipoCaixaMovimentacao};
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pagamento::{FormaPagamento, Pagamento};

use crate::erro::Resultado;

/// Comando de lançamento no caixa — agrupa os parâmetros da movimentação
/// para manter a assinatura do port legível e estável.
#[derive(Debug, Clone)]
pub struct MovimentarCaixaCmd {
    pub caixa_id: Id<Caixa>,
    pub tipo: TipoCaixaMovimentacao,
    pub valor: Dinheiro,
    pub forma_id: Option<Id<FormaPagamento>>,
    pub pagamento_id: Option<Id<Pagamento>>,
    pub usuario_id: Option<Id<Usuario>>,
    pub descricao: Option<String>,
}

#[async_trait]
pub trait RepositorioCaixas: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Caixa>) -> Resultado<Option<Caixa>>;
    async fn buscar_aberto(&self) -> Resultado<Option<Caixa>>;
    async fn listar(&self, paginacao: Paginacao) -> Resultado<Pagina<Caixa>>;
    async fn movimentacoes(&self, caixa_id: Id<Caixa>) -> Resultado<Vec<CaixaMovimentacao>>;

    async fn abrir(&self, aberto_por: Id<Usuario>, valor_abertura: Dinheiro) -> Resultado<Caixa>;

    async fn movimentar(&self, cmd: MovimentarCaixaCmd) -> Resultado<CaixaMovimentacao>;

    async fn fechar(
        &self,
        id: Id<Caixa>,
        fechado_por: Id<Usuario>,
        valor_informado: Dinheiro,
    ) -> Resultado<Caixa>;
}
