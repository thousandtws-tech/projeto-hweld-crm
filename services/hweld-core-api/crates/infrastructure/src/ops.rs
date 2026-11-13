//! Adapter → `hweld-operations-api` (Java): publicação de eventos de
//! domínio via `POST {url}/api/v1/internal/events` (`X-Service-Token`).
//!
//! Fire-and-forget — espelha `HttpRealtime`: a mutação de negócio nunca
//! espera o serviço irmão; falha vira `warn!` e o fluxo segue (o receptor
//! enfileira na própria outbox e deduplica por `event_id` — re-envio
//! manual/replay é seguro). `OPERATIONS_API_URL` ausente desativa o envio.

use std::time::Duration;

use hweld_application::ports::integracao::{EventoOperacoes, NotificadorOperacoes};
use serde::Serialize;

use crate::config::ConfigIntegracao;

/// Envelope do `InternalEventsController` (Java) — `InboundEvent`.
#[derive(Serialize)]
struct Envelope<'a> {
    #[serde(rename = "eventId")]
    event_id: String,
    #[serde(rename = "eventType")]
    event_type: &'a str,
    #[serde(rename = "eventVersion")]
    event_version: u32,
    #[serde(rename = "aggregateId")]
    aggregate_id: &'a str,
    #[serde(rename = "correlationId")]
    correlation_id: &'a str,
    #[serde(rename = "occurredAt")]
    occurred_at: String,
    payload: &'a serde_json::Value,
}

/// Publicador HTTP para o serviço de operações.
pub struct HttpOps {
    client: reqwest::Client,
    url: Option<String>,
    token: Option<String>,
    timeout: Duration,
}

impl HttpOps {
    pub fn novo(config: &ConfigIntegracao) -> Self {
        Self {
            client: reqwest::Client::new(),
            url: config
                .ops_url
                .as_deref()
                .map(|u| format!("{}/api/v1/internal/events", u.trim_end_matches('/'))),
            token: config.service_token.clone(),
            timeout: Duration::from_millis(500),
        }
    }
}

impl NotificadorOperacoes for HttpOps {
    fn publicar(&self, evento: EventoOperacoes) {
        let (Some(url), Some(token)) = (self.url.clone(), self.token.clone()) else {
            tracing::warn!(
                tipo = evento.tipo,
                "ops: evento descartado (OPERATIONS_API_URL/INTERNAL_SERVICE_TOKEN ausentes)"
            );
            return;
        };

        let tipo = evento.tipo;
        let corpo = Envelope {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type: evento.tipo,
            event_version: 1,
            aggregate_id: &evento.aggregate_id,
            correlation_id: &evento.aggregate_id,
            occurred_at: chrono::Utc::now().to_rfc3339(),
            payload: &evento.payload,
        };
        let Ok(payload) = serde_json::to_vec(&corpo) else {
            tracing::warn!(tipo, "ops: falha ao serializar evento");
            return;
        };

        let client = self.client.clone();
        let timeout = self.timeout;
        // Fire-and-forget: a mutação de negócio nunca espera o serviço irmão.
        tokio::spawn(async move {
            let resultado = tokio::time::timeout(
                timeout,
                client
                    .post(&url)
                    .header("X-Service-Token", token)
                    .header("content-type", "application/json")
                    .body(payload)
                    .send(),
            )
            .await;

            match resultado {
                Ok(Ok(resp)) if resp.status().is_success() => {}
                Ok(Ok(resp)) => tracing::warn!(
                    tipo,
                    status = %resp.status(),
                    "ops: evento recusado pelo serviço"
                ),
                Ok(Err(e)) => tracing::warn!(tipo, erro = %e, "ops: serviço inalcançável"),
                Err(_) => tracing::warn!(tipo, "ops: timeout no envio do evento"),
            }
        });
    }
}
