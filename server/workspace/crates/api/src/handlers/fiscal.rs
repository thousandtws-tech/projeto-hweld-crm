//! Notas fiscais — emissão a partir do pedido, autorização via gateway e
//! cancelamento (evento fiscal com motivo).

use crate::erro::Resposta;
use actix_web::{get, post, web, HttpResponse};
use hweld_application::ports::fiscal::FiltroNotasFiscais;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::fiscal::nota_fiscal::{NotaFiscal, NotaFiscalItem, StatusNotaFiscal};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use serde::Serialize;

use crate::dto::{CancelarNfReq, EmitirNfReq, QueryNotasFiscais};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const FISCAL: &[Perfil] = &[Perfil::Admin, Perfil::Financeiro];

#[derive(Serialize, utoipa::ToSchema)]
pub struct NotaDetalhe {
    pub nota: NotaFiscal,
    pub itens: Vec<NotaFiscalItem>,
}

/// Lista notas fiscais paginado com filtros.
#[utoipa::path(
    get,
    path = "/api/v1/notas-fiscais",
    tag = "Fiscal",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("status" = Option<StatusNotaFiscal>, Query),
        ("empresa_id" = Option<i64>, Query),
        ("pedido_id" = Option<i64>, Query),
    ),
    responses(
        (status = 200, body = Pagina<NotaFiscal>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/notas-fiscais")]
pub async fn listar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryNotasFiscais>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .notas_fiscais
        .listar(
            q.pag.paginacao()?,
            FiltroNotasFiscais {
                status: q.status,
                empresa_id: q.empresa_id.map(Id::novo),
                pedido_id: q.pedido_id.map(Id::novo),
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Nota fiscal + itens.
#[utoipa::path(
    get,
    path = "/api/v1/notas-fiscais/{id}",
    tag = "Fiscal",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = NotaDetalhe),
        (status = 404, description = "nota não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/notas-fiscais/{id}")]
pub async fn buscar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let (nota, itens) = state.notas_fiscais.buscar(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(NotaDetalhe { nota, itens }))
}

/// Monta a NF a partir do pedido faturável — rascunho até autorizar.
#[utoipa::path(
    post,
    path = "/api/v1/notas-fiscais",
    tag = "Fiscal",
    request_body = EmitirNfReq,
    responses(
        (status = 201, body = NotaFiscal),
        (status = 404, description = "pedido não encontrado"),
        (status = 422, description = "pedido não está faturável"),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/notas-fiscais")]
pub async fn emitir(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<EmitirNfReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FISCAL)?;
    let nf = state
        .notas_fiscais
        .emitir(Id::novo(body.pedido_id), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Created().json(nf))
}

/// Envia ao gateway fiscal — grava chave/protocolo ou marca rejeição.
#[utoipa::path(
    post,
    path = "/api/v1/notas-fiscais/{id}/autorizar",
    tag = "Fiscal",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = NotaFiscal),
        (status = 404, description = "nota não encontrada"),
        (status = 422, description = "nota não autorizável nesse status"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/notas-fiscais/{id}/autorizar")]
pub async fn autorizar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(FISCAL)?;
    let nf = state
        .notas_fiscais
        .autorizar(Id::novo(*id), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Ok().json(nf))
}

/// Cancela nota autorizada — evento fiscal com motivo obrigatório.
#[utoipa::path(
    post,
    path = "/api/v1/notas-fiscais/{id}/cancelar",
    tag = "Fiscal",
    params(("id" = i64, Path)),
    request_body = CancelarNfReq,
    responses(
        (status = 200, body = NotaFiscal),
        (status = 404, description = "nota não encontrada"),
        (status = 422, description = "somente nota autorizada pode ser cancelada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/notas-fiscais/{id}/cancelar")]
pub async fn cancelar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<CancelarNfReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FISCAL)?;
    let nf = state
        .notas_fiscais
        .cancelar(Id::novo(*id), &body.motivo, Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Ok().json(nf))
}
