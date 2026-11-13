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

/// Port de publicação Rust → hweld-operations-api (Java): eventos de
/// domínio entregues a `POST /api/v1/internal/events` (`X-Service-Token`).
///
/// Fire-and-forget — mesmo contrato do `NotificadorRealtime`: falha de
/// transporte nunca bloqueia nem falha o caso de uso. O receptor enfileira
/// o evento na própria outbox e deduplica por `event_id`, portanto re-envio
/// é seguro e a entrega é ao-menos-uma-vez no melhor caso.
pub trait NotificadorOperacoes: Send + Sync {
    fn publicar(&self, evento: EventoOperacoes);
}

/// Evento de integração emitido para o serviço de operações. `tipo` segue
/// o catálogo `EventTypes` do outro lado (PascalCase — ex.: `OrderCreated`).
#[derive(Debug, Clone)]
pub struct EventoOperacoes {
    pub tipo: &'static str,
    pub aggregate_id: String,
    pub payload: serde_json::Value,
}

impl EventoOperacoes {
    /// `OrderCreated` — alimenta a projeção de pedidos do serviço de
    /// operações (joins/dashboards sem consultar este serviço).
    pub fn pedido_criado(pedido: &hweld_domain::vendas::pedido::Pedido) -> Self {
        Self {
            tipo: "OrderCreated",
            aggregate_id: pedido.id.valor().to_string(),
            payload: serde_json::json!({
                "pedidoId": pedido.id.valor(),
                "publicId": pedido.public_id,
                "numero": pedido.numero,
                "empresaId": pedido.empresa_id.valor(),
                "contatoId": pedido.contato_id.valor(),
                "total": pedido.total,
                "status": pedido.status.to_string(),
                "origem": pedido.origem.to_string(),
                "condicaoPagamento": pedido.condicao_pagamento,
            }),
        }
    }
}
