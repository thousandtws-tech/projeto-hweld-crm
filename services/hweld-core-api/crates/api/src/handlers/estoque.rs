//! Estoque — saldo, movimentações (imutáveis), lançamentos manuais e
//! relatório de produtos abaixo do mínimo.

use crate::erro::Resposta;
use actix_web::{get, post, web, HttpResponse};
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::estoque::movimentacao::{EstoqueMovimentacao, EstoqueSaldo};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use serde::Serialize;

use crate::dto::{MovimentacaoReq, QueryAbaixoMinimo, QueryMovimentacoes};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const ESTOQUE: &[Perfil] = &[Perfil::Admin, Perfil::Estoque];

#[derive(Serialize, utoipa::ToSchema)]
pub struct SaldoAbaixoMinimo {
    pub produto: Produto,
    pub saldo: EstoqueSaldo,
}

/// Saldo projetado do produto (disponível = físico − reservado).
#[utoipa::path(
    get,
    path = "/api/v1/estoque/saldo/{produto_id}",
    tag = "Estoque",
    params(("produto_id" = i64, Path)),
    responses(
        (status = 200, body = EstoqueSaldo),
        (status = 404, description = "produto não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/estoque/saldo/{produto_id}")]
pub async fn saldo(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    produto_id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let saldo = state.estoque.saldo(Id::novo(*produto_id)).await?;
    Ok(HttpResponse::Ok().json(saldo))
}

/// Movimentações de estoque (append-only) paginadas.
#[utoipa::path(
    get,
    path = "/api/v1/estoque/movimentacoes",
    tag = "Estoque",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("produto_id" = Option<i64>, Query),
    ),
    responses(
        (status = 200, body = Pagina<EstoqueMovimentacao>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/estoque/movimentacoes")]
pub async fn movimentacoes(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryMovimentacoes>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .estoque
        .movimentacoes(q.pag.paginacao()?, q.produto_id.map(Id::novo))
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Entrada (reposição) ou ajuste (correção com motivo) — reserva/saída só
/// nascem de pedidos e ordens de serviço.
#[utoipa::path(
    post,
    path = "/api/v1/estoque/movimentacoes",
    tag = "Estoque",
    request_body = MovimentacaoReq,
    responses(
        (status = 201, body = EstoqueMovimentacao),
        (status = 404, description = "produto não encontrado"),
        (status = 422, description = "tipo/quantidade inválida"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/estoque/movimentacoes")]
pub async fn lancar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<MovimentacaoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(ESTOQUE)?;
    let mov = state
        .estoque
        .lancar(
            Id::novo(body.produto_id),
            body.tipo,
            body.quantidade,
            body.motivo.clone(),
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Created().json(mov))
}

/// Produtos com saldo disponível abaixo do mínimo configurado.
#[utoipa::path(
    get,
    path = "/api/v1/estoque/abaixo-do-minimo",
    tag = "Estoque",
    params(("limite" = Option<u32>, Query, description = "máx de linhas (default 100)")),
    responses(
        (status = 200, body = Vec<SaldoAbaixoMinimo>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/estoque/abaixo-do-minimo")]
pub async fn abaixo_do_minimo(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryAbaixoMinimo>,
) -> Resposta<HttpResponse> {
    let lista = state
        .estoque
        .abaixo_do_minimo(q.limite.unwrap_or(100))
        .await?;
    Ok(HttpResponse::Ok().json(
        lista
            .into_iter()
            .map(|(produto, s)| SaldoAbaixoMinimo { produto, saldo: s })
            .collect::<Vec<_>>(),
    ))
}
