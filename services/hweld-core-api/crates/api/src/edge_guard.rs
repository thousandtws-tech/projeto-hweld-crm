//! Guarda de borda — exige o header `x-edge-token` injetado pelo Worker
//! Cloudflare quando `EDGE_TOKEN` está configurada na origem.
//!
//! Por que: os `*.up.railway.app` são públicos — quem descobrir o hostname
//! bate direto na API sem passar pela edge (sem as políticas do Worker e
//! falando IP real falsificável). Com `EDGE_TOKEN` setada, só o Worker
//! conhece o segredo — requests diretas levam 403.
//!
//! Isentos (auth própria ou probe de infra):
//!   - `/health` e `/ready`      — healthcheck do Railway + smoke pós-deploy;
//!   - `/api/v1/internal/*`      — service-to-service com `X-Service-Token`.
//!
//! Sem `EDGE_TOKEN` (dev local) a guarda fica desligada.

use std::future::{ready, Ready};
use std::rc::Rc;

use actix_web::body::{BoxBody, EitherBody, MessageBody};
use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::{Error, HttpResponse};
use futures::future::LocalBoxFuture;

use crate::extratores::segredo_confere;

const HEADER: &str = "x-edge-token";

/// Auth própria (`/api/v1/internal`) ou probe de infra (`/health`, `/ready`).
fn isento(path: &str) -> bool {
    path == "/health" || path == "/ready" || path.starts_with("/api/v1/internal")
}

pub struct EdgeGuard {
    token: Option<Rc<str>>,
}

impl EdgeGuard {
    /// `None` ou `Some("")` desliga a guarda (dev local).
    pub fn new(token: Option<String>) -> Self {
        Self {
            token: token.and_then(|t| (!t.is_empty()).then(|| Rc::from(t.as_str()))),
        }
    }
}

impl<S, B> Transform<S, ServiceRequest> for EdgeGuard
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<EitherBody<B, BoxBody>>;
    type Error = Error;
    type Transform = EdgeGuardMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(EdgeGuardMiddleware {
            service: Rc::new(service),
            token: self.token.clone(),
        }))
    }
}

pub struct EdgeGuardMiddleware<S> {
    service: Rc<S>,
    token: Option<Rc<str>>,
}

impl<S, B> Service<ServiceRequest> for EdgeGuardMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<EitherBody<B, BoxBody>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let svc = self.service.clone();
        let token = self.token.clone();

        Box::pin(async move {
            // Guarda desligada (dev) ou rota isenta → segue o fluxo.
            let Some(esperado) = token else {
                return Ok(svc.call(req).await?.map_into_left_body());
            };
            if isento(req.path()) {
                return Ok(svc.call(req).await?.map_into_left_body());
            }

            let recebido = req
                .headers()
                .get(HEADER)
                .and_then(|h| h.to_str().ok())
                .unwrap_or_default();

            if segredo_confere(recebido, &esperado) {
                return Ok(svc.call(req).await?.map_into_left_body());
            }

            tracing::warn!(path = %req.path(), "edge guard: request sem token de borda — 403");
            let res = HttpResponse::Forbidden().json(serde_json::json!({
                "erro": {
                    "codigo": "fora_da_borda",
                    "mensagem": "acesso direto à origem não permitido — use a edge",
                }
            }));
            Ok(req.into_response(res).map_into_right_body())
        })
    }
}
