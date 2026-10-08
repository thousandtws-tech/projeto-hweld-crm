//! Barramento realtime in-process sobre `tokio::sync::broadcast`.
//!
//! Single-node: o canal vive no processo do servidor. Em deploy multi-réplica,
//! trocar por um broker (Redis pub/sub, NATS) mantendo o mesmo port
//! `NotificadorRealtime` — os use cases não mudam.

use hweld_application::ports::realtime::{EventoRealtime, NotificadorRealtime};
use tokio::sync::broadcast;

/// Capacidade do anel — assinante lento perde os mais antigos (lagged),
/// o que é o comportamento correto para UI realtime (reconcilia via REST).
const CAPACIDADE: usize = 256;

pub struct BroadcasterRealtime {
    tx: broadcast::Sender<EventoRealtime>,
}

impl BroadcasterRealtime {
    pub fn novo() -> Self {
        let (tx, _) = broadcast::channel(CAPACIDADE);
        Self { tx }
    }

    /// Nova assinatura — usada pelo handler SSE a cada conexão.
    pub fn assinante(&self) -> broadcast::Receiver<EventoRealtime> {
        self.tx.subscribe()
    }
}

impl Default for BroadcasterRealtime {
    fn default() -> Self {
        Self::novo()
    }
}

impl NotificadorRealtime for BroadcasterRealtime {
    fn publicar(&self, evento: EventoRealtime) {
        // Err(SendError) = zero assinantes — esperado, não é falha.
        let _ = self.tx.send(evento);
    }
}
