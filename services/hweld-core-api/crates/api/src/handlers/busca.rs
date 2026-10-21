use actix_web::{get, post, web, HttpResponse};
use hweld_application::ports::busca::SugestaoProduto;
use hweld_application::use_cases::busca::ServicoBusca;
use hweld_application::use_cases::busca::{BuscaPaginada, ItemBuscaPortal, ItemBuscaStaff};
use hweld_application::ErroApp;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::shared::id::Id;
use serde::Serialize;

use crate::dto::{QueryBusca, QuerySugestoes};
use crate::erro::{ErroHttp, Resposta};
use crate::estado::AppState;
use crate::extratores::{AuthPortalOpcional, AuthStaff};

const PODE_REINDEXAR: &[Perfil] = &[Perfil::Admin];

#[derive(Serialize, utoipa::ToSchema)]
pub struct ReindexResultado {
    pub indexados: u64,
}

fn servico(state: &AppState) -> Resposta<&ServicoBusca> {
    state
        .busca
        .as_ref()
        .ok_or_else(|| ErroHttp(ErroApp::Indisponivel("motor de busca")))
}

/// Busca do portal B2B — full-text fuzzy + filtros + facetas, preço efetivo
/// da empresa do contato. Apenas produtos visíveis na vitrine.
#[utoipa::path(
    get,
    path = "/api/v1/portal/busca/produtos",
    tag = "Portal B2B",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("q" = Option<String>, Query, description = "texto livre — fuzzy + relevância"),
        ("categoria_id" = Option<i64>, Query),
        ("marca" = Option<String>, Query),
        ("preco_min" = Option<String>, Query, description = "decimal como string"),
        ("preco_max" = Option<String>, Query, description = "decimal como string"),
        ("ordem" = Option<String>, Query, description = "relevancia|menor_preco|maior_preco|nome_az|recentes"),
    ),
    responses(
        (status = 200, body = BuscaPaginada<ItemBuscaPortal>),
        (status = 401, description = "não autenticado"),
        (status = 503, description = "motor de busca não configurado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/busca/produtos")]
pub async fn buscar_portal(
    state: web::Data<AppState>,
    portal: AuthPortalOpcional,
    q: web::Query<QueryBusca>,
) -> Resposta<HttpResponse> {
    let empresa_id = match portal.contato_id() {
        Some(cid) => state
            .contatos
            .buscar(Id::novo(cid))
            .await
            .ok()
            .map(|c| c.empresa_id),
        None => None,
    };
    let pagina = servico(&state)?
        .buscar_portal(empresa_id, q.consulta()?)
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Autocomplete — sugestões leves (id/nome/sku) a partir de 2 caracteres.
#[utoipa::path(
    get,
    path = "/api/v1/portal/busca/sugestoes",
    tag = "Portal B2B",
    params(
        ("q" = String, Query, description = "prefixo digitado (mínimo 2 chars)"),
        ("limite" = Option<u32>, Query, description = "máx de sugestões (default 8, máx 20)"),
    ),
    responses(
        (status = 200, body = Vec<SugestaoProduto>),
        (status = 503, description = "motor de busca não configurado"),
    ),
)]
#[get("/portal/busca/sugestoes")]
pub async fn sugerir_portal(
    state: web::Data<AppState>,
    _portal: AuthPortalOpcional,
    q: web::Query<QuerySugestoes>,
) -> Resposta<HttpResponse> {
    let sugestoes = servico(&state)?
        .sugerir(&q.q, q.limite.unwrap_or(8).min(20))
        .await?;
    Ok(HttpResponse::Ok().json(sugestoes))
}

/// Busca do backoffice — inclui produtos inativos, preço de catálogo.
#[utoipa::path(
    get,
    path = "/api/v1/busca/produtos",
    tag = "Busca",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("q" = Option<String>, Query, description = "texto livre — fuzzy + relevância"),
        ("categoria_id" = Option<i64>, Query),
        ("marca" = Option<String>, Query),
        ("preco_min" = Option<String>, Query, description = "decimal como string"),
        ("preco_max" = Option<String>, Query, description = "decimal como string"),
    ),
    responses(
        (status = 200, body = BuscaPaginada<ItemBuscaStaff>),
        (status = 401, description = "não autenticado"),
        (status = 503, description = "motor de busca não configurado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/busca/produtos")]
pub async fn buscar_staff(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryBusca>,
) -> Resposta<HttpResponse> {
    let pagina = servico(&state)?.buscar(q.consulta()?).await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Reconstrução completa do índice (Admin) — recria o índice e faz bulk
/// do catálogo inteiro. Repara divergências Postgres↔Elasticsearch.
#[utoipa::path(
    post,
    path = "/api/v1/busca/reindexar",
    tag = "Busca",
    responses(
        (status = 200, body = ReindexResultado),
        (status = 403, description = "somente Admin"),
        (status = 503, description = "motor de busca não configurado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/busca/reindexar")]
pub async fn reindexar(state: web::Data<AppState>, staff: AuthStaff) -> Resposta<HttpResponse> {
    staff.exige(PODE_REINDEXAR)?;
    let indexados = servico(&state)?.reindexar().await?;
    Ok(HttpResponse::Ok().json(ReindexResultado { indexados }))
}
