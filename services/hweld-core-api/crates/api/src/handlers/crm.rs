//! CRM — empresas, contatos, endereços, oportunidades e interações.
//! Escrita exige `admin` ou `vendedor`; leitura qualquer staff autenticado.

use crate::erro::Resposta;
use actix_web::{HttpResponse, delete, get, patch, post, web};
use hweld_application::ports::crm::{FiltroEmpresas, FiltroOportunidades};
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::crm::contato::Contato;
use hweld_domain::crm::empresa::{Empresa, StatusEmpresa};
use hweld_domain::crm::endereco::{Endereco, TipoEndereco};
use hweld_domain::crm::interacao::Interacao;
use hweld_domain::crm::oportunidade::{EstagioOportunidade, Oportunidade};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;

use crate::dto::{
    AtivarPortalReq, ContatoReq, EmpresaReq, EnderecoReq, InteracaoReq, MoverEstagioReq,
    OportunidadeReq, QueryContatos, QueryEmpresas, QueryEnderecos, QueryInteracoes,
    QueryOportunidades,
};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const VENDAS: &[Perfil] = &[Perfil::Admin, Perfil::Vendedor];

// ── Empresas ────────────────────────────────────────────────────────────────

/// Lista empresas (clientes) paginado.
#[utoipa::path(
    get,
    path = "/api/v1/empresas",
    tag = "CRM",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("status" = Option<StatusEmpresa>, Query),
        ("busca" = Option<String>, Query, description = "ILIKE em razão social/fantasia/CNPJ"),
    ),
    responses(
        (status = 200, body = Pagina<Empresa>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/empresas")]
pub async fn listar_empresas(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryEmpresas>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .empresas
        .listar(
            q.pag.paginacao()?,
            FiltroEmpresas {
                status: q.status,
                busca: q.busca.clone(),
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Busca empresa por id.
#[utoipa::path(
    get,
    path = "/api/v1/empresas/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = Empresa),
        (status = 404, description = "empresa não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/empresas/{id}")]
pub async fn buscar_empresa(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    let empresa = state.empresas.buscar_por_ref(&referencia).await?;
    Ok(HttpResponse::Ok().json(empresa))
}

/// Cria empresa (valida CNPJ).
#[utoipa::path(
    post,
    path = "/api/v1/empresas",
    tag = "CRM",
    request_body = EmpresaReq,
    responses(
        (status = 201, body = Empresa),
        (status = 409, description = "CNPJ já cadastrado"),
        (status = 422, description = "CNPJ inválido"),
        (status = 403, description = "somente admin/vendedor"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/empresas")]
pub async fn criar_empresa(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<EmpresaReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let empresa = state
        .empresas
        .criar(body.into_inner().input(), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Created().json(empresa))
}

/// Atualiza empresa.
#[utoipa::path(
    patch,
    path = "/api/v1/empresas/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    request_body = EmpresaReq,
    responses(
        (status = 200, body = Empresa),
        (status = 404, description = "empresa não encontrada"),
        (status = 409, description = "CNPJ já cadastrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/empresas/{id}")]
pub async fn atualizar_empresa(
    state: web::Data<AppState>,
    staff: AuthStaff,
    referencia: web::Path<String>,
    body: web::Json<EmpresaReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let empresa = state.empresas.buscar_por_ref(&referencia).await?;
    let empresa = state
        .empresas
        .atualizar(
            empresa.id,
            body.into_inner().input(),
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Ok().json(empresa))
}

/// Arquiva empresa (soft-delete).
#[utoipa::path(
    delete,
    path = "/api/v1/empresas/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    responses(
        (status = 204, description = "arquivada"),
        (status = 404, description = "empresa não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/empresas/{id}")]
pub async fn arquivar_empresa(
    state: web::Data<AppState>,
    staff: AuthStaff,
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let empresa = state.empresas.buscar_por_ref(&referencia).await?;
    state
        .empresas
        .arquivar(empresa.id, Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

// ── Contatos ────────────────────────────────────────────────────────────────

/// Lista contatos, opcionalmente por empresa.
#[utoipa::path(
    get,
    path = "/api/v1/contatos",
    tag = "CRM",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("empresa_id" = Option<i64>, Query),
        ("busca" = Option<String>, Query),
    ),
    responses(
        (status = 200, body = Pagina<Contato>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/contatos")]
pub async fn listar_contatos(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryContatos>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .contatos
        .listar(
            q.pag.paginacao()?,
            q.empresa_id.map(Id::novo),
            q.busca.clone(),
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Busca contato por id.
#[utoipa::path(
    get,
    path = "/api/v1/contatos/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = Contato),
        (status = 404, description = "contato não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/contatos/{id}")]
pub async fn buscar_contato(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let contato = state.contatos.buscar(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(contato))
}

/// Cria contato vinculado a uma empresa.
#[utoipa::path(
    post,
    path = "/api/v1/contatos",
    tag = "CRM",
    request_body = ContatoReq,
    responses(
        (status = 201, body = Contato),
        (status = 404, description = "empresa não encontrada"),
        (status = 409, description = "email já cadastrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/contatos")]
pub async fn criar_contato(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<ContatoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let contato = state
        .contatos
        .criar(body.into_inner().input(), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Created().json(contato))
}

/// Atualiza contato.
#[utoipa::path(
    patch,
    path = "/api/v1/contatos/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    request_body = ContatoReq,
    responses(
        (status = 200, body = Contato),
        (status = 404, description = "contato não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/contatos/{id}")]
pub async fn atualizar_contato(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<ContatoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let contato = state
        .contatos
        .atualizar(
            Id::novo(*id),
            body.into_inner().input(),
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Ok().json(contato))
}

/// Ativa acesso ao portal B2B (define senha do contato).
#[utoipa::path(
    post,
    path = "/api/v1/contatos/{id}/portal",
    tag = "CRM",
    params(("id" = i64, Path)),
    request_body = AtivarPortalReq,
    responses(
        (status = 204, description = "acesso ativado"),
        (status = 404, description = "contato não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/contatos/{id}/portal")]
pub async fn ativar_portal(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<AtivarPortalReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    state
        .contatos
        .ativar_portal(Id::novo(*id), &body.senha, Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

/// Revoga acesso ao portal B2B.
#[utoipa::path(
    delete,
    path = "/api/v1/contatos/{id}/portal",
    tag = "CRM",
    params(("id" = i64, Path)),
    responses(
        (status = 204, description = "acesso revogado"),
        (status = 404, description = "contato não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/contatos/{id}/portal")]
pub async fn desativar_portal(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    state
        .contatos
        .desativar_portal(Id::novo(*id), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

/// Arquiva contato (soft-delete).
#[utoipa::path(
    delete,
    path = "/api/v1/contatos/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    responses(
        (status = 204, description = "arquivado"),
        (status = 404, description = "contato não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/contatos/{id}")]
pub async fn arquivar_contato(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    state
        .contatos
        .arquivar(Id::novo(*id), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

// ── Endereços ───────────────────────────────────────────────────────────────

/// Lista endereços da empresa.
#[utoipa::path(
    get,
    path = "/api/v1/empresas/{id}/enderecos",
    tag = "CRM",
    params(
        ("id" = i64, Path, description = "id da empresa"),
        ("tipo" = Option<TipoEndereco>, Query),
    ),
    responses(
        (status = 200, body = Vec<Endereco>),
        (status = 404, description = "empresa não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/empresas/{id}/enderecos")]
pub async fn listar_enderecos(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    id: web::Path<i64>,
    q: web::Query<QueryEnderecos>,
) -> Resposta<HttpResponse> {
    let lista = state.enderecos.listar(Id::novo(*id), q.tipo).await?;
    Ok(HttpResponse::Ok().json(lista))
}

/// Cria endereço para uma empresa.
#[utoipa::path(
    post,
    path = "/api/v1/enderecos",
    tag = "CRM",
    request_body = EnderecoReq,
    responses(
        (status = 201, body = Endereco),
        (status = 404, description = "empresa não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/enderecos")]
pub async fn criar_endereco(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<EnderecoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let endereco = state.enderecos.criar(body.into_inner().input()).await?;
    Ok(HttpResponse::Created().json(endereco))
}

/// Atualiza endereço.
#[utoipa::path(
    patch,
    path = "/api/v1/enderecos/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    request_body = EnderecoReq,
    responses(
        (status = 200, body = Endereco),
        (status = 404, description = "endereço não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/enderecos/{id}")]
pub async fn atualizar_endereco(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<EnderecoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let endereco = state
        .enderecos
        .atualizar(Id::novo(*id), body.into_inner().input())
        .await?;
    Ok(HttpResponse::Ok().json(endereco))
}

/// Remove endereço.
#[utoipa::path(
    delete,
    path = "/api/v1/enderecos/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    responses(
        (status = 204, description = "removido"),
        (status = 404, description = "endereço não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/enderecos/{id}")]
pub async fn remover_endereco(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    state.enderecos.remover(Id::novo(*id)).await?;
    Ok(HttpResponse::NoContent().finish())
}

// ── Oportunidades ───────────────────────────────────────────────────────────

/// Funil de vendas — oportunidades paginadas com filtros.
#[utoipa::path(
    get,
    path = "/api/v1/oportunidades",
    tag = "CRM",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("estagio" = Option<EstagioOportunidade>, Query),
        ("empresa_id" = Option<i64>, Query),
        ("responsavel_id" = Option<i64>, Query),
    ),
    responses(
        (status = 200, body = Pagina<Oportunidade>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/oportunidades")]
pub async fn listar_oportunidades(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryOportunidades>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .oportunidades
        .listar(
            q.pag.paginacao()?,
            FiltroOportunidades {
                estagio: q.estagio,
                empresa_id: q.empresa_id.map(Id::novo),
                responsavel_id: q.responsavel_id.map(Id::novo),
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Busca oportunidade por id.
#[utoipa::path(
    get,
    path = "/api/v1/oportunidades/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = Oportunidade),
        (status = 404, description = "oportunidade não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/oportunidades/{id}")]
pub async fn buscar_oportunidade(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let op = state.oportunidades.buscar(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(op))
}

/// Cria oportunidade no funil.
#[utoipa::path(
    post,
    path = "/api/v1/oportunidades",
    tag = "CRM",
    request_body = OportunidadeReq,
    responses(
        (status = 201, body = Oportunidade),
        (status = 404, description = "empresa não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/oportunidades")]
pub async fn criar_oportunidade(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<OportunidadeReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let op = state
        .oportunidades
        .criar(body.into_inner().input(), Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::Created().json(op))
}

/// Atualiza oportunidade.
#[utoipa::path(
    patch,
    path = "/api/v1/oportunidades/{id}",
    tag = "CRM",
    params(("id" = i64, Path)),
    request_body = OportunidadeReq,
    responses(
        (status = 200, body = Oportunidade),
        (status = 404, description = "oportunidade não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/oportunidades/{id}")]
pub async fn atualizar_oportunidade(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<OportunidadeReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let op = state
        .oportunidades
        .atualizar(
            Id::novo(*id),
            body.into_inner().input(),
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Ok().json(op))
}

/// Move oportunidade de estágio no funil (ganho/perdido exige motivo).
#[utoipa::path(
    patch,
    path = "/api/v1/oportunidades/{id}/estagio",
    tag = "CRM",
    params(("id" = i64, Path)),
    request_body = MoverEstagioReq,
    responses(
        (status = 200, body = Oportunidade),
        (status = 404, description = "oportunidade não encontrada"),
        (status = 422, description = "transição de estágio inválida"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/oportunidades/{id}/estagio")]
pub async fn mover_estagio(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<MoverEstagioReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let op = state
        .oportunidades
        .mover_estagio(
            Id::novo(*id),
            body.estagio,
            body.motivo_perda.clone(),
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Ok().json(op))
}

// ── Interações ──────────────────────────────────────────────────────────────

/// Timeline de interações (ligações, e-mails, visitas...).
#[utoipa::path(
    get,
    path = "/api/v1/interacoes",
    tag = "CRM",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("empresa_id" = Option<i64>, Query),
        ("oportunidade_id" = Option<i64>, Query),
        ("contato_id" = Option<i64>, Query),
    ),
    responses(
        (status = 200, body = Pagina<Interacao>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/interacoes")]
pub async fn timeline(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryInteracoes>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .interacoes
        .timeline(
            q.pag.paginacao()?,
            q.empresa_id.map(Id::novo),
            q.oportunidade_id.map(Id::novo),
            q.contato_id.map(Id::novo),
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Registra interação na timeline.
#[utoipa::path(
    post,
    path = "/api/v1/interacoes",
    tag = "CRM",
    request_body = InteracaoReq,
    responses(
        (status = 201, body = Interacao),
        (status = 404, description = "empresa/contato não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/interacoes")]
pub async fn registrar_interacao(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<InteracaoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(VENDAS)?;
    let interacao = state
        .interacoes
        .registrar(body.into_inner().input(staff.id()))
        .await?;
    Ok(HttpResponse::Created().json(interacao))
}
