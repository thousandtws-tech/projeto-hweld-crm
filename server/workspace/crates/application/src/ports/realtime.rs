//! Port de eventos realtime — a aplicação publica fatos de domínio e a
//! infraestrutura decide o transporte (broadcast in-process → SSE).
//!
//! Publicação é fire-and-forget: ausência de assinantes nunca é erro e um
//! canal lento perde eventos antigos (lagged) em vez de bloquear o fluxo.

use serde::Serialize;
use serde_json::Value;

/// Quem pode receber o evento. O transporte (SSE) filtra por contexto:
/// - `Staff`    — só o backoffice;
/// - `Empresa`  — backoffice + contatos portal daquela empresa;
/// - `Todos`    — backoffice + todos os contatos portal (ex.: catálogo).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Audiencia {
    Staff,
    Empresa(i64),
    Todos,
}

/// Evento publicado no barramento. `tipo` segue `entidade.acao`
/// (ex.: `pedido.criado`, `pedido.status_alterado`).
#[derive(Debug, Clone, Serialize)]
pub struct EventoRealtime {
    pub tipo: &'static str,
    #[serde(skip)]
    pub audiencia: Audiencia,
    pub dados: Value,
}

impl EventoRealtime {
    pub fn novo(tipo: &'static str, audiencia: Audiencia, dados: Value) -> Self {
        Self {
            tipo,
            audiencia,
            dados,
        }
    }
}

/// Port de publicação — use cases recebem `Arc<dyn NotificadorRealtime>`.
pub trait NotificadorRealtime: Send + Sync {
    fn publicar(&self, evento: EventoRealtime);
}
