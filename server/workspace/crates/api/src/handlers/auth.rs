use crate::erro::Resposta;
use actix_web::{post, web, HttpRequest, HttpResponse};
use hweld_application::use_cases::auth::SessaoPortal;
use hweld_domain::shared::id::Id;
use serde::Serialize;

use crate::dto::{LoginReq, RefreshReq, TrocarSenhaReq};
use crate::estado::AppState;
use crate::extratores::{ip_cliente, AuthStaff};

#[derive(Serialize, utoipa::ToSchema)]
pub struct TokensResp {
    pub access_token: String,
    pub token_type: String,
    pub access_expira_em: i64,
    pub refresh_token: String,
    pub refresh_expira_em: i64,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct PortalLoginResp {
    #[serde(flatten)]
    pub tokens: TokensResp,
    pub contato: ContatoResp,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ContatoResp {
    pub id: i64,
    pub nome: String,
    pub empresa_id: i64,
}

fn tokens_resp(p: &hweld_application::ports::seguranca::ParTokens) -> TokensResp {
    TokensResp {
        access_token: p.access_token.clone(),
        token_type: "Bearer".into(),
        access_expira_em: p.access_expira_em,
        refresh_token: p.refresh_token.clone(),
        refresh_expira_em: p.refresh_expira_em,
    }
}

/// Login de usuário interno (staff) — retorna par de tokens JWT.
#[utoipa::path(
    post,
    path = "/api/v1/auth/staff/login",
    tag = "Auth",
    request_body = LoginReq,
    responses(
        (status = 200, body = TokensResp),
        (status = 401, description = "credenciais inválidas"),
    ),
)]
#[post("/auth/staff/login")]
pub async fn login_staff(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<LoginReq>,
) -> Resposta<HttpResponse> {
    let tokens = state.auth.login_staff(&body.email, &body.senha).await?;
    tracing::info!(ip = ?ip_cliente(&req), "login staff");
    Ok(HttpResponse::Ok().json(tokens_resp(&tokens)))
}

/// Login de contato do portal B2B — tokens + dados do contato/empresa.
#[utoipa::path(
    post,
    path = "/api/v1/auth/portal/login",
    tag = "Auth",
    request_body = LoginReq,
    responses(
        (status = 200, body = PortalLoginResp),
        (status = 401, description = "credenciais inválidas"),
    ),
)]
#[post("/auth/portal/login")]
pub async fn login_portal(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<LoginReq>,
) -> Resposta<HttpResponse> {
    let SessaoPortal { tokens, contato } =
        state.auth.login_portal(&body.email, &body.senha).await?;
    tracing::info!(ip = ?ip_cliente(&req), contato = contato.id.valor(), "login portal");
    Ok(HttpResponse::Ok().json(PortalLoginResp {
        tokens: tokens_resp(&tokens),
        contato: ContatoResp {
            id: contato.id.valor(),
            nome: contato.nome,
            empresa_id: contato.empresa_id.valor(),
        },
    }))
}

/// Rotaciona o refresh token — o anterior é revogado.
#[utoipa::path(
    post,
    path = "/api/v1/auth/refresh",
    tag = "Auth",
    request_body = RefreshReq,
    responses(
        (status = 200, body = TokensResp),
        (status = 401, description = "refresh token inválido/expirado/revogado"),
    ),
)]
#[post("/auth/refresh")]
pub async fn refresh(
    state: web::Data<AppState>,
    body: web::Json<RefreshReq>,
) -> Resposta<HttpResponse> {
    let tokens = state.auth.refresh(&body.refresh_token).await?;
    Ok(HttpResponse::Ok().json(tokens_resp(&tokens)))
}

/// Revoga o refresh token (logout).
#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    tag = "Auth",
    request_body = RefreshReq,
    responses((status = 204, description = "sessão encerrada")),
)]
#[post("/auth/logout")]
pub async fn logout(
    state: web::Data<AppState>,
    body: web::Json<RefreshReq>,
) -> Resposta<HttpResponse> {
    state.auth.logout(&body.refresh_token).await?;
    Ok(HttpResponse::NoContent().finish())
}

/// Troca a senha do usuário staff autenticado.
#[utoipa::path(
    post,
    path = "/api/v1/auth/senha",
    tag = "Auth",
    request_body = TrocarSenhaReq,
    responses(
        (status = 204, description = "senha alterada"),
        (status = 401, description = "não autenticado"),
        (status = 422, description = "senha atual incorreta"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/auth/senha")]
pub async fn trocar_senha(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<TrocarSenhaReq>,
) -> Resposta<HttpResponse> {
    state
        .auth
        .trocar_senha_staff(Id::novo(staff.id()), &body.senha_atual, &body.nova_senha)
        .await?;
    Ok(HttpResponse::NoContent().finish())
}
