//! Notas fiscais — emissão a partir do pedido, autorização via gateway e
//! cancelamento (evento fiscal com motivo).

use crate::erro::Resposta;
use actix_web::{delete, get, post, put, web, HttpRequest, HttpResponse};
use chrono::{NaiveDate, Utc};
use hweld_application::ports::fiscal::FiltroNotasFiscais;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::fiscal::configuracao::ConfiguracaoFiscal;
use hweld_domain::fiscal::nota_fiscal::{NotaFiscal, NotaFiscalItem, StatusNotaFiscal};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use serde::Serialize;

use crate::dto::{
    CancelarNfReq, ConfigFiscalReq, ConfigFiscalResp, EmitirNfReq, QueryNotasFiscais,
};
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

// ── Configuração fiscal SEFAZ ───────────────────────────────────────────────

fn view_config(cfg: &ConfiguracaoFiscal) -> ConfigFiscalResp {
    let hoje = Utc::now().date_naive();
    ConfigFiscalResp {
        ambiente: cfg.ambiente,
        serie_nf: cfg.serie_nf.clone(),
        regime_tributario: cfg.regime_tributario.clone(),
        csc_id: cfg.csc_id.clone(),
        csc_configurado: cfg.csc_token.is_some(),
        certificado_configurado: cfg.certificado_configurado,
        certificado_nome: cfg.certificado_nome.clone(),
        certificado_validade: cfg.certificado_validade,
        certificado_sha256: cfg.certificado_sha256.clone(),
        status_integracao: cfg.status_integracao(hoje),
        pendencias: cfg
            .pendencias(hoje)
            .into_iter()
            .map(str::to_string)
            .collect(),
        updated_at: cfg.updated_at,
    }
}

/// Configuração fiscal mascarada + checklist de prontidão SEFAZ.
#[utoipa::path(
    get,
    path = "/api/v1/fiscal/configuracao",
    tag = "Fiscal",
    responses(
        (status = 200, body = ConfigFiscalResp),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/fiscal/configuracao")]
pub async fn obter_configuracao(
    state: web::Data<AppState>,
    staff: AuthStaff,
) -> Resposta<HttpResponse> {
    staff.exige(FISCAL)?;
    let cfg = state.config_fiscal.buscar().await?;
    Ok(HttpResponse::Ok().json(view_config(&cfg)))
}

/// Atualiza ambiente, série, regime tributário e CSC. Campos ausentes
/// preservam o valor gravado; `csc_token: ""` limpa o token.
#[utoipa::path(
    put,
    path = "/api/v1/fiscal/configuracao",
    tag = "Fiscal",
    request_body = ConfigFiscalReq,
    responses(
        (status = 200, body = ConfigFiscalResp),
        (status = 422, description = "campos inválidos"),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[put("/fiscal/configuracao")]
pub async fn salvar_configuracao(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<ConfigFiscalReq>,
) -> Resposta<HttpResponse> {
    staff.exige(FISCAL)?;
    let cfg = state
        .config_fiscal
        .atualizar(body.into_inner().input(), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Ok().json(view_config(&cfg)))
}

/// Upload do certificado digital A1 (.pfx/.p12) — bytes validados como
/// PKCS#12 (SEQUENCE DER) e gravados no banco; a API devolve apenas
/// metadados (nome, validade, fingerprint SHA-256).
///
/// Metadados via headers para não poluir o body binário:
/// `X-Certificado-Senha`, `X-Certificado-Validade` (AAAA-MM-DD) e
/// `X-Nome-Arquivo`.
#[utoipa::path(
    post,
    path = "/api/v1/fiscal/configuracao/certificado",
    tag = "Fiscal",
    request_body(content = Vec<u8>, content_type = "application/x-pkcs12"),
    responses(
        (status = 200, body = ConfigFiscalResp),
        (status = 422, description = "arquivo não é um .pfx/.p12 válido"),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/fiscal/configuracao/certificado")]
pub async fn upload_certificado(
    state: web::Data<AppState>,
    staff: AuthStaff,
    req: HttpRequest,
    body: web::Bytes,
) -> Resposta<HttpResponse> {
    staff.exige(FISCAL)?;
    let header = |nome: &str| {
        req.headers()
            .get(nome)
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let validade = match header("x-certificado-validade") {
        Some(v) => Some(NaiveDate::parse_from_str(&v, "%Y-%m-%d").map_err(|_| {
            hweld_application::ErroApp::Dominio(hweld_domain::ErroDominio::valor_invalido(
                "x-certificado-validade",
                "data inválida — use AAAA-MM-DD",
            ))
        })?),
        None => None,
    };
    let cfg = state
        .config_fiscal
        .registrar_certificado(
            &body,
            &header("x-nome-arquivo").unwrap_or_else(|| "certificado.pfx".into()),
            header("x-certificado-senha").as_deref(),
            validade,
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Ok().json(view_config(&cfg)))
}

/// Remove o certificado A1 gravado (bytes + metadados + senha).
#[utoipa::path(
    delete,
    path = "/api/v1/fiscal/configuracao/certificado",
    tag = "Fiscal",
    responses(
        (status = 200, body = ConfigFiscalResp),
        (status = 403, description = "somente admin/financeiro"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/fiscal/configuracao/certificado")]
pub async fn remover_certificado(
    state: web::Data<AppState>,
    staff: AuthStaff,
) -> Resposta<HttpResponse> {
    staff.exige(FISCAL)?;
    let cfg = state
        .config_fiscal
        .remover_certificado(Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Ok().json(view_config(&cfg)))
}
