//! Telemetria de frontend — Web Vitals.
//!
//! `POST /api/v1/telemetria/vitals` recebe beacons (`navigator.sendBeacon`,
//! content-type `text/plain` ou `application/json`) dos dois apps públicos
//! (painel-admin e web B2B) e loga estruturado para o agregador (Loki,
//! `tracing` já em JSON em prod). Sem auth: a página que emite pode ser
//! anônima (checkout B2B) e o beacon não carrega credenciais — payload é
//! limitado a campos numéricos conhecidos, nada de dados do usuário.

use actix_web::{post, web, HttpResponse};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VitalsPayload {
    /// Nome da métrica: LCP, INP, CLS, FCP, TTFB.
    pub name: String,
    /// Valor reportado (ms, ou score adimensional p/ CLS).
    pub value: f64,
    /// good | needs-improvement | poor.
    #[serde(default)]
    pub rating: Option<String>,
    /// ID do report (dedup leve no agregador, se precisar).
    #[serde(default)]
    pub id: Option<String>,
    /// Caminho da página (`location.pathname`) — ajuda a achar telas lentas.
    #[serde(default)]
    pub path: Option<String>,
    /// App emissor: `painel` | `web`.
    #[serde(default)]
    pub app: Option<String>,
    /// Delta desde o report anterior (web-vitals manda no `onReport`).
    #[serde(default)]
    pub delta: Option<f64>,
}

/// Aceita `application/json` e `text/plain` — `navigator.sendBeacon` com
/// `Blob` tipado funciona, mas o fallback sem tipo chega como text/plain.
#[post("/telemetria/vitals")]
pub async fn vitals(body: web::Bytes) -> HttpResponse {
    let p: VitalsPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(_) => return HttpResponse::UnprocessableEntity().finish(),
    };
    // Sanitização mínima: nomes longos/path arbitrário são truncados no log.
    let name: String = p.name.chars().take(16).collect();
    let path = p.path.map(|s| s.chars().take(200).collect::<String>());
    tracing::info!(
        target: "web_vitals",
        metric = %name,
        value = p.value,
        rating = p.rating.as_deref().unwrap_or(""),
        report_id = p.id.as_deref().unwrap_or(""),
        app = p.app.as_deref().unwrap_or(""),
        path = path.as_deref().unwrap_or(""),
        delta = p.delta.unwrap_or(f64::NAN),
        "web vital",
    );
    HttpResponse::NoContent().finish()
}
