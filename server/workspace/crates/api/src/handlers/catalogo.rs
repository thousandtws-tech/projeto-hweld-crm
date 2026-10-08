//! Catálogo — categorias, produtos e tabelas de preço (admin) e o catálogo
//! precificado do portal B2B (contato autenticado).

use crate::erro::Resposta;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use hweld_application::ports::catalogo::FiltroProdutos;
use hweld_application::use_cases::catalogo::ItemCatalogoPortal;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::catalogo::categoria::Categoria;
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem};
use hweld_domain::catalogo::tabela_preco::{TabelaPreco, TabelaPrecoItem};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use serde::Serialize;

use crate::dto::{
    CategoriaReq, ImagemProdutoReq, PrecoItemReq, ProdutoReq, QueryCategorias, QueryProdutos,
    QueryTabelas, TabelaPrecoReq,
};
use crate::estado::AppState;
use crate::extratores::{AuthPortal, AuthStaff};

const CATALOGO: &[Perfil] = &[Perfil::Admin, Perfil::Estoque, Perfil::Vendedor];
/// Imagens de produto — restrito a quem opera o catálogo físico.
const IMAGENS: &[Perfil] = &[Perfil::Admin, Perfil::Estoque];

// ── Respostas compostas ─────────────────────────────────────────────────────

#[derive(Serialize, utoipa::ToSchema)]
pub struct ProdutoDetalhe {
    pub produto: Produto,
    pub imagens: Vec<ProdutoImagem>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct TabelaDetalhe {
    pub tabela: TabelaPreco,
    pub itens: Vec<TabelaPrecoItem>,
}

// ── Categorias ──────────────────────────────────────────────────────────────

/// Lista categorias (árvore completa ou só ativas).
#[utoipa::path(
    get,
    path = "/api/v1/categorias",
    tag = "Catálogo",
    params(("somente_ativas" = Option<bool>, Query, description = "true = apenas categorias ativas")),
    responses(
        (status = 200, body = Vec<Categoria>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/categorias")]
pub async fn listar_categorias(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryCategorias>,
) -> Resposta<HttpResponse> {
    let lista = state
        .categorias
        .listar(q.somente_ativas.unwrap_or(false))
        .await?;
    Ok(HttpResponse::Ok().json(lista))
}

/// Cria categoria.
#[utoipa::path(
    post,
    path = "/api/v1/categorias",
    tag = "Catálogo",
    request_body = CategoriaReq,
    responses(
        (status = 201, body = Categoria),
        (status = 400, description = "payload inválido"),
        (status = 409, description = "slug/nome já cadastrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/categorias")]
pub async fn criar_categoria(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<CategoriaReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let cat = state.categorias.criar(body.into_inner().input()).await?;
    Ok(HttpResponse::Created().json(cat))
}

/// Atualiza categoria (nome, slug, pai, ordem, ativa).
#[utoipa::path(
    patch,
    path = "/api/v1/categorias/{id}",
    tag = "Catálogo",
    params(("id" = i64, Path, description = "id da categoria")),
    request_body = CategoriaReq,
    responses(
        (status = 200, body = Categoria),
        (status = 404, description = "categoria não encontrada"),
        (status = 422, description = "ciclo na hierarquia"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/categorias/{id}")]
pub async fn atualizar_categoria(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<CategoriaReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let cat = state
        .categorias
        .atualizar(Id::novo(*id), body.into_inner().input())
        .await?;
    Ok(HttpResponse::Ok().json(cat))
}

// ── Produtos ────────────────────────────────────────────────────────────────

/// Lista produtos paginado com filtros.
#[utoipa::path(
    get,
    path = "/api/v1/produtos",
    tag = "Catálogo",
    params(
        ("pagina" = Option<u32>, Query, description = "página (default 1)"),
        ("por_pagina" = Option<u32>, Query, description = "itens/página (default 20, máx 100)"),
        ("categoria_id" = Option<i64>, Query),
        ("busca" = Option<String>, Query, description = "ILIKE em nome/sku/descrição"),
        ("ativo" = Option<bool>, Query),
        ("destaque" = Option<bool>, Query),
    ),
    responses(
        (status = 200, body = Pagina<Produto>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/produtos")]
pub async fn listar_produtos(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryProdutos>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .produtos
        .listar(
            q.pag.paginacao()?,
            FiltroProdutos {
                categoria_id: q.categoria_id.map(Id::novo),
                busca: q.busca.clone(),
                ativo: q.ativo,
                destaque: q.destaque,
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Detalhe do produto + imagens.
#[utoipa::path(
    get,
    path = "/api/v1/produtos/{id}",
    tag = "Catálogo",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = ProdutoDetalhe),
        (status = 404, description = "produto não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/produtos/{id}")]
pub async fn buscar_produto(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let (produto, imagens) = state.produtos.buscar(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(ProdutoDetalhe { produto, imagens }))
}

/// Cria produto.
#[utoipa::path(
    post,
    path = "/api/v1/produtos",
    tag = "Catálogo",
    request_body = ProdutoReq,
    responses(
        (status = 201, body = Produto),
        (status = 400, description = "payload inválido"),
        (status = 409, description = "sku/slug já cadastrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/produtos")]
pub async fn criar_produto(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<ProdutoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let produto = state.produtos.criar(body.into_inner().input()).await?;
    Ok(HttpResponse::Created().json(produto))
}

/// Atualiza produto (reindexa no motor de busca, best-effort).
#[utoipa::path(
    patch,
    path = "/api/v1/produtos/{id}",
    tag = "Catálogo",
    params(("id" = i64, Path)),
    request_body = ProdutoReq,
    responses(
        (status = 200, body = Produto),
        (status = 404, description = "produto não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/produtos/{id}")]
pub async fn atualizar_produto(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<ProdutoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let produto = state
        .produtos
        .atualizar(Id::novo(*id), body.into_inner().input())
        .await?;
    Ok(HttpResponse::Ok().json(produto))
}

/// Arquiva produto (soft-delete; desindexa do motor, best-effort).
#[utoipa::path(
    delete,
    path = "/api/v1/produtos/{id}",
    tag = "Catálogo",
    params(("id" = i64, Path)),
    responses(
        (status = 204, description = "arquivado"),
        (status = 404, description = "produto não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/produtos/{id}")]
pub async fn arquivar_produto(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    state.produtos.arquivar(Id::novo(*id)).await?;
    Ok(HttpResponse::NoContent().finish())
}

// ── Imagens de produto ──────────────────────────────────────────────────────

/// Lista imagens do produto ordenadas pela galeria.
#[utoipa::path(
    get,
    path = "/api/v1/produtos/{id}/imagens",
    tag = "Catálogo",
    params(("id" = i64, Path, description = "id do produto")),
    responses(
        (status = 200, body = Vec<ProdutoImagem>),
        (status = 404, description = "produto não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/produtos/{id}/imagens")]
pub async fn listar_imagens(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(IMAGENS)?;
    let imagens = state.produtos.imagens(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(imagens))
}

/// Registra imagem por URL externa (v1 — sem upload binário).
/// `is_principal=true` desmarca a principal anterior (transação no repo).
#[utoipa::path(
    post,
    path = "/api/v1/produtos/{id}/imagens",
    tag = "Catálogo",
    params(("id" = i64, Path, description = "id do produto")),
    request_body = ImagemProdutoReq,
    responses(
        (status = 201, body = ProdutoImagem),
        (status = 422, description = "url inválida"),
        (status = 404, description = "produto não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/produtos/{id}/imagens")]
pub async fn adicionar_imagem(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<ImagemProdutoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(IMAGENS)?;
    let imagem = state
        .produtos
        .adicionar_imagem(
            Id::novo(*id),
            &body.url,
            body.alt_text.as_deref(),
            body.ordem,
            body.is_principal.unwrap_or(false),
        )
        .await?;
    Ok(HttpResponse::Created().json(imagem))
}

/// Remove imagem — 404 se não pertencer ao produto do path.
#[utoipa::path(
    delete,
    path = "/api/v1/produtos/{id}/imagens/{imagem_id}",
    tag = "Catálogo",
    params(
        ("id" = i64, Path, description = "id do produto"),
        ("imagem_id" = i64, Path),
    ),
    responses(
        (status = 204, description = "imagem removida"),
        (status = 404, description = "produto/imagem não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/produtos/{id}/imagens/{imagem_id}")]
pub async fn remover_imagem(
    state: web::Data<AppState>,
    staff: AuthStaff,
    path: web::Path<(i64, i64)>,
) -> Resposta<HttpResponse> {
    staff.exige(IMAGENS)?;
    let (produto_id, imagem_id) = path.into_inner();
    state
        .produtos
        .remover_imagem(Id::novo(produto_id), Id::novo(imagem_id))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

// ── Tabelas de preço ────────────────────────────────────────────────────────

/// Lista tabelas de preço B2B.
#[utoipa::path(
    get,
    path = "/api/v1/tabelas-preco",
    tag = "Catálogo",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("ativa" = Option<bool>, Query),
    ),
    responses(
        (status = 200, body = Pagina<TabelaPreco>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/tabelas-preco")]
pub async fn listar_tabelas(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    q: web::Query<QueryTabelas>,
) -> Resposta<HttpResponse> {
    let pagina = state
        .tabelas_preco
        .listar(q.pag.paginacao()?, q.ativa)
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}

/// Tabela de preço + itens.
#[utoipa::path(
    get,
    path = "/api/v1/tabelas-preco/{id}",
    tag = "Catálogo",
    params(("id" = i64, Path)),
    responses(
        (status = 200, body = TabelaDetalhe),
        (status = 404, description = "tabela não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/tabelas-preco/{id}")]
pub async fn buscar_tabela(
    state: web::Data<AppState>,
    _staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    let (tabela, itens) = state.tabelas_preco.buscar(Id::novo(*id)).await?;
    Ok(HttpResponse::Ok().json(TabelaDetalhe { tabela, itens }))
}

/// Cria tabela de preço.
#[utoipa::path(
    post,
    path = "/api/v1/tabelas-preco",
    tag = "Catálogo",
    request_body = TabelaPrecoReq,
    responses(
        (status = 201, body = TabelaPreco),
        (status = 409, description = "nome já cadastrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/tabelas-preco")]
pub async fn criar_tabela(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<TabelaPrecoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let tabela = state.tabelas_preco.criar(body.into_inner().input()).await?;
    Ok(HttpResponse::Created().json(tabela))
}

/// Atualiza tabela de preço.
#[utoipa::path(
    patch,
    path = "/api/v1/tabelas-preco/{id}",
    tag = "Catálogo",
    params(("id" = i64, Path)),
    request_body = TabelaPrecoReq,
    responses(
        (status = 200, body = TabelaPreco),
        (status = 404, description = "tabela não encontrada"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/tabelas-preco/{id}")]
pub async fn atualizar_tabela(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<TabelaPrecoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let tabela = state
        .tabelas_preco
        .atualizar(Id::novo(*id), body.into_inner().input())
        .await?;
    Ok(HttpResponse::Ok().json(tabela))
}

/// Define/atualiza o preço de um produto na tabela.
#[utoipa::path(
    post,
    path = "/api/v1/tabelas-preco/{id}/itens",
    tag = "Catálogo",
    params(("id" = i64, Path, description = "id da tabela")),
    request_body = PrecoItemReq,
    responses(
        (status = 200, body = TabelaPrecoItem),
        (status = 404, description = "tabela/produto não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/tabelas-preco/{id}/itens")]
pub async fn definir_preco(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
    body: web::Json<PrecoItemReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let preco = hweld_domain::Dinheiro::nao_negativo(body.preco, "preco")
        .map_err(hweld_application::ErroApp::Dominio)?;
    let item = state
        .tabelas_preco
        .definir_preco(Id::novo(*id), Id::novo(body.produto_id), preco)
        .await?;
    Ok(HttpResponse::Ok().json(item))
}

/// Remove produto da tabela de preço.
#[utoipa::path(
    delete,
    path = "/api/v1/tabelas-preco/{id}/itens/{produto_id}",
    tag = "Catálogo",
    params(
        ("id" = i64, Path, description = "id da tabela"),
        ("produto_id" = i64, Path),
    ),
    responses(
        (status = 204, description = "item removido"),
        (status = 404, description = "item não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/tabelas-preco/{id}/itens/{produto_id}")]
pub async fn remover_item_tabela(
    state: web::Data<AppState>,
    staff: AuthStaff,
    path: web::Path<(i64, i64)>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let (tabela_id, produto_id) = path.into_inner();
    state
        .tabelas_preco
        .remover_item(Id::novo(tabela_id), Id::novo(produto_id))
        .await?;
    Ok(HttpResponse::NoContent().finish())
}

// ── Portal B2B ──────────────────────────────────────────────────────────────

/// Catálogo com o preço efetivo da empresa do contato (tabela B2B se houver).
#[utoipa::path(
    get,
    path = "/api/v1/portal/catalogo",
    tag = "Portal B2B",
    params(
        ("pagina" = Option<u32>, Query),
        ("por_pagina" = Option<u32>, Query),
        ("categoria_id" = Option<i64>, Query),
        ("busca" = Option<String>, Query),
        ("destaque" = Option<bool>, Query),
    ),
    responses(
        (status = 200, body = Pagina<ItemCatalogoPortal>),
        (status = 401, description = "não autenticado"),
    ),
    security(("bearer_auth" = [])),
)]
#[get("/portal/catalogo")]
pub async fn catalogo_portal(
    state: web::Data<AppState>,
    portal: AuthPortal,
    q: web::Query<QueryProdutos>,
) -> Resposta<HttpResponse> {
    let contato = state.contatos.buscar(Id::novo(portal.contato_id())).await?;
    let pagina = state
        .catalogo_portal
        .catalogo(
            contato.empresa_id,
            q.pag.paginacao()?,
            FiltroProdutos {
                categoria_id: q.categoria_id.map(Id::novo),
                busca: q.busca.clone(),
                ativo: Some(true),
                destaque: q.destaque,
            },
        )
        .await?;
    Ok(HttpResponse::Ok().json(pagina))
}
