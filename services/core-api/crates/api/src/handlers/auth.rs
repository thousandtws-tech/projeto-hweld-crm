use crate::erro::Resposta;
use actix_web::{delete, get, post, web, HttpRequest, HttpResponse};
use hweld_application::ports::seguranca::ContextoSessao;
use hweld_application::use_cases::auth::SessaoPortal;
use hweld_domain::acesso::sessao::SessaoAutenticada;
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

#[derive(Serialize, utoipa::ToSchema)]
pub struct SessaoResp {
    pub id: uuid::Uuid,
    pub dispositivo: hweld_domain::acesso::sessao::Dispositivo,
    pub ip: Option<String>,
    pub criado_em: chrono::DateTime<chrono::Utc>,
    pub ultimo_acesso_em: chrono::DateTime<chrono::Utc>,
    /// `true` quando a sessão corresponde à que autenticou este request.
    pub atual: bool,
}

fn sessao_resp(s: SessaoAutenticada, atual: Option<uuid::Uuid>) -> SessaoResp {
    SessaoResp {
        id: s.id,
        dispositivo: s.dispositivo,
        ip: s.ip,
        criado_em: s.criado_em,
        ultimo_acesso_em: s.ultimo_acesso_em,
        atual: atual == Some(s.id),
    }
}

/// Contexto do request (IP + User-Agent) gravado na sessão.
fn ctx_de(req: &HttpRequest) -> ContextoSessao {
    ContextoSessao {
        ip: ip_cliente(req),
        user_agent: req
            .headers()
            .get(actix_web::http::header::USER_AGENT)
            .and_then(|h| h.to_str().ok())
            .map(str::to_string),
    }
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
#[post("/staff/login")]
pub async fn login_staff(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<LoginReq>,
) -> Resposta<HttpResponse> {
    let tokens = state
        .auth
        .login_staff(&body.email, &body.senha, &ctx_de(&req))
        .await?;
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
#[post("/portal/login")]
pub async fn login_portal(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<LoginReq>,
) -> Resposta<HttpResponse> {
    let SessaoPortal { tokens, contato } = state
        .auth
        .login_portal(&body.email, &body.senha, &ctx_de(&req))
        .await?;
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
#[post("/refresh")]
pub async fn refresh(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<RefreshReq>,
) -> Resposta<HttpResponse> {
    let tokens = state
        .auth
        .refresh(&body.refresh_token, &ctx_de(&req))
        .await?;
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
#[post("/logout")]
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
#[post("/senha")]
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

/// Lista as sessões ativas do usuário autenticado ("suas sessões").
/// Cada item traz dispositivo (parse de User-Agent), IP e flag `atual`.
#[utoipa::path(
    get,
    path = "/api/v1/auth/sessoes",
    tag = "Auth",
    responses((status = 200, body = [SessaoResp]), (status = 401, description = "não autenticado")),
    security(("bearer_auth" = [])),
)]
#[get("/sessoes")]
pub async fn sessoes(state: web::Data<AppState>, staff: AuthStaff) -> Resposta<HttpResponse> {
    let atual = staff.sessao_id();
    let itens = state
        .auth
        .sessoes_staff(&staff.0)
        .await?
        .into_iter()
        .map(|s| sessao_resp(s, atual))
        .collect::<Vec<_>>();
    Ok(HttpResponse::Ok().json(itens))
}

/// Encerra uma sessão específica do próprio usuário (todas as linhas da
/// `sessao_id` são revogadas — rotação gera várias linhas por sessão).
#[utoipa::path(
    delete,
    path = "/api/v1/auth/sessoes/{id}",
    tag = "Auth",
    params(("id" = uuid::Uuid, Path, description = "sessao_id da sessão")),
    responses(
        (status = 204, description = "sessão encerrada"),
        (status = 401, description = "não autenticado"),
        (status = 404, description = "sessão não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/sessoes/{id}")]
pub async fn encerrar_sessao(
    state: web::Data<AppState>,
    staff: AuthStaff,
    path: web::Path<uuid::Uuid>,
) -> Resposta<HttpResponse> {
    state
        .auth
        .encerrar_sessao_staff(&staff.0, path.into_inner())
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

/// "Encerrar todas as outras sessões" — preserva a sessão do request atual.
#[utoipa::path(
    post,
    path = "/api/v1/auth/sessoes/encerrar-outras",
    tag = "Auth",
    responses(
        (status = 200, description = "outras sessões encerradas"),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/sessoes/encerrar-outras")]
pub async fn encerrar_outras(
    state: web::Data<AppState>,
    staff: AuthStaff,
) -> Resposta<HttpResponse> {
    let n = state
        .auth
        .encerrar_outras_sessoes(&staff.0, staff.sessao_id())
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "encerradas": n })))
}
