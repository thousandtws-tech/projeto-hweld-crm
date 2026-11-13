//! Pedidos — consulta, criação manual (balcão) e transições de status.
//! Estoque reserva/baixa acontece dentro do caso de uso, em transação única.

use crate::erro::Resposta;
use actix_web::{get, patch, post, web, HttpResponse};
use hweld_application::ports::vendas::{FiltroPedidos, NovoPedido};
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::crm::orcamento::calcular_totais;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use hweld_domain::vendas::pedido::{OrigemPedido, Pedido, PedidoItem};
use hweld_domain::Dinheiro;
use serde::Serialize;

use crate::dto::{PedidoManualReq, QueryPedidos, StatusPedidoReq};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const VENDAS: &[Perfil] = &[Perfil::Admin, Perfil::Vendedor];

#[derive(Serialize, utoipa::ToSchema)]
pub struct PedidoDetalhe {
    pub pedido: Pedido,
    pub itens: Vec<PedidoItem>,
}

/// Lista pedidos paginado com filtros.
#[utoipa::path(
    get,
    path = "/api/v1/pedidos",
    tag = "Pedidos",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("status" = Option<String>, Query, description = "CSV de status"),
        ("empresa_id" = Option<i64>, Query),
        ("contato_id" = Option<i64>, Query),
        ("origem" = Option<OrigemPedido>, Query),
        ("busca" = Option<String>, Query, description = "ILIKE em número e nome da empresa"),
    ),
    responses(
        (status = 200, body = Pagina<Pedido>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/pedidos")]
pub async fn listar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryPedidos>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .pedidos
        .listar(
            q.pag.paginacao()?,
            FiltroPedidos {
                statuses: crate::dto::parse_status_csv(q.status.as_deref())?,
                empresa_id: q.empresa_id.map(Id::novo),
                contato_id: q.contato_id.map(Id::novo),
                origem: q.origem,
                busca: q.busca.clone(),
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Pedido + itens.
#[utoipa::path(
    get,
    path = "/api/v1/pedidos/{id}",
    tag = "Pedidos",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = PedidoDetalhe),
        (status = 404, description = "pedido não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/pedidos/{id}")]
pub async fn buscar(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    let (pedido, itens) = state.pedidos.buscar_por_ref(&referencia).await?;
    Ok(HttpResponse::Ok().json(PedidoDetalhe { pedido, itens }))
}

/// Pedido manual (balcão/telefone) — origem `manual`, sem vínculo com
/// orçamento ou carrinho. Totais calculados pela mesma função de fechamento.
#[utoipa::path(
    post,
    path = "/api/v1/pedidos",
    tag = "Pedidos",
    request_body = PedidoManualReq,
    responses(
        (status = 201, body = Pedido),
        (status = 404, description = "empresa/contato/endereço não encontrado"),
        (status = 422, description = "regra de negócio violada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/pedidos")]
pub async fn criar_manual(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<PedidoManualReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let req = body.into_inner();
    let itens = req
        .itens
        .into_iter()
        .map(|i| i.item())
        .collect::<Result<Vec<_>, _>>()?;
    let totais = calcular_totais(
        itens.iter().map(|i| i.total()),
        Dinheiro::ZERO,
        Dinheiro::ZERO,
    );
    let pedido = state
        .pedidos
        .criar_manual(
            NovoPedido {
                empresa_id: Id::novo(req.empresa_id),
                contato_id: Id::novo(req.contato_id),
                endereco_faturamento_id: Id::novo(req.endereco_faturamento_id),
                endereco_entrega_id: Id::novo(req.endereco_entrega_id),
                origem: OrigemPedido::Manual,
                orcamento_id: None,
                carrinho_id: None,
                vendedor_id: Some(Id::novo(staff.id())),
                condicao_pagamento: req.condicao_pagamento,
                observacoes: req.observacoes,
                subtotal: totais.subtotal,
                desconto: totais.desconto,
                frete: totais.frete,
                total: totais.total,
                itens,
            },
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Created().json(pedido))
}

/// Transição de status — confirmação reserva estoque, faturamento baixa,
/// cancelamento libera reserva (efeitos na mesma transação).
#[utoipa::path(
    patch,
    path = "/api/v1/pedidos/{id}/status",
    tag = "Pedidos",
    params(("id" = i64, Path)),
    request_body = StatusPedidoReq,
    responses(
        (status = 200, body = Pedido),
        (status = 404, description = "pedido não encontrado"),
        (status = 422, description = "transição de status inválida"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/pedidos/{id}/status")]
pub async fn transicionar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<StatusPedidoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let pedido = state
        .pedidos
        .transicionar(Id::novo(*id), body.status, Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Ok().json(pedido))
}
