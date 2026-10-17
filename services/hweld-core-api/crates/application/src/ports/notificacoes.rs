//! Port de persistência — `notificacoes` (inbox do sino nos dois apps).
//!
//! Toda operação recebe o `DestinoNotificacao` resolvido do token — o
//! repositório nunca lista/marca notificações de outro destinatário.

use async_trait::async_trait;
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::notificacao::{DestinoNotificacao, Notificacao, NotificacaoInput};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::Resultado;

/// Conteúdo de uma notificação a ser entregue (já contextualizado pelo
/// use case de negócio — ele conhece número do pedido, empresa etc.).
#[derive(Debug, Clone)]
pub struct NovaNotificacao {
    pub tipo: &'static str,
    pub titulo: String,
    pub mensagem: String,
    /// Rota interna do frontend de destino (ex.: `/vendas/pedidos/3`).
    pub link: Option<String>,
}

/// Port de envio — os use cases de negócio pedem "notifique X" sem conhecer
/// persistência nem transporte. Implementado por `ServicoNotificacoes`.
/// Best-effort por destinatário: nunca derruba a mutação de origem.
#[async_trait]
pub trait CaixaDeEntrada: Send + Sync {
    /// Todos os usuários staff ativos (ex.: pedido novo do e-commerce).
    async fn notificar_staff(&self, n: NovaNotificacao);
    /// Contatos com acesso ao portal de uma empresa (ex.: pedido mudou).
    async fn notificar_empresa(&self, empresa_id: Id<Empresa>, n: NovaNotificacao);
}

#[async_trait]
pub trait RepositorioNotificacoes: Send + Sync {
    /// Persiste uma notificação para um destinatário (fan-out é do use case).
    async fn criar(&self, input: NotificacaoInput) -> Resultado<Notificacao>;

    /// Inbox do destinatário — mais recentes primeiro, não lidas primeiro.
    async fn listar(
        &self,
        destino: DestinoNotificacao,
        paginacao: Paginacao,
    ) -> Resultado<Pagina<Notificacao>>;

    /// Badge do sino — count autoritativo calculado no servidor.
    async fn nao_lidas(&self, destino: DestinoNotificacao) -> Resultado<i64>;

    /// Marca como lida apenas se a notificação pertence ao destino — 404 se
    /// não pertencer (não revela existência de notificação alheia).
    async fn marcar_lida(&self, id: Id<Notificacao>, destino: DestinoNotificacao) -> Resultado<()>;

    /// Marca todas do destinatário — retorna quantas mudaram de estado.
    async fn marcar_todas_lidas(&self, destino: DestinoNotificacao) -> Resultado<u64>;

    /// Remove uma notificação do destinatário.
    async fn remover(&self, id: Id<Notificacao>, destino: DestinoNotificacao) -> Resultado<()>;

    /// Remove todas as notificações do destinatário.
    async fn remover_todas(&self, destino: DestinoNotificacao) -> Resultado<u64>;
}
