//! Extratores de autenticação — `AuthStaff`/`AuthPortal` implementam
//! `FromRequest`: o token sai do header `Authorization: Bearer`, é validado
//! pelo port `EmissorTokens` e vira `SujeitoToken` tipado.
//! RBAC por papel via `StaffAuth::exige_perfil` — 403 sem revelar existência.

use std::future::{ready, Ready};
use std::sync::Arc;

use actix_web::dev::Payload;
use actix_web::{FromRequest, HttpRequest};
use hweld_application::ports::seguranca::{EmissorTokens, SujeitoToken, TipoSujeito};
use hweld_application::ErroApp;
use hweld_domain::acesso::usuario::Perfil;

use crate::erro::ErroHttp;
use crate::estado::AppState;

fn extrair_token(
    req: &HttpRequest,
    tipo: TipoSujeito,
) -> Result<(SujeitoToken, Option<uuid::Uuid>), ErroApp> {
    let header = req
        .headers()
        .get(actix_web::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| ErroApp::nao_autenticado("credencial ausente"))?;
    let token = header
        .strip_prefix("Bearer ")
        .ok_or_else(|| ErroApp::nao_autenticado("formato esperado: Bearer <token>"))?;

    let state = req
        .app_data::<actix_web::web::Data<AppState>>()
        .ok_or_else(|| ErroApp::proibido("estado da aplicação indisponível"))?;
    let claims = state.tokens.validar_access(token)?;

    if claims.sujeito.tipo != tipo {
        return Err(ErroApp::nao_autenticado("token de outro contexto"));
    }
    Ok((claims.sujeito, claims.sid))
}

/// Usuário interno autenticado (`usuarios`) — qualquer papel.
/// `.1` = `sessao_id` do JWT (sessão que emitiu o access token).
pub struct AuthStaff(pub SujeitoToken, pub Option<uuid::Uuid>);

impl AuthStaff {
    pub fn id(&self) -> i64 {
        self.0.id
    }

    /// RBAC: exige um dos papéis — 403 genérico (não revela se o recurso existe).
    pub fn exige(&self, perfis: &[Perfil]) -> Result<(), ErroApp> {
        match self.0.perfil {
            Some(p) if perfis.contains(&p) => Ok(()),
            _ => Err(ErroApp::proibido("perfil sem permissão para esta operação")),
        }
    }

    pub fn perfil(&self) -> Option<Perfil> {
        self.0.perfil
    }

    /// `sessao_id` do access token — `None` em sessões antigas (pré-coluna).
    pub fn sessao_id(&self) -> Option<uuid::Uuid> {
        self.1
    }
}

impl FromRequest for AuthStaff {
    type Error = ErroHttp;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        ready(
            extrair_token(req, TipoSujeito::Staff)
                .map(|(s, sid)| AuthStaff(s, sid))
                .map_err(ErroHttp),
        )
    }
}

/// Contato do portal B2B autenticado (`contatos`).
pub struct AuthPortal(pub SujeitoToken, pub Option<uuid::Uuid>);

impl AuthPortal {
    pub fn contato_id(&self) -> i64 {
        self.0.id
    }
}

impl FromRequest for AuthPortal {
    type Error = ErroHttp;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        ready(
            extrair_token(req, TipoSujeito::Portal)
                .map(|(s, sid)| AuthPortal(s, sid))
                .map_err(ErroHttp),
        )
    }
}

/// Extrator híbrido para loja pública + B2B:
/// - Se houver `Authorization: Bearer <token>` válido de portal, resolve `Some(AuthPortal)`.
/// - Se não houver token (visitante público), resolve `None` sem retornar 401.
/// - Também extrai `session_id` do header `X-Session-Id` para o carrinho de visitante (`DonoCarrinho::Convidado`).
pub struct AuthPortalOpcional {
    pub portal: Option<AuthPortal>,
    pub session_id: String,
}

impl AuthPortalOpcional {
    pub fn contato_id(&self) -> Option<i64> {
        self.portal.as_ref().map(|p| p.contato_id())
    }
}

impl FromRequest for AuthPortalOpcional {
    type Error = ErroHttp;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let portal = extrair_token(req, TipoSujeito::Portal)
            .ok()
            .map(|(s, sid)| AuthPortal(s, sid));
        let session_id = req
            .headers()
            .get("x-session-id")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty() && s.len() <= 120)
            .or_else(|| ip_cliente(req).map(|ip| format!("guest-{ip}")))
            .unwrap_or_else(|| "guest-anon".to_string());
        ready(Ok(AuthPortalOpcional { portal, session_id }))
    }
}

/// Chamada service-to-service (`hweld-operations-api`) — auth por segredo
/// compartilhado no header `X-Service-Token` (constante `INTERNAL_SERVICE_TOKEN`
/// nos dois lados). Comparação em tempo constante: o token é um segredo
/// simétrico, não um JWT — não há claims a validar.
pub struct AuthServico;

/// Comparação em tempo constante — compartilhada com a `EdgeGuard` (segredo
/// simétrico; equalização de tamanho não pode vazar timing).
pub(crate) fn segredo_confere(recebido: &str, esperado: &str) -> bool {
    let (a, b) = (recebido.as_bytes(), esperado.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

impl FromRequest for AuthServico {
    type Error = ErroHttp;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let Some(state) = req.app_data::<actix_web::web::Data<AppState>>() else {
            return ready(Err(ErroHttp(ErroApp::proibido(
                "estado da aplicação indisponível",
            ))));
        };
        let Some(esperado) = state.token_integracao.as_deref() else {
            return ready(Err(ErroHttp(ErroApp::Indisponivel(
                "integração service-to-service desligada",
            ))));
        };
        let recebido = req
            .headers()
            .get("x-service-token")
            .and_then(|h| h.to_str().ok())
            .unwrap_or_default();
        ready(
            segredo_confere(recebido, esperado)
                .then_some(AuthServico)
                .ok_or_else(|| ErroHttp(ErroApp::nao_autenticado("token de serviço inválido"))),
        )
    }
}

/// Helper para montar `Id<T>` tipado a partir do sujeito.
pub fn id_de<T>(sujeito: &SujeitoToken) -> hweld_domain::shared::id::Id<T> {
    hweld_domain::shared::id::Id::novo(sujeito.id)
}

/// Normaliza loopback/mapeado para exibição amigável ("::1" → "127.0.0.1").
fn normalizar_ip(ip: String) -> String {
    match ip.as_str() {
        "::1" | "0:0:0:0:0:0:0:1" => "127.0.0.1".to_string(),
        s => s.strip_prefix("::ffff:").map(str::to_string).unwrap_or(ip),
    }
}

/// Extrai o IP do cliente para a trilha de auditoria (X-Forwarded-For ou peer).
pub fn ip_cliente(req: &HttpRequest) -> Option<String> {
    req.headers()
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|s| s.trim().to_string())
        .or_else(|| req.peer_addr().map(|a| a.ip().to_string()))
        .map(normalizar_ip)
}

/// Arc tipado do emissor — para testes que montam estado manualmente.
pub fn emissor(state: &AppState) -> Arc<dyn EmissorTokens> {
    state.tokens.clone()
}
