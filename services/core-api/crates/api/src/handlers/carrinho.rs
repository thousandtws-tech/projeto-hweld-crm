//! Carrinho + checkout do portal B2B — o dono é sempre o contato autenticado.

use crate::erro::Resposta;
use actix_web::{delete, get, post, put, web, HttpResponse};
use hweld_application::ports::vendas::DonoCarrinho;
use hweld_application::use_cases::carrinho::CarrinhoDetalhe;
use hweld_application::use_cases::portal::PedidoDetalhePortal;
use hweld_domain::shared::id::Id;

use crate::dto::{CheckoutReq, ItemCarrinhoReq};
use crate::estado::AppState;
use crate::extratores::AuthPortal;

async fn dono(state: &AppState, portal: &AuthPortal) -> Resposta<DonoCarrinho> {
    let contato = state.contatos.buscar(Id::novo(portal.contato_id())).await?;
    Ok(DonoCarrinho::Contato {
        contato_id: contato.id,
        empresa_id: Some(contato.empresa_id),
    })
}

/// Carrinho atual do contato autenticado (itens + total).
#[utoipa::path(
    get,
    path = "/api/v1/portal/carrinho",
    tag = "Portal B2B",
    responses(
        (status = 200, body = CarrinhoDetalhe),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/carrinho")]
pub async fn atual(state: web::Data<AppState>, portal: AuthPortal) -> Resposta<HttpResponse> {
    let detalhe = state.carrinho.atual(&dono(&state, &portal).await?).await?;
    Ok(HttpResponse::Ok().json(detalhe))
}

/// Adiciona item ao carrinho (ou soma a quantidade se já existe).
#[utoipa::path(
    post,
    path = "/api/v1/portal/carrinho/itens",
    tag = "Portal B2B",
    request_body = ItemCarrinhoReq,
    responses(
        (status = 200, body = CarrinhoDetalhe),
        (status = 404, description = "produto não encontrado"),
        (status = 422, description = "produto inativo"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/portal/carrinho/itens")]
pub async fn adicionar(
    state: web::Data<AppState>,
    portal: AuthPortal,
    body: web::Json<ItemCarrinhoReq>,
) -> Resposta<HttpResponse> {
    let detalhe = state
        .carrinho
        .adicionar_item(
            &dono(&state, &portal).await?,
            Id::novo(body.produto_id),
            body.quantidade,
        )
        .await?;
    Ok(HttpResponse::Ok().json(detalhe))
}

/// Altera a quantidade de um item do carrinho.
#[utoipa::path(
    put,
    path = "/api/v1/portal/carrinho/itens/{produto_id}",
    tag = "Portal B2B",
    params(("produto_id" = i64, Path)),
    request_body = ItemCarrinhoReq,
    responses(
        (status = 200, body = CarrinhoDetalhe),
        (status = 404, description = "item não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[put("/portal/carrinho/itens/{produto_id}")]
pub async fn atualizar(
    state: web::Data<AppState>,
    portal: AuthPortal,
    produto_id: web::Path<i64>,
    body: web::Json<ItemCarrinhoReq>,
) -> Resposta<HttpResponse> {
    let detalhe = state
        .carrinho
        .atualizar_item(
            &dono(&state, &portal).await?,
            Id::novo(*produto_id),
            body.quantidade,
        )
        .await?;
    Ok(HttpResponse::Ok().json(detalhe))
}

/// Remove item do carrinho.
#[utoipa::path(
    delete,
    path = "/api/v1/portal/carrinho/itens/{produto_id}",
    tag = "Portal B2B",
    params(("produto_id" = i64, Path)),
    responses(
        (status = 200, body = CarrinhoDetalhe),
        (status = 404, description = "item não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/portal/carrinho/itens/{produto_id}")]
pub async fn remover(
    state: web::Data<AppState>,
    portal: AuthPortal,
    produto_id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let detalhe = state
        .carrinho
        .remover_item(&dono(&state, &portal).await?, Id::novo(*produto_id))
        .await?;
    Ok(HttpResponse::Ok().json(detalhe))
}

/// Fluxo A: carrinho → pedido `aguardando_pagamento` (transação única).
/// Responde o detalhe sanitizado do portal — nunca o `Pedido` cru
/// (que carrega ids internos de orçamento/carrinho/vendedor).
#[utoipa::path(
    post,
    path = "/api/v1/portal/checkout",
    tag = "Portal B2B",
    request_body = CheckoutReq,
    responses(
        (status = 201, body = PedidoDetalhePortal),
        (status = 404, description = "endereço não encontrado"),
        (status = 422, description = "carrinho vazio ou regra violada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/portal/checkout")]
pub async fn checkout(
    state: web::Data<AppState>,
    portal: AuthPortal,
    body: web::Json<CheckoutReq>,
) -> Resposta<HttpResponse> {
    let contato_id = Id::novo(portal.contato_id());
    let pedido = state
        .checkout
        .executar(contato_id, body.into_inner().input())
        .await?;
    let detalhe = state.portal.pedido(contato_id, pedido.id).await?;
    Ok(HttpResponse::Created().json(detalhe))
}
