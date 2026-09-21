//! Consulta à trilha de auditoria — leitura apenas para `Admin`.

use crate::erro::Resposta;
use actix_web::{get, web, HttpResponse};
use hweld_application::ports::auditoria::FiltroAuditoria;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::auditoria::log::LogAuditoria;
use hweld_domain::shared::paginacao::Pagina;

use crate::dto::QueryAuditoria;
use crate::estado::AppState;
use crate::extratores::AuthStaff;

/// Consulta logs de auditoria (append-only) — somente Admin.
#[utoipa::path(
    get,
    path = "/api/v1/auditoria",
    tag = "Auditoria",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("entidade" = Option<String>, Query, description = "ex: pedido, produto, empresa"),
        ("entidade_id" = Option<i64>, Query),
        ("usuario_id" = Option<i64>, Query),
    ),
    responses(
        (status = 200, body = Pagina<LogAuditoria>),
        (status = 403, description = "somente Admin"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/auditoria")]
pub async fn listar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    q: web::Query<QueryAuditoria>,
) -> Resposta<HttpResponse> {
    staff.exige(&[Perfil::Admin])?;
    let pagina = state
        .auditoria
        .listar(
            q.pag.paginacao()?,
            FiltroAuditoria {
                entidade: q.entidade.clone(),
                entidade_id: q.entidade_id,
                usuario_id: q.usuario_id,
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}
