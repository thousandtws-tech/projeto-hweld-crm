//! Canal interno service-to-service — recebe eventos financeiros/fiscais do
//! `hweld-operations-api` (Java). Autenticação por `X-Service-Token`
//! (`AuthServico`), nunca por JWT de usuário: este endpoint não é público.
//!
//! Entrega at-least-once: a deduplicação por `event_id` está em
//! `ServicoIntegracao` — resposta 202 em todos os casos tratáveis (novo,
//! duplicado, ignorado por estado), reservando 4xx/5xx para envelope
//! inválido ou falha de infraestrutura (que justifica retry do emissor).

use actix_web::{get, post, web, HttpResponse};
use hweld_application::use_cases::integracao::{EventoFinanceiro, ResultadoEvento};
use hweld_domain::fiscal::nota_fiscal::NotaFiscal;
use hweld_domain::crm::contato::Contato;
use hweld_domain::shared::id::Id;
use hweld_domain::vendas::pedido::Pedido;

use crate::erro::Resposta;
use crate::estado::AppState;
use crate::extratores::AuthServico;

/// Evento de integração vindo da outbox do serviço de operações.
/// Não entra no OpenAPI público — contrato interno documentado em
/// `docs/business-operations-architecture.md`.
#[post("/internal/eventos-financeiros")]
pub async fn eventos_financeiros(
    state: web::Data<AppState>,
    _servico: AuthServico,
    body: web::Json<EventoFinanceiro>,
) -> Resposta<HttpResponse> {
    let resultado = state.integracao.processar(body.into_inner()).await?;
    let aceito = !matches!(resultado, ResultadoEvento::Ignorado(_));
    Ok(HttpResponse::Accepted().json(serde_json::json!({
        "aceito": aceito,
        "resultado": resultado.rotulo(),
    })))
}

/// Conjunto fiscal autoritativo do pedido para o operations-api montar o
/// payload do provedor (Focus NFe): itens com NCM/CFOP/unidade resolvidos,
/// empresa e endereço de faturamento. `nota_fiscal_id` opcional usa o
/// snapshot da NF como fonte dos campos tributários.
#[derive(serde::Deserialize)]
pub struct DadosFiscaisQuery {
    pub nota_fiscal_id: Option<i64>,
}

#[get("/internal/pedidos/{id}/dados-fiscais")]
pub async fn dados_fiscais(
    state: web::Data<AppState>,
    _servico: AuthServico,
    path: web::Path<i64>,
    query: web::Query<DadosFiscaisQuery>,
) -> Resposta<HttpResponse> {
    let dados = state
        .notas_fiscais
        .dados_emissao_pedido(
            Id::<Pedido>::novo(path.into_inner()),
            query.nota_fiscal_id.map(Id::<NotaFiscal>::novo),
        )
        .await?;
    Ok(HttpResponse::Ok().json(dados))
}

/// Conjunto logístico autoritativo do pedido para o operations-api cotar
/// frete (Melhor Envio): itens com peso/dimensões do cadastro do produto e
/// CEP do endereço de entrega (nunca o de faturamento).
#[get("/internal/pedidos/{id}/dados-logisticos")]
pub async fn dados_logisticos(
    state: web::Data<AppState>,
    _servico: AuthServico,
    path: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let dados = state
        .logistica
        .dados_logisticos_pedido(Id::<Pedido>::novo(path.into_inner()))
        .await?;
    Ok(HttpResponse::Ok().json(dados))
}

/// Dados mínimos de notificação do contato (e-mail/telefone) para o
/// operations-api resolver destinatários fora do contexto de JWT — usado
/// pelo handler de eventos SMS/e-mail quando o payload traz só `contatoId`.
#[get("/internal/contatos/{id}/notificacao")]
pub async fn contato_notificacao(
    state: web::Data<AppState>,
    _servico: AuthServico,
    path: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let c = state
        .contatos
        .buscar(Id::<Contato>::novo(path.into_inner()))
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id": c.id.valor(),
        "email": c.email,
        "telefone": c.telefone,
    })))
}
