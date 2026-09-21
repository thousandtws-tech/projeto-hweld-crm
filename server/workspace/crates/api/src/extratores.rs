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

fn extrair_token(req: &HttpRequest, tipo: TipoSujeito) -> Result<SujeitoToken, ErroApp> {
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
    Ok(claims.sujeito)
}

/// Usuário interno autenticado (`usuarios`) — qualquer papel.
pub struct AuthStaff(pub SujeitoToken);

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
}

impl FromRequest for AuthStaff {
    type Error = ErroHttp;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        ready(
            extrair_token(req, TipoSujeito::Staff)
                .map(AuthStaff)
                .map_err(ErroHttp),
        )
    }
}

/// Contato do portal B2B autenticado (`contatos`).
pub struct AuthPortal(pub SujeitoToken);

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
                .map(AuthPortal)
                .map_err(ErroHttp),
        )
    }
}

/// Helper para montar `Id<T>` tipado a partir do sujeito.
pub fn id_de<T>(sujeito: &SujeitoToken) -> hweld_domain::shared::id::Id<T> {
    hweld_domain::shared::id::Id::novo(sujeito.id)
}

/// Extrai o IP do cliente para a trilha de auditoria (X-Forwarded-For ou peer).
pub fn ip_cliente(req: &HttpRequest) -> Option<String> {
    req.headers()
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|s| s.trim().to_string())
        .or_else(|| req.peer_addr().map(|a| a.ip().to_string()))
}

/// Arc tipado do emissor — para testes que montam estado manualmente.
pub fn emissor(state: &AppState) -> Arc<dyn EmissorTokens> {
    state.tokens.clone()
}
