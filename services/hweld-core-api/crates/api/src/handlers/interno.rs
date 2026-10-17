//! Canal interno service-to-service — recebe eventos financeiros/fiscais do
//! `hweld-operations-api` (Java). Autenticação por `X-Service-Token`
//! (`AuthServico`), nunca por JWT de usuário: este endpoint não é público.
//!
//! Entrega at-least-once: a deduplicação por `event_id` está em
//! `ServicoIntegracao` — resposta 202 em todos os casos tratáveis (novo,
//! duplicado, ignorado por estado), reservando 4xx/5xx para envelope
//! inválido ou falha de infraestrutura (que justifica retry do emissor).

use actix_web::{HttpResponse, post, web};
use hweld_application::use_cases::integracao::{EventoFinanceiro, ResultadoEvento};

use crate::erro::Resposta;
use crate::estado::AppState;
use crate::extratores::AuthServico;

/// Evento de integração vindo da outbox do serviço de operações.
/// Não entra no OpenAPI público — contrato interno documentado em
/// `docs/business-operations-architecture.md`.
#[post("/internal/eventos-financeiros")]
pub async fn eventos_financeiros(
    state: web::Data<AppState>,
    _servico: AuthServico,
    body: web::Json<EventoFinanceiro>,
) -> Resposta<HttpResponse> {
    let resultado = state.integracao.processar(body.into_inner()).await?;
    let aceito = !matches!(resultado, ResultadoEvento::Ignorado(_));
    Ok(HttpResponse::Accepted().json(serde_json::json!({
        "aceito": aceito,
        "resultado": resultado.rotulo(),
    })))
}
