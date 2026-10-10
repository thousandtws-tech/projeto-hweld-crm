//! Adapter realtime → motor dedicado (Elixir/Phoenix em `server/motor-realtime`).
//!
//! O barramento saiu do processo Actix: cada `publicar` vira um POST
//! fire-and-forget para `POST {url}/ingest`, autenticado por
//! `MOTOR_INGEST_TOKEN`. Semântica preservada do broadcast anterior:
//! publicação nunca bloqueia nem falha o caso de uso — se o motor estiver
//! fora, o evento se perde com `warn!` e o cliente reconcilia via REST.
//!
//! Multi-réplica: o PubSub do motor já roda distribuído — o backend pode
//! escalar sem pensar em broadcast entre instâncias.

use std::time::Duration;

use hweld_application::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use serde::Serialize;
use serde_json::Value;

use crate::config::ConfigMotor;

/// Envelope do `POST /ingest` do motor — espelha `Evento.de_params/1`.
#[derive(Serialize)]
struct IngestEvento<'a> {
    tipo: &'a str,
    audiencia: IngestAudiencia,
    dados: &'a Value,
}

#[derive(Serialize)]
struct IngestAudiencia {
    escopo: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    empresa_id: Option<i64>,
}

impl From<Audiencia> for IngestAudiencia {
    fn from(a: Audiencia) -> Self {
        match a {
            Audiencia::Staff => Self { escopo: "staff", empresa_id: None },
            Audiencia::Empresa(id) => Self { escopo: "empresa", empresa_id: Some(id) },
            Audiencia::Todos => Self { escopo: "todos", empresa_id: None },
        }
    }
}

/// Publicador HTTP para o motor realtime.
pub struct HttpRealtime {
    client: reqwest::Client,
    url: String,
    token: Option<String>,
    timeout: Duration,
}

impl HttpRealtime {
    pub fn novo(config: &ConfigMotor) -> Self {
        Self {
            client: reqwest::Client::new(),
            url: format!("{}/ingest", config.url.trim_end_matches('/')),
            token: config.token.clone(),
            timeout: Duration::from_millis(config.timeout_ms),
        }
    }
}

impl NotificadorRealtime for HttpRealtime {
    fn publicar(&self, evento: EventoRealtime) {
        // Sem token configurado o motor não autentica — loga uma vez por
        // evento (warn) e descarta; mesmo comportamento de "zero assinantes".
        let Some(token) = self.token.clone() else {
            tracing::warn!(
                tipo = evento.tipo,
                "realtime descartado: MOTOR_INGEST_TOKEN ausente"
            );
            return;
        };

        let client = self.client.clone();
        let url = self.url.clone();
        let timeout = self.timeout;
        let corpo = IngestEvento {
            tipo: evento.tipo,
            audiencia: evento.audiencia.into(),
            dados: &evento.dados,
        };
        // `corpo` empresta de `evento` — serializa antes do spawn para não
        // carregar a referência para dentro da task.
        let Ok(payload) = serde_json::to_vec(&corpo) else {
            tracing::warn!(tipo = evento.tipo, "realtime: falha ao serializar evento");
            return;
        };
        let tipo = evento.tipo;

        // Fire-and-forget: a mutação de negócio nunca espera o motor.
        tokio::spawn(async move {
            let resultado = tokio::time::timeout(
                timeout,
                client
                    .post(&url)
                    .bearer_auth(token)
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
                    "motor realtime recusou o evento"
                ),
                Ok(Err(e)) => {
                    tracing::warn!(tipo, erro = %e, "motor realtime inalcançável")
                }
                Err(_) => tracing::warn!(tipo, "motor realtime: timeout no ingest"),
            }
        });
    }
}
