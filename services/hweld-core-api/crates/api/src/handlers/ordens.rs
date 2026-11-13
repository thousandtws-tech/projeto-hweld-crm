//! Ordens de serviço — CRUD, consumo de material (baixa de estoque) e
//! transições com trilha de histórico imutável.

use crate::erro::Resposta;
use actix_web::{get, patch, post, web, HttpResponse};
use hweld_application::ports::operacao::FiltroOrdensServico;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::operacao::ordem_servico::{
    OrdemServico, OsHistorico, OsItem, PrioridadeOs, StatusOs,
};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use serde::Serialize;

use crate::dto::{ItemOsReq, OrdemServicoReq, QueryOrdens, StatusOsReq};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const OPERACAO: &[Perfil] = &[Perfil::Admin, Perfil::Tecnico];

#[derive(Serialize, utoipa::ToSchema)]
pub struct OsDetalhe {
    pub ordem: OrdemServico,
    pub itens: Vec<OsItem>,
    pub historico: Vec<OsHistorico>,
}

/// Lista ordens de serviço paginado com filtros.
#[utoipa::path(
    get,
    path = "/api/v1/ordens-servico",
    tag = "Ordens de Serviço",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("status" = Option<StatusOs>, Query),
        ("empresa_id" = Option<i64>, Query),
        ("pedido_id" = Option<i64>, Query),
        ("responsavel_id" = Option<i64>, Query),
        ("prioridade" = Option<PrioridadeOs>, Query),
        ("busca" = Option<String>, Query, description = "ILIKE em número, descrição e empresa"),
    ),
    responses(
        (status = 200, body = Pagina<OrdemServico>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/ordens-servico")]
pub async fn listar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryOrdens>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .ordens
        .listar(
            q.pag.paginacao()?,
            FiltroOrdensServico {
                status: q.status,
                empresa_id: q.empresa_id.map(Id::novo),
                pedido_id: q.pedido_id.map(Id::novo),
                responsavel_id: q.responsavel_id.map(Id::novo),
                prioridade: q.prioridade,
                busca: q.busca.clone(),
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// OS + itens consumidos + histórico de status.
#[utoipa::path(
    get,
    path = "/api/v1/ordens-servico/{id}",
    tag = "Ordens de Serviço",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = OsDetalhe),
        (status = 404, description = "ordem não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/ordens-servico/{id}")]
pub async fn buscar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    let (ordem, itens, historico) = state.ordens.buscar_por_ref(&referencia).await?;
    Ok(HttpResponse::Ok().json(OsDetalhe {
        ordem,
        itens,
        historico,
    }))
}

/// Cria ordem de serviço.
#[utoipa::path(
    post,
    path = "/api/v1/ordens-servico",
    tag = "Ordens de Serviço",
    request_body = OrdemServicoReq,
    responses(
        (status = 201, body = OrdemServico),
        (status = 404, description = "empresa/pedido não encontrado"),
        (status = 403, description = "somente admin/técnico"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/ordens-servico")]
pub async fn criar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<OrdemServicoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(OPERACAO)?;
    let os = state
        .ordens
        .criar(body.into_inner().input()?, Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Created().json(os))
}

/// Consome material na OS — baixa de estoque na mesma transação.
#[utoipa::path(
    post,
    path = "/api/v1/ordens-servico/{id}/materiais",
    tag = "Ordens de Serviço",
    params(("id" = i64, Path)),
    request_body = ItemOsReq,
    responses(
        (status = 201, body = OsItem),
        (status = 404, description = "ordem/produto não encontrado"),
        (status = 422, description = "estoque insuficiente ou OS fechada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/ordens-servico/{id}/materiais")]
pub async fn consumir_material(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<ItemOsReq>,
) -> Resposta<HttpResponse> {
    staff.exige(OPERACAO)?;
    let item = state
        .ordens
        .consumir_material(
            Id::novo(*id),
            Id::novo(body.produto_id),
            body.quantidade,
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Created().json(item))
}

/// Transição de status com observação (trilha de histórico imutável).
#[utoipa::path(
    patch,
    path = "/api/v1/ordens-servico/{id}/status",
    tag = "Ordens de Serviço",
    params(("id" = i64, Path)),
    request_body = StatusOsReq,
    responses(
        (status = 200, body = OrdemServico),
        (status = 404, description = "ordem não encontrada"),
        (status = 422, description = "transição de status inválida"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/ordens-servico/{id}/status")]
pub async fn transicionar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<StatusOsReq>,
) -> Resposta<HttpResponse> {
    staff.exige(OPERACAO)?;
    let os = state
        .ordens
        .transicionar(
            Id::novo(*id),
            body.status,
            Some(Id::novo(staff.id())),
            body.observacao.clone(),
        )
        .await?;
    Ok(HttpResponse::Ok().json(os))
}
