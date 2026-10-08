//! Realtime via SSE (Server-Sent Events) — push servidor→cliente sobre HTTP/1.1
//! sem WebSocket: reconexão automática, passa por proxies e o cliente decide
//! o `retry`. Duas rotas porque os contextos de token são distintos.
//!
//! O cliente usa `fetch` + `ReadableStream` (não `EventSource`) para enviar o
//! header `Authorization` — token nunca vai na URL nem em query string.

use std::time::Duration;

use crate::erro::Resposta;
use actix_web::web::Bytes;
use actix_web::{get, web, HttpResponse};
use futures::stream::{self, Stream, StreamExt};
use hweld_application::ports::realtime::{Audiencia, EventoRealtime};
use hweld_domain::shared::id::Id;
use hweld_infrastructure::realtime::BroadcasterRealtime;
use serde::Serialize;
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;
use tokio_stream::wrappers::{BroadcastStream, IntervalStream};

use crate::estado::AppState;
use crate::extratores::{AuthPortal, AuthStaff};

/// Keepalive — proxies e LB derrubam conexões inativas; um comentário SSE
/// a cada 15s mantém o stream vivo sem custo.
const HEARTBEAT: Duration = Duration::from_secs(15);

#[derive(Serialize)]
struct Envelope<'a> {
    tipo: &'a str,
    dados: &'a serde_json::Value,
}

fn frame_evento(e: &EventoRealtime) -> Bytes {
    let dados = serde_json::to_string(&Envelope {
        tipo: e.tipo,
        dados: &e.dados,
    })
    .unwrap_or_else(|_| "{}".into());
    Bytes::from(format!("event: {}\ndata: {dados}\n\n", e.tipo))
}

/// Stream SSE: saudação + `retry`, eventos filtrados pela audiência e
/// heartbeat. `Lagged` (assinante lento) vira comentário e segue — o cliente
/// reconcilia via REST se perdeu algo.
fn sse(
    broadcaster: &BroadcasterRealtime,
    audiencia: Audiencia,
) -> impl Stream<Item = Result<Bytes, actix_web::Error>> {
    let aceita = move |e: &EventoRealtime| match (audiencia, e.audiencia) {
        // staff escuta tudo; portal só o que é da própria empresa ou público.
        (Audiencia::Staff, _) => true,
        (Audiencia::Empresa(meu), Audiencia::Empresa(dele)) => meu == dele,
        (Audiencia::Empresa(_), Audiencia::Todos) => true,
        (Audiencia::Empresa(_), Audiencia::Staff) => false,
        (Audiencia::Todos, _) => true,
    };
    let eventos = BroadcastStream::new(broadcaster.assinante()).filter_map(move |r| async move {
        match r {
            Ok(e) if aceita(&e) => Some(Ok(frame_evento(&e))),
            Ok(_) => None,
            Err(BroadcastStreamRecvError::Lagged(_)) => {
                Some(Ok(Bytes::from(": lagged — reconcilie via REST\n\n")))
            }
        }
    });
    let heartbeat = IntervalStream::new(tokio::time::interval(HEARTBEAT))
        .map(|_| Ok(Bytes::from(": ping\n\n")));
    stream::once(async { Ok(Bytes::from(": hweld-realtime\nretry: 3000\n\n")) })
        .chain(stream::select(eventos, heartbeat))
}

fn resposta_sse(broadcaster: &BroadcasterRealtime, audiencia: Audiencia) -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/event-stream")
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("X-Accel-Buffering", "no")) // nginx não deve bufferizar SSE
        .streaming(sse(broadcaster, audiencia))
}

/// Stream do backoffice — recebe todos os eventos.
#[utoipa::path(
    get,
    path = "/api/v1/realtime/staff",
    tag = "Realtime",
    responses(
        (status = 200, description = "stream SSE de eventos (text/event-stream)"),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/realtime/staff")]
pub async fn stream_staff(state: web::Data<AppState>, _staff: AuthStaff) -> Resposta<HttpResponse> {
    Ok(resposta_sse(&state.realtime, Audiencia::Staff))
}

/// Stream do portal — só eventos da empresa do contato ou públicos.
#[utoipa::path(
    get,
    path = "/api/v1/realtime/portal",
    tag = "Realtime",
    responses(
        (status = 200, description = "stream SSE de eventos (text/event-stream)"),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/realtime/portal")]
pub async fn stream_portal(
    state: web::Data<AppState>,
    portal: AuthPortal,
) -> Resposta<HttpResponse> {
    // Resolve o tenant pelo contato — nunca confia em id do cliente.
    let empresa_id = state
        .portal
        .empresa_do_contato(Id::novo(portal.contato_id()))
        .await?;
    Ok(resposta_sse(
        &state.realtime,
        Audiencia::Empresa(empresa_id.valor()),
    ))
}
