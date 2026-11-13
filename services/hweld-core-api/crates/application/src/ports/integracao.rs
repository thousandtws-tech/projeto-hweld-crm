//! Port de persistência — inbox de eventos de integração (`eventos_integracao`).
//!
//! Canal Rust ← hweld-operations-api: eventos financeiros/fiscais entregues
//! pela outbox do serviço Java são ao-menos-uma-vez — a deduplicação é
//! garantida por inserção única do `event_id` antes do processamento.

use async_trait::async_trait;
use uuid::Uuid;

use crate::erro::Resultado;

#[async_trait]
pub trait RepositorioEventosIntegracao: Send + Sync {
    /// Registra o evento como recebido. Retorna `true` quando a inserção
    /// aconteceu (evento novo) e `false` quando já existia (duplicado).
    /// `resultado` registra como o evento foi tratado — útil em auditoria.
    async fn registrar_se_novo(
        &self,
        event_id: Uuid,
        tipo: &str,
        aggregate_id: &str,
        resultado: &str,
    ) -> Resultado<bool>;

    /// Atualiza o resultado após o processamento efetivo.
    async fn marcar_resultado(&self, event_id: Uuid, resultado: &str) -> Resultado<()>;
}
