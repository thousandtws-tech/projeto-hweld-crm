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
    AtualizarImagemProdutoReq, CategoriaReq, ImagemProdutoReq, PrecoItemReq, ProdutoReq,
    QueryCategorias, QueryProdutos, QueryTabelas, TabelaPrecoReq,
};
use crate::estado::AppState;
use crate::extratores::{AuthPortal, AuthStaff};
use actix_web::HttpRequest;

const CATALOGO: &[Perfil] = &[Perfil::Admin, Perfil::Estoque, Perfil::Vendedor];
/// Imagens e upload de mídia — liberado para quem gerencia o catálogo.
const IMAGENS: &[Perfil] = &[Perfil::Admin, Perfil::Estoque, Perfil::Vendedor];

const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024; // 8 MB

#[derive(Serialize, utoipa::ToSchema)]
pub struct UploadMidiaResp {
    pub url: String,
    pub arquivo: String,
    pub mime: String,
    pub bytes: usize,
}

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
    let antes = state.categorias.buscar(Id::novo(*id)).await?;
    let cat = state
        .categorias
        .atualizar(Id::novo(*id), body.into_inner().input())
        .await?;
    // Ao trocar/remover a imagem local da categoria, descarta o arquivo órfão.
    if antes.imagem_url.as_deref() != cat.imagem_url.as_deref() {
        if let Some(antiga) = antes.imagem_url.as_deref() {
            descartar_arquivo_midia(antiga).await;
        }
    }
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
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    let (produto, imagens) = state.produtos.buscar_por_ref(&referencia).await?;
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
    referencia: web::Path<String>,
    body: web::Json<ProdutoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let (produto, _) = state.produtos.buscar_por_ref(&referencia).await?;
    let produto = state
        .produtos
        .atualizar(produto.id, body.into_inner().input())
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
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let (produto, _) = state.produtos.buscar_por_ref(&referencia).await?;
    state.produtos.arquivar(produto.id).await?;
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

/// Atualiza metadados da imagem (alt_text, ordem ou define como imagem principal da vitrine).
#[utoipa::path(
    patch,
    path = "/api/v1/produtos/{id}/imagens/{imagem_id}",
    tag = "Catálogo",
    params(
        ("id" = i64, Path, description = "id do produto"),
        ("imagem_id" = i64, Path),
    ),
    request_body = AtualizarImagemProdutoReq,
    responses(
        (status = 200, body = ProdutoImagem),
        (status = 404, description = "produto/imagem não encontrado"),
    ),
    security(("bearer_auth" = [])),
)]
#[patch("/produtos/{id}/imagens/{imagem_id}")]
pub async fn atualizar_imagem(
    state: web::Data<AppState>,
    staff: AuthStaff,
    path: web::Path<(i64, i64)>,
    body: web::Json<AtualizarImagemProdutoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(IMAGENS)?;
    let (produto_id, imagem_id) = path.into_inner();
    let img = state
        .produtos
        .atualizar_imagem(
            Id::novo(produto_id),
            Id::novo(imagem_id),
            body.alt_text.as_deref(),
            body.ordem,
            body.is_principal,
        )
        .await?;
    Ok(HttpResponse::Ok().json(img))
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
    let removida = state
        .produtos
        .remover_imagem(Id::novo(produto_id), Id::novo(imagem_id))
        .await?;
    descartar_arquivo_midia(&removida.url).await;
    Ok(HttpResponse::NoContent().finish())
}

// ── Upload e Entrega de Mídia (Produtos e Categorias) ───────────────────────

fn detectar_formato_imagem(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("webp", "image/webp"));
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some(("png", "image/png"));
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(("jpg", "image/jpeg"));
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(("gif", "image/gif"));
    }
    None
}

/// Descarta o arquivo físico quando a URL aponta para `…/api/v1/midia/{arquivo}`
/// (upload local). URLs externas e Data URLs não têm arquivo para remover.
/// Best-effort: falha de FS não derruba a operação principal — registra warn.
async fn descartar_arquivo_midia(url: &str) {
    if !url.contains("/api/v1/midia/") {
        return;
    }
    let nome = url.rsplit("/api/v1/midia/").next().unwrap_or_default();
    let seguro = !nome.is_empty()
        && nome.len() <= 80
        && !nome.contains("..")
        && !nome.contains('/')
        && !nome.contains('\\')
        && nome
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');
    if !seguro {
        return;
    }
    match tokio::fs::remove_file(std::path::Path::new("uploads").join(nome)).await {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => tracing::warn!(arquivo = nome, erro = %e, "falha ao descartar arquivo de mídia"),
    }
}

/// Upload binário de imagem para produtos e categorias (valida magic bytes PNG/JPEG/WEBP/GIF).
#[utoipa::path(
    post,
    path = "/api/v1/midia/upload",
    tag = "Catálogo",
    request_body(content = Vec<u8>, content_type = "application/octet-stream"),
    responses(
        (status = 201, body = UploadMidiaResp),
        (status = 422, description = "formato de imagem não suportado ou arquivo vazio"),
    ),
    security(("bearer_auth" = [])),
)]
#[post("/midia/upload")]
pub async fn upload_midia(
    req: HttpRequest,
    staff: AuthStaff,
    body: web::Bytes,
) -> Resposta<HttpResponse> {
    staff.exige(IMAGENS)?;
    if body.is_empty() || body.len() > MAX_UPLOAD_BYTES {
        return Err(hweld_application::ErroApp::Dominio(
            hweld_domain::ErroDominio::valor_invalido(
                "arquivo",
                "imagem vazia ou acima do limite de 8 MB",
            ),
        )
        .into());
    }
    let Some((ext, mime)) = detectar_formato_imagem(&body) else {
        return Err(hweld_application::ErroApp::Dominio(
            hweld_domain::ErroDominio::valor_invalido(
                "arquivo",
                "formato inválido — envie PNG, JPEG, WEBP ou GIF",
            ),
        )
        .into());
    };

    let dir = std::path::Path::new("uploads");
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| hweld_application::ErroApp::interno("midia_dir", e))?;

    let nome_arquivo = format!("{}.{ext}", uuid::Uuid::new_v4().simple());
    let caminho = dir.join(&nome_arquivo);
    tokio::fs::write(&caminho, &body)
        .await
        .map_err(|e| hweld_application::ErroApp::interno("midia_write", e))?;

    let conn = req.connection_info();
    let url = format!(
        "{}://{}/api/v1/midia/{}",
        conn.scheme(),
        conn.host(),
        nome_arquivo
    );

    Ok(HttpResponse::Created().json(UploadMidiaResp {
        url,
        arquivo: nome_arquivo,
        mime: mime.to_string(),
        bytes: body.len(),
    }))
}

/// Serve imagem pública de produto ou categoria armazenada localmente.
#[utoipa::path(
    get,
    path = "/api/v1/midia/{arquivo}",
    tag = "Catálogo",
    params(("arquivo" = String, Path)),
    responses(
        (status = 200, description = "bytes da imagem"),
        (status = 404, description = "arquivo não encontrado"),
    ),
)]
#[get("/midia/{arquivo}")]
pub async fn servir_midia(arquivo: web::Path<String>) -> Resposta<HttpResponse> {
    let nome = arquivo.into_inner();
    let nome_seguro = !nome.is_empty()
        && nome.len() <= 80
        && !nome.contains("..")
        && !nome.contains('/')
        && !nome.contains('\\')
        && nome
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');
    if !nome_seguro {
        return Err(hweld_application::ErroApp::nao_encontrado("midia", nome).into());
    }

    let caminho = std::path::Path::new("uploads").join(&nome);
    let bytes = tokio::fs::read(&caminho)
        .await
        .map_err(|_| hweld_application::ErroApp::nao_encontrado("midia", &nome))?;

    let mime = detectar_formato_imagem(&bytes)
        .map(|(_, m)| m)
        .unwrap_or("application/octet-stream");

    Ok(HttpResponse::Ok()
        .content_type(mime)
        .insert_header(("Cache-Control", "public, max-age=31536000, immutable"))
        .insert_header(("Cross-Origin-Resource-Policy", "cross-origin"))
        .body(bytes))
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
    referencia: web::Path<String>,
) -> Resposta<HttpResponse> {
    let (tabela, itens) = state.tabelas_preco.buscar_por_ref(&referencia).await?;
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
    referencia: web::Path<String>,
    body: web::Json<TabelaPrecoReq>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let (tabela, _) = state.tabelas_preco.buscar_por_ref(&referencia).await?;
    let tabela = state
        .tabelas_preco
        .atualizar(tabela.id, body.into_inner().input())
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
