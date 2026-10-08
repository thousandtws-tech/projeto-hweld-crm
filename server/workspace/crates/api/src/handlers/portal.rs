//! Portal B2B — perfil, endereços, categorias e pedidos do contato.
//!
//! Toda rota exige `AuthPortal` (token de contato) e resolve o recurso via
//! `contato.empresa_id` — ids da URL nunca definem o tenant. Falha de posse
//! é sempre 404, nunca 403 (não revela existência do recurso alheio).

use crate::erro::Resposta;
use actix_web::{get, web, HttpResponse};
use hweld_application::use_cases::catalogo::ProdutoDetalhePortal;
use hweld_application::use_cases::portal::{
    EnderecoPortal, MeuPerfilPortal, PedidoDetalhePortal, PedidoResumoPortal,
};
use hweld_domain::catalogo::categoria::Categoria;
use hweld_domain::crm::endereco::TipoEndereco;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use hweld_domain::vendas::pedido::StatusPedido;

use crate::dto::{QueryEnderecos, QueryPortalPedidos};
use crate::estado::AppState;
use crate::extratores::AuthPortal;

/// Perfil do contato autenticado + empresa + tabela de preço vigente.
#[utoipa::path(
    get,
    path = "/api/v1/portal/me",
    tag = "Portal B2B",
    responses(
        (status = 200, body = MeuPerfilPortal),
        (status = 401, description = "não autenticado ou contato inativo"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/me")]
pub async fn me(state: web::Data<AppState>, portal: AuthPortal) -> Resposta<HttpResponse> {
    let perfil = state.portal.me(Id::novo(portal.contato_id())).await?;
    Ok(HttpResponse::Ok().json(perfil))
}

/// Endereços da empresa do contato (filtro opcional por tipo).
#[utoipa::path(
    get,
    path = "/api/v1/portal/enderecos",
    tag = "Portal B2B",
    params(("tipo" = Option<TipoEndereco>, Query, description = "fiscal | entrega | correspondencia")),
    responses(
        (status = 200, body = Vec<EnderecoPortal>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/enderecos")]
pub async fn enderecos(
    state: web::Data<AppState>,
    portal: AuthPortal,
    q: web::Query<QueryEnderecos>,
) -> Resposta<HttpResponse> {
    let lista = state
        .portal
        .enderecos(Id::novo(portal.contato_id()), q.tipo)
        .await?;
    Ok(HttpResponse::Ok().json(lista))
}

/// Categorias ativas — lista flat ordenada; o front monta a árvore.
#[utoipa::path(
    get,
    path = "/api/v1/portal/categorias",
    tag = "Portal B2B",
    responses(
        (status = 200, body = Vec<Categoria>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/categorias")]
pub async fn categorias(state: web::Data<AppState>, portal: AuthPortal) -> Resposta<HttpResponse> {
    let lista = state
        .portal
        .categorias(Id::novo(portal.contato_id()))
        .await?;
    Ok(HttpResponse::Ok().json(lista))
}

/// Detalhe do produto (PDP) — preço efetivo da empresa, imagens e
/// disponibilidade binária. Aceita `{id}`, `{id}-{slug}` ou `{slug}`.
#[utoipa::path(
    get,
    path = "/api/v1/portal/produtos/{referencia}",
    tag = "Portal B2B",
    params(("referencia" = String, Path, description = "id, id-slug ou slug do produto")),
    responses(
        (status = 200, body = ProdutoDetalhePortal),
        (status = 401, description = "não autenticado"),
        (status = 404, description = "produto inexistente ou inativo"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/produtos/{referencia}")]
pub async fn produto(
    state: web::Data<AppState>,
    portal: AuthPortal,
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    let empresa_id = state
        .portal
        .empresa_do_contato(Id::novo(portal.contato_id()))
        .await?;
    let produto = state
        .catalogo_portal
        .produto(empresa_id, &referencia)
        .await?;
    Ok(HttpResponse::Ok().json(produto))
}

/// Pedidos da empresa do contato (visão B2B por empresa; `so_meus=true`
/// restringe aos do próprio contato).
#[utoipa::path(
    get,
    path = "/api/v1/portal/pedidos",
    tag = "Portal B2B",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("status" = Option<StatusPedido>, Query),
        ("so_meus" = Option<bool>, Query, description = "true = só pedidos do contato logado"),
    ),
    responses(
        (status = 200, body = Pagina<PedidoResumoPortal>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/pedidos")]
pub async fn pedidos(
    state: web::Data<AppState>,
    portal: AuthPortal,
    q: web::Query<QueryPortalPedidos>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .portal
        .pedidos(
            Id::novo(portal.contato_id()),
            q.pag.paginacao()?,
            q.status,
            q.so_meus.unwrap_or(false),
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Detalhe do pedido — 404 se não pertencer à empresa do contato.
#[utoipa::path(
    get,
    path = "/api/v1/portal/pedidos/{id}",
    tag = "Portal B2B",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = PedidoDetalhePortal),
        (status = 401, description = "não autenticado"),
        (status = 404, description = "pedido não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/pedidos/{id}")]
pub async fn pedido(
    state: web::Data<AppState>,
    portal: AuthPortal,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let detalhe = state
        .portal
        .pedido(Id::novo(portal.contato_id()), Id::novo(*id))
        .await?;
    Ok(HttpResponse::Ok().json(detalhe))
}
