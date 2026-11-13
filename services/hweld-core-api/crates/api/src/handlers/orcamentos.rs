//! Orçamentos — CRUD, edição de itens, transições de status e conversão em
//! pedido (Fluxo B do modelo).

use crate::erro::Resposta;
use actix_web::{get, patch, post, put, web, HttpResponse};
use hweld_application::ports::crm::FiltroOrcamentos;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::crm::orcamento::{Orcamento, OrcamentoItem, StatusOrcamento};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use hweld_domain::vendas::pedido::Pedido;
use serde::Serialize;

use crate::dto::{ItensOrcamentoReq, OrcamentoReq, QueryOrcamentos, StatusOrcamentoReq};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const VENDAS: &[Perfil] = &[Perfil::Admin, Perfil::Vendedor];

#[derive(Serialize, utoipa::ToSchema)]
pub struct OrcamentoDetalhe {
    pub orcamento: Orcamento,
    pub itens: Vec<OrcamentoItem>,
}

/// Lista orçamentos paginado com filtros.
#[utoipa::path(
    get,
    path = "/api/v1/orcamentos",
    tag = "Orçamentos",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("status" = Option<StatusOrcamento>, Query),
        ("empresa_id" = Option<i64>, Query),
        ("oportunidade_id" = Option<i64>, Query),
        ("vendedor_id" = Option<i64>, Query),
        ("busca" = Option<String>, Query, description = "ILIKE em número e nome da empresa"),
    ),
    responses(
        (status = 200, body = Pagina<Orcamento>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/orcamentos")]
pub async fn listar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryOrcamentos>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .orcamentos
        .listar(
            q.pag.paginacao()?,
            FiltroOrcamentos {
                status: q.status,
                empresa_id: q.empresa_id.map(Id::novo),
                oportunidade_id: q.oportunidade_id.map(Id::novo),
                vendedor_id: q.vendedor_id.map(Id::novo),
                busca: q.busca.clone(),
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Orçamento + itens.
#[utoipa::path(
    get,
    path = "/api/v1/orcamentos/{id}",
    tag = "Orçamentos",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = OrcamentoDetalhe),
        (status = 404, description = "orçamento não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/orcamentos/{id}")]
pub async fn buscar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    let (orcamento, itens) = state.orcamentos.buscar_por_ref(&referencia).await?;
    Ok(HttpResponse::Ok().json(OrcamentoDetalhe { orcamento, itens }))
}

/// Cria orçamento com itens.
#[utoipa::path(
    post,
    path = "/api/v1/orcamentos",
    tag = "Orçamentos",
    request_body = OrcamentoReq,
    responses(
        (status = 201, body = Orcamento),
        (status = 404, description = "empresa/produto não encontrado"),
        (status = 422, description = "regra de negócio violada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/orcamentos")]
pub async fn criar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<OrcamentoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let orcamento = state.orcamentos.criar(body.into_inner().input()?).await?;
    Ok(HttpResponse::Created().json(orcamento))
}

/// Substitui os itens do orçamento (somente em elaboração).
#[utoipa::path(
    put,
    path = "/api/v1/orcamentos/{id}/itens",
    tag = "Orçamentos",
    params(("id" = i64, Path)),
    request_body = ItensOrcamentoReq,
    responses(
        (status = 200, body = Orcamento),
        (status = 404, description = "orçamento não encontrado"),
        (status = 422, description = "orçamento não editável nesse status"),
    ),
    security(("bearer_auth" = [])),
)]
#[put("/orcamentos/{id}/itens")]
pub async fn atualizar_itens(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<ItensOrcamentoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let req = body.into_inner();
    let desconto = hweld_domain::Dinheiro::nao_negativo(req.desconto, "desconto")
        .map_err(hweld_application::ErroApp::Dominio)?;
    let frete = hweld_domain::Dinheiro::nao_negativo(req.frete, "frete")
        .map_err(hweld_application::ErroApp::Dominio)?;
    let itens = req
        .itens
        .into_iter()
        .map(|i| {
            crate::dto::ItemOrcamentoReq {
                produto_id: i.produto_id,
                descricao: i.descricao,
                quantidade: i.quantidade,
                preco_unitario: i.preco_unitario,
                desconto: i.desconto,
            }
            .item()
        })
        .collect::<Result<Vec<_>, _>>()?;
    let orcamento = state
        .orcamentos
        .atualizar_itens(Id::novo(*id), itens, desconto, frete)
        .await?;
    Ok(HttpResponse::Ok().json(orcamento))
}

/// Transição de status do orçamento (enviar/aprovar/rejeitar).
#[utoipa::path(
    patch,
    path = "/api/v1/orcamentos/{id}/status",
    tag = "Orçamentos",
    params(("id" = i64, Path)),
    request_body = StatusOrcamentoReq,
    responses(
        (status = 200, body = Orcamento),
        (status = 404, description = "orçamento não encontrado"),
        (status = 422, description = "transição de status inválida"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/orcamentos/{id}/status")]
pub async fn transicionar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<StatusOrcamentoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let orcamento = state
        .orcamentos
        .transicionar(Id::novo(*id), body.status)
        .await?;
    Ok(HttpResponse::Ok().json(orcamento))
}

/// Orçamento aprovado → pedido aguardando_pagamento (uma única vez).
#[utoipa::path(
    post,
    path = "/api/v1/orcamentos/{id}/converter",
    tag = "Orçamentos",
    params(("id" = i64, Path)),
    responses(
        (status = 201, body = Pedido),
        (status = 404, description = "orçamento não encontrado"),
        (status = 409, description = "orçamento já convertido"),
        (status = 422, description = "orçamento não está aprovado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/orcamentos/{id}/converter")]
pub async fn converter(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let pedido = state
        .orcamentos
        .converter(Id::novo(*id), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Created().json(pedido))
}
