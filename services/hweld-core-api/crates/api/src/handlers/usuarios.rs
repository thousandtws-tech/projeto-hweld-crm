//! Administração de usuários internos — restrito a `Perfil::Admin`.

use crate::erro::Resposta;
use actix_web::{HttpResponse, get, patch, post, web};
use hweld_application::ports::acesso::{AtualizarUsuario, FiltroUsuarios};
use hweld_domain::acesso::usuario::{Perfil, Usuario};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;

use crate::dto::{AtivoReq, AtualizarUsuarioReq, CriarUsuarioReq, QueryUsuarios};
use crate::estado::AppState;
use crate::extratores::AuthStaff;

const APENAS_ADMIN: &[Perfil] = &[Perfil::Admin];

/// Lista usuários staff (somente Admin).
#[utoipa::path(
    get,
    path = "/api/v1/usuarios",
    tag = "Usuários",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("perfil" = Option<Perfil>, Query),
        ("ativo" = Option<bool>, Query),
        ("busca" = Option<String>, Query, description = "ILIKE em nome/email"),
    ),
    responses(
        (status = 200, body = Pagina<Usuario>),
        (status = 403, description = "somente Admin"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/usuarios")]
pub async fn listar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    q: web::Query<QueryUsuarios>,
) -> Resposta<HttpResponse> {
    staff.exige(APENAS_ADMIN)?;
    let pagina = state
        .usuarios
        .listar(
            q.pag.paginacao()?,
            FiltroUsuarios {
                perfil: q.perfil,
                ativo: q.ativo,
                busca: q.busca.clone(),
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Busca usuário por id (somente Admin).
#[utoipa::path(
    get,
    path = "/api/v1/usuarios/{id}",
    tag = "Usuários",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = Usuario),
        (status = 404, description = "usuário não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/usuarios/{id}")]
pub async fn buscar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(APENAS_ADMIN)?;
    let usuario = state.usuarios.buscar(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(usuario))
}

/// Cria usuário staff (somente Admin).
#[utoipa::path(
    post,
    path = "/api/v1/usuarios",
    tag = "Usuários",
    request_body = CriarUsuarioReq,
    responses(
        (status = 201, body = Usuario),
        (status = 409, description = "email já cadastrado"),
        (status = 403, description = "somente Admin"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/usuarios")]
pub async fn criar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<CriarUsuarioReq>,
) -> Resposta<HttpResponse> {
    staff.exige(APENAS_ADMIN)?;
    let usuario = state
        .usuarios
        .criar(
            body.nome.clone(),
            body.email.clone(),
            &body.senha,
            body.perfil,
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Created().json(usuario))
}

/// Atualiza nome/email/perfil (somente Admin).
#[utoipa::path(
    patch,
    path = "/api/v1/usuarios/{id}",
    tag = "Usuários",
    params(("id" = i64, Path)),
    request_body = AtualizarUsuarioReq,
    responses(
        (status = 200, body = Usuario),
        (status = 404, description = "usuário não encontrado"),
        (status = 409, description = "email já cadastrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/usuarios/{id}")]
pub async fn atualizar(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<AtualizarUsuarioReq>,
) -> Resposta<HttpResponse> {
    staff.exige(APENAS_ADMIN)?;
    let usuario = state
        .usuarios
        .atualizar(
            Id::novo(*id),
            AtualizarUsuario {
                nome: body.nome.clone(),
                email: body.email.clone(),
                perfil: body.perfil,
            },
            Some(Id::novo(staff.id())),
        )
        .await?;
    Ok(HttpResponse::Ok().json(usuario))
}

/// Ativa/desativa usuário (somente Admin).
#[utoipa::path(
    patch,
    path = "/api/v1/usuarios/{id}/ativo",
    tag = "Usuários",
    params(("id" = i64, Path)),
    request_body = AtivoReq,
    responses(
        (status = 204, description = "status alterado"),
        (status = 404, description = "usuário não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/usuarios/{id}/ativo")]
pub async fn definir_ativo(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<AtivoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(APENAS_ADMIN)?;
    state
        .usuarios
        .definir_ativo(Id::novo(*id), body.ativo, Some(Id::novo(staff.id())))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}
