//! Cache HTTP para GETs — padrão de sistemas de alto tráfego.
//!
//! Toda resposta `GET`/`HEAD` 200 `application/json` sem `Cache-Control`
//! próprio recebe:
//!
//! - `ETag` fraco (`W/"<len>-<hash>"`) do corpo **antes** da compressão —
//!   middleware deve registrar-se *dentro* de `Compress`;
//! - `Cache-Control` por contexto:
//!     - `/api/v1/portal/*` anônimo (sem `Authorization`): `public,
//!       max-age=15, stale-while-revalidate=45` — catálogo/categorias públicos
//!       toleram segundos de stale; o cache interno do repositório já aceita 5s;
//!     - demais GETs (autenticados ou não): `private, no-cache` — o browser
//!       guarda a resposta mas **sempre revalida**, e o ETag transforma a
//!       revalidação num `304` de ~0 bytes;
//! - `Vary: Authorization` — o conteúdo do portal muda por empresa logada;
//!   sem isso um cache compartilhado poderia servir o preço B2B de um tenant
//!   para outro.
//!
//! `If-None-Match` batendo o ETag → `304 Not Modified` com os mesmos headers
//! de validação. Corpos acima de 4 MiB (ou stream sem tamanho que estoure o
//! limite) não recebem ETag — listagens são paginadas, então isso é
//! praticamente inalcançável.

use std::collections::hash_map::DefaultHasher;
use std::future::{ready, Ready};
use std::hash::{Hash, Hasher};
use std::rc::Rc;

use actix_web::body::{to_bytes, BoxBody, EitherBody, MessageBody};
use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::http::header::{
    HeaderValue, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, ETAG, IF_NONE_MATCH, VARY,
};
use actix_web::http::{header, Method, StatusCode};
use actix_web::{Error, HttpResponse};

type LocalBoxFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + 'a>>;

/// Corpos maiores não recebem ETag (sem buffer completo — streamed as-is).
const CORPO_MAX_ETAG: usize = 4 * 1024 * 1024;

pub struct CacheHttp;

impl<S, B> Transform<S, ServiceRequest> for CacheHttp
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<EitherBody<B, BoxBody>>;
    type Error = Error;
    type Transform = CacheHttpMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(CacheHttpMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct CacheHttpMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for CacheHttpMiddleware<S>
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
        let metodo = req.method().clone();
        let if_none_match = req
            .headers()
            .get(IF_NONE_MATCH)
            .and_then(|h| h.to_str().ok())
            .map(str::to_owned);
        let autenticado = req.headers().contains_key(header::AUTHORIZATION);
        let publico_portal = !autenticado && req.path().starts_with("/api/v1/portal/");

        Box::pin(async move {
            let res = svc.call(req).await?;

            let elegivel = matches!(metodo, Method::GET | Method::HEAD)
                && res.status() == StatusCode::OK
                && res
                    .headers()
                    .get(CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .is_some_and(|ct| ct.contains("json"))
                // Handler com política própria (ex.: mídia immutable) prevalece.
                && !res.headers().contains_key(CACHE_CONTROL);

            let grande = res
                .headers()
                .get(CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<usize>().ok())
                .is_some_and(|len| len > CORPO_MAX_ETAG);

            if !elegivel {
                return Ok(res.map_into_left_body());
            }

            let cache_control: &str = if publico_portal {
                "public, max-age=15, stale-while-revalidate=45"
            } else {
                "private, no-cache"
            };

            // Corpo declaradamente grande: política sem ETag, sem buffer.
            if grande {
                let mut res = res;
                inserir_cache(res.headers_mut(), None, cache_control);
                return Ok(res.map_into_left_body());
            }

            let (req, res_http) = res.into_parts();
            let (head, body) = res_http.map_into_boxed_body().into_parts();
            // Coleta o corpo para hash do ETag. Corpos acima do cap com
            // Content-Length conhecido já foram dispensados acima; sem tamanho
            // declarado o corpo é limitado na prática (listagens ≤100 itens).
            let bytes = to_bytes(body).await?;

            let mut hasher = DefaultHasher::new();
            bytes.hash(&mut hasher);
            let etag = format!("W/\"{:x}-{:x}\"", bytes.len(), hasher.finish());

            let revalidado = if_none_match
                .as_deref()
                .is_some_and(|inm| inm.split(',').any(|t| t.trim() == etag || t.trim() == "*"));

            if revalidado {
                let mut res = HttpResponse::NotModified().finish();
                *res.headers_mut() = head.headers().clone();
                inserir_cache(res.headers_mut(), Some(&etag), cache_control);
                Ok(ServiceResponse::new(req, res).map_into_right_body())
            } else {
                let mut head = head;
                inserir_cache(head.headers_mut(), Some(&etag), cache_control);
                let res = head.set_body(bytes).map_into_boxed_body();
                Ok(ServiceResponse::new(req, res).map_into_right_body())
            }
        })
    }
}

/// Insere ETag/Cache-Control e garante `Vary: Authorization` (append).
fn inserir_cache(
    headers: &mut actix_web::http::header::HeaderMap,
    etag: Option<&str>,
    cache_control: &str,
) {
    if let Some(etag) = etag {
        if let Ok(v) = HeaderValue::from_str(etag) {
            headers.insert(ETAG, v);
        }
    }
    if let Ok(v) = HeaderValue::from_str(cache_control) {
        headers.insert(CACHE_CONTROL, v);
    }
    let vary = headers
        .get(VARY)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    if !vary
        .split(',')
        .any(|v| v.trim().eq_ignore_ascii_case("authorization"))
    {
        let novo = if vary.is_empty() {
            "Authorization".to_string()
        } else {
            format!("{vary}, Authorization")
        };
        if let Ok(v) = HeaderValue::from_str(&novo) {
            headers.insert(VARY, v);
        }
    }
}
