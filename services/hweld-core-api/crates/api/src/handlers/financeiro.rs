//! Financeiro — parcelas de pagamento (gerar, baixar, estornar) e sessões de
//! caixa (abrir, lançar, fechar com conferência). Restrito a admin/financeiro.

use crate::erro::Resposta;
use actix_web::{get, post, web, HttpResponse};
use hweld_application::ports::vendas::FiltroPagamentos;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::financeiro::caixa::{Caixa, CaixaMovimentacao};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use hweld_domain::vendas::pagamento::Pagamento;
use hweld_domain::vendas::pagamento::StatusPagamento;
use hweld_domain::Dinheiro;

use crate::dto::{
    AbrirCaixaReq, BaixarPagamentoReq, EstornarPagamentoReq, FecharCaixaReq, LancarCaixaReq,
    ParcelasReq, QueryPagamentos, QueryPaginacao,
};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const FINANCEIRO: &[Perfil] = &[Perfil::Admin, Perfil::Financeiro];

// ── Pagamentos ──────────────────────────────────────────────────────────────

/// Lista parcelas/pagamentos paginado com filtros.
#[utoipa::path(
    get,
    path = "/api/v1/pagamentos",
    tag = "Financeiro",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("pedido_id" = Option<i64>, Query),
        ("status" = Option<StatusPagamento>, Query),
        ("vencidos_em" = Option<String>, Query, description = "vencidos até a data (YYYY-MM-DD)"),
    ),
    responses(
        (status = 200, body = Pagina<Pagamento>),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/pagamentos")]
pub async fn listar_pagamentos(
    state: web::Data<AppState>,
    staff: AuthStaff,
    q: web::Query<QueryPagamentos>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let pagina = state
        .pagamentos
        .listar(
            q.pag.paginacao()?,
            FiltroPagamentos {
                pedido_id: q.pedido_id.map(Id::novo),
                status: q.status,
                vencidos_em: q.vencidos_em,
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Plano de parcelas do pedido — a última absorve o arredondamento.
#[utoipa::path(
    post,
    path = "/api/v1/pagamentos/parcelas",
    tag = "Financeiro",
    request_body = ParcelasReq,
    responses(
        (status = 201, body = Vec<Pagamento>),
        (status = 404, description = "pedido não encontrado"),
        (status = 409, description = "pedido já possui parcelas"),
        (status = 422, description = "pedido não parcelável nesse status"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/pagamentos/parcelas")]
pub async fn gerar_parcelas(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<ParcelasReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let parcelas = state
        .pagamentos
        .gerar_parcelas(
            Id::novo(body.pedido_id),
            body.quantidade,
            body.primeiro_vencimento,
            body.intervalo_dias.unwrap_or(30),
            body.forma_pagamento_id.map(Id::novo),
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Created().json(parcelas))
}

/// Baixa de parcela — recebimento no caixa aberto na mesma transação.
#[utoipa::path(
    post,
    path = "/api/v1/pagamentos/{id}/baixar",
    tag = "Financeiro",
    params(("id" = i64, Path)),
    request_body = BaixarPagamentoReq,
    responses(
        (status = 200, body = Pagamento),
        (status = 404, description = "parcela/forma de pagamento não encontrada"),
        (status = 422, description = "sem caixa aberto ou parcela já baixada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/pagamentos/{id}/baixar")]
pub async fn baixar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<BaixarPagamentoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let pagamento = state
        .pagamentos
        .baixar(
            Id::novo(*id),
            Id::novo(body.forma_pagamento_id),
            Some(Id::novo(staff.id())),
            body.observacao.clone(),
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagamento))
}

/// Estorno — lançamento compensatório no caixa aberto.
#[utoipa::path(
    post,
    path = "/api/v1/pagamentos/{id}/estornar",
    tag = "Financeiro",
    params(("id" = i64, Path)),
    request_body = EstornarPagamentoReq,
    responses(
        (status = 200, body = Pagamento),
        (status = 404, description = "parcela não encontrada"),
        (status = 422, description = "sem caixa aberto ou parcela não baixada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/pagamentos/{id}/estornar")]
pub async fn estornar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<EstornarPagamentoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let pagamento = state
        .pagamentos
        .estornar(Id::novo(*id), &body.motivo, Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Ok().json(pagamento))
}

// ── Caixa ───────────────────────────────────────────────────────────────────

/// Sessão de caixa aberta no momento (ou null).
#[utoipa::path(
    get,
    path = "/api/v1/caixas/aberto",
    tag = "Financeiro",
    responses(
        (status = 200, body = Option<Caixa>),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/caixas/aberto")]
pub async fn caixa_aberto(state: web::Data<AppState>, staff: AuthStaff) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let caixa = state.caixas.aberto().await?;
    Ok(HttpResponse::Ok().json(caixa))
}

/// Histórico de sessões de caixa.
#[utoipa::path(
    get,
    path = "/api/v1/caixas",
    tag = "Financeiro",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
    ),
    responses(
        (status = 200, body = Pagina<Caixa>),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/caixas")]
pub async fn listar_caixas(
    state: web::Data<AppState>,
    staff: AuthStaff,
    q: web::Query<QueryPaginacao>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let pagina = state.caixas.listar(q.paginacao()?).await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Movimentações de uma sessão de caixa.
#[utoipa::path(
    get,
    path = "/api/v1/caixas/{id}/movimentacoes",
    tag = "Financeiro",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = Vec<CaixaMovimentacao>),
        (status = 404, description = "caixa não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/caixas/{id}/movimentacoes")]
pub async fn movimentacoes_caixa(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let lista = state.caixas.movimentacoes(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(lista))
}

/// Abre sessão de caixa com fundo de troco.
#[utoipa::path(
    post,
    path = "/api/v1/caixas/abrir",
    tag = "Financeiro",
    request_body = AbrirCaixaReq,
    responses(
        (status = 201, body = Caixa),
        (status = 409, description = "já existe caixa aberto"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/caixas/abrir")]
pub async fn abrir(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<AbrirCaixaReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let caixa = state
        .caixas
        .abrir(Dinheiro::novo(body.valor_abertura), Id::novo(staff.id()))
        .await?;
    Ok(HttpResponse::Created().json(caixa))
}

/// Suprimento, sangria ou despesa — venda/recebimento/estorno nascem de
/// pedidos e parcelas, não por aqui.
#[utoipa::path(
    post,
    path = "/api/v1/caixas/lancar",
    tag = "Financeiro",
    request_body = LancarCaixaReq,
    responses(
        (status = 201, body = CaixaMovimentacao),
        (status = 422, description = "sem caixa aberto ou tipo inválido"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/caixas/lancar")]
pub async fn lancar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<LancarCaixaReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let mov = state
        .caixas
        .lancar(
            body.tipo,
            Dinheiro::novo(body.valor),
            body.forma_pagamento_id.map(Id::novo),
            body.descricao.clone(),
            Id::novo(staff.id()),
        )
        .await?;
    Ok(HttpResponse::Created().json(mov))
}

/// Fecha o caixa — o serviço confere calculado × informado (quebra).
#[utoipa::path(
    post,
    path = "/api/v1/caixas/fechar",
    tag = "Financeiro",
    request_body = FecharCaixaReq,
    responses(
        (status = 200, body = Caixa),
        (status = 422, description = "sem caixa aberto"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/caixas/fechar")]
pub async fn fechar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<FecharCaixaReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FINANCEIRO)?;
    let caixa = state
        .caixas
        .fechar(Dinheiro::novo(body.valor_informado), Id::novo(staff.id()))
        .await?;
    Ok(HttpResponse::Ok().json(caixa))
}
