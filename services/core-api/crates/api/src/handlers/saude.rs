//! Health/readiness — sem auth. `/ready` verifica o pool do Postgres.

use actix_web::{get, web, HttpResponse};
use serde::Serialize;
use sqlx::PgPool;

#[derive(Serialize, utoipa::ToSchema)]
pub struct Saude {
    pub status: &'static str,
    pub versao: &'static str,
}

/// Liveness — processo respondendo.
#[utoipa::path(
    get,
    path = "/health",
    tag = "Saúde",
    responses((status = 200, body = Saude)),
)]
#[get("/health")]
pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(Saude {
        status: "ok",
        versao: env!("CARGO_PKG_VERSION"),
    })
}

/// Readiness — banco acessível. 503 quando o pool não responde.
#[utoipa::path(
    get,
    path = "/ready",
    tag = "Saúde",
    responses(
        (status = 200, body = Saude),
        (status = 503, description = "banco de dados inacessível"),
    ),
)]
#[get("/ready")]
pub async fn ready(pool: web::Data<PgPool>) -> HttpResponse {
    match sqlx::query("SELECT 1").execute(pool.get_ref()).await {
        Ok(_) => HttpResponse::Ok().json(Saude {
            status: "ok",
            versao: env!("CARGO_PKG_VERSION"),
        }),
        Err(e) => {
            tracing::error!(erro = %e, "readiness falhou");
            HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "erro": { "codigo": "indisponivel", "mensagem": "banco de dados inacessível" }
            }))
        }
    }
}
