//! Inbox de notificações — sino com badge nos dois frontends.
//! Escopo sempre resolvido do token (staff→usuario_id, portal→contato_id):
//! ninguém lê nem marca notificação de outro destinatário.

use actix_web::{get, post, web, HttpResponse};
use hweld_domain::notificacao::DestinoNotificacao;
use hweld_domain::shared::id::Id;
use serde::Serialize;

use crate::dto::QueryPaginacao;
use crate::erro::Resposta;
use crate::estado::AppState;
use crate::extratores::{id_de, AuthPortal, AuthStaff};

#[derive(Serialize, utoipa::ToSchema)]
pub struct NaoLidasResposta {
    pub total: i64,
}

// ── Staff ────────────────────────────────────────────────────────────────────

/// Inbox do usuário staff — paginado, não lidas primeiro.
#[utoipa::path(
    get,
    path = "/api/v1/notificacoes",
    tag = "Notificações",
    params(("pagina" = Option<u32>, Query), ("por_pagina" = Option<u32>, Query)),
    responses(
        (status = 200, description = "página de notificações"),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/notificacoes")]
pub async fn listar_staff(
    state: web::Data<AppState>,
    staff: AuthStaff,
    q: web::Query<QueryPaginacao>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .notificacoes
        .listar(DestinoNotificacao::Staff(id_de(&staff.0)), q.paginacao()?)
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Badge do sino — count autoritativo do servidor.
#[utoipa::path(
    get,
    path = "/api/v1/notificacoes/nao-lidas",
    tag = "Notificações",
    responses(
        (status = 200, body = NaoLidasResposta),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/notificacoes/nao-lidas")]
pub async fn nao_lidas_staff(
    state: web::Data<AppState>,
    staff: AuthStaff,
) -> Resposta<HttpResponse> {
    let total = state
        .notificacoes
        .nao_lidas(DestinoNotificacao::Staff(id_de(&staff.0)))
        .await?;
    Ok(HttpResponse::Ok().json(NaoLidasResposta { total }))
}

/// Marca uma notificação como lida — 404 se não for do usuário.
#[utoipa::path(
    post,
    path = "/api/v1/notificacoes/{id}/lida",
    tag = "Notificações",
    params(("id" = i64, Path)),
    responses(
        (status = 204, description = "marcada como lida"),
        (status = 401, description = "não autenticado"),
        (status = 404, description = "notificação não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/notificacoes/{id}/lida")]
pub async fn marcar_lida_staff(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    state
        .notificacoes
        .marcar_lida(
            Id::novo(id.into_inner()),
            DestinoNotificacao::Staff(id_de(&staff.0)),
        )
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

/// Marca todas as notificações do usuário como lidas.
#[utoipa::path(
    post,
    path = "/api/v1/notificacoes/ler-todas",
    tag = "Notificações",
    responses(
        (status = 200, description = "quantas mudaram de estado"),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/notificacoes/ler-todas")]
pub async fn ler_todas_staff(
    state: web::Data<AppState>,
    staff: AuthStaff,
) -> Resposta<HttpResponse> {
    let atualizadas = state
        .notificacoes
        .marcar_todas(DestinoNotificacao::Staff(id_de(&staff.0)))
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "atualizadas": atualizadas })))
}

// ── Portal B2B ───────────────────────────────────────────────────────────────

/// Inbox do contato do portal — paginado, não lidas primeiro.
#[utoipa::path(
    get,
    path = "/api/v1/portal/notificacoes",
    tag = "Portal B2B",
    params(("pagina" = Option<u32>, Query), ("por_pagina" = Option<u32>, Query)),
    responses(
        (status = 200, description = "página de notificações"),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/notificacoes")]
pub async fn listar_portal(
    state: web::Data<AppState>,
    portal: AuthPortal,
    q: web::Query<QueryPaginacao>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .notificacoes
        .listar(
            DestinoNotificacao::Portal(Id::novo(portal.contato_id())),
            q.paginacao()?,
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Badge do sino do portal — count autoritativo.
#[utoipa::path(
    get,
    path = "/api/v1/portal/notificacoes/nao-lidas",
    tag = "Portal B2B",
    responses(
        (status = 200, body = NaoLidasResposta),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/notificacoes/nao-lidas")]
pub async fn nao_lidas_portal(
    state: web::Data<AppState>,
    portal: AuthPortal,
) -> Resposta<HttpResponse> {
    let total = state
        .notificacoes
        .nao_lidas(DestinoNotificacao::Portal(Id::novo(portal.contato_id())))
        .await?;
    Ok(HttpResponse::Ok().json(NaoLidasResposta { total }))
}

/// Marca uma notificação como lida — 404 se não for do contato.
#[utoipa::path(
    post,
    path = "/api/v1/portal/notificacoes/{id}/lida",
    tag = "Portal B2B",
    params(("id" = i64, Path)),
    responses(
        (status = 204, description = "marcada como lida"),
        (status = 401, description = "não autenticado"),
        (status = 404, description = "notificação não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/portal/notificacoes/{id}/lida")]
pub async fn marcar_lida_portal(
    state: web::Data<AppState>,
    portal: AuthPortal,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    state
        .notificacoes
        .marcar_lida(
            Id::novo(id.into_inner()),
            DestinoNotificacao::Portal(Id::novo(portal.contato_id())),
        )
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

/// Marca todas as notificações do contato como lidas.
#[utoipa::path(
    post,
    path = "/api/v1/portal/notificacoes/ler-todas",
    tag = "Portal B2B",
    responses(
        (status = 200, description = "quantas mudaram de estado"),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/portal/notificacoes/ler-todas")]
pub async fn ler_todas_portal(
    state: web::Data<AppState>,
    portal: AuthPortal,
) -> Resposta<HttpResponse> {
    let atualizadas = state
        .notificacoes
        .marcar_todas(DestinoNotificacao::Portal(Id::novo(portal.contato_id())))
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "atualizadas": atualizadas })))
}
