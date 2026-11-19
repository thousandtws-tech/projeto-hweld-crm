use crate::erro::Resposta;
use actix_web::{delete, get, patch, post, put, web, HttpResponse};
use hweld_application::ports::catalogo::FiltroProdutos;
use hweld_application::use_cases::catalogo::ItemCatalogoPortal;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::catalogo::categoria::Categoria;
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem};
use hweld_domain::catalogo::tabela_preco::{TabelaPreco, TabelaPrecoItem};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Pagina;
use serde::{Deserialize, Serialize};

use crate::dto::{
    AtualizarImagemProdutoReq, CategoriaReq, ImagemProdutoReq, PrecoItemReq, ProdutoReq,
    QueryCategorias, QueryProdutos, QueryTabelas, TabelaPrecoReq,
};
use crate::estado::AppState;
use crate::extratores::{AuthPortalOpcional, AuthStaff};

const CATALOGO: &[Perfil] = &[Perfil::Admin, Perfil::Estoque, Perfil::Vendedor];
const IMAGENS: &[Perfil] = &[Perfil::Admin, Perfil::Estoque, Perfil::Vendedor];

const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;

#[derive(Serialize, utoipa::ToSchema)]
pub struct UploadMidiaResp {
    pub url: String,
    pub arquivo: String,
    pub mime: String,
    pub bytes: usize,
}

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
    if antes.imagem_url.as_deref() != cat.imagem_url.as_deref() {
        if let Some(antiga) = antes.imagem_url.as_deref() {
            descartar_arquivo_midia(antiga, state.armazenamento.as_ref()).await;
        }
    }
    Ok(HttpResponse::Ok().json(cat))
}

#[utoipa::path(
    delete,
    path = "/api/v1/categorias/{id}",
    tag = "Catálogo",
    params(("id" = i64, Path, description = "id da categoria")),
    responses(
        (status = 204, description = "categoria removida"),
        (status = 404, description = "categoria não encontrada"),
        (status = 409, description = "categoria possui produtos ativos vinculados"),
    ),
    security(("bearer_auth" = [])),
)]
#[delete("/categorias/{id}")]
pub async fn excluir_categoria(
    state: web::Data<AppState>,
    staff: AuthStaff,
    id: web::Path<i64>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let removida = state.categorias.remover(Id::novo(*id)).await?;
    if let Some(img) = removida.imagem_url.as_deref() {
        descartar_arquivo_midia(img, state.armazenamento.as_ref()).await;
    }
    Ok(HttpResponse::NoContent().finish())
}

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
    descartar_arquivo_midia(&removida.url, state.armazenamento.as_ref()).await;
    Ok(HttpResponse::NoContent().finish())
}

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

async fn descartar_arquivo_midia(
    url: &str,
    storage: &dyn hweld_application::ports::armazenamento::ArmazenamentoObjetos,
) {
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
    if let Err(e) = storage.remover(&format!("midia/{nome}")).await {
        tracing::warn!(arquivo = nome, erro = %e, "falha ao descartar objeto de mídia");
    }
}

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
    state: web::Data<AppState>,
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

    let nome_arquivo = format!("{}.{ext}", uuid::Uuid::new_v4().simple());
    state
        .armazenamento
        .salvar(&format!("midia/{nome_arquivo}"), &body, mime)
        .await?;

    let url = format!("/api/v1/midia/{nome_arquivo}");

    Ok(HttpResponse::Created().json(UploadMidiaResp {
        url,
        arquivo: nome_arquivo,
        mime: mime.to_string(),
        bytes: body.len(),
    }))
}

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
pub async fn servir_midia(
    state: web::Data<AppState>,
    arquivo: web::Path<String>,
) -> Resposta<HttpResponse> {
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

    let bytes = state.armazenamento.ler(&format!("midia/{nome}")).await?;

    let mime = detectar_formato_imagem(&bytes)
        .map(|(_, m)| m)
        .unwrap_or("application/octet-stream");

    Ok(HttpResponse::Ok()
        .content_type(mime)
        .insert_header(("Cache-Control", "public, max-age=31536000, immutable"))
        .insert_header(("Cross-Origin-Resource-Policy", "cross-origin"))
        .body(bytes))
}

const CMS_CHAVE: &str = "cms/loja.json";

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct MarcaCms {
    pub id: String,
    pub nome: String,
    pub logo: String,
    #[serde(default = "default_true")]
    pub ativa: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct SlideBannerCms {
    pub id: String,
    #[serde(default)]
    pub badge: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub price: String,
    #[serde(default)]
    pub button_text: String,
    #[serde(default)]
    pub button_link: String,
    pub bg_image: String,
    #[serde(default)]
    pub image_mobile: String,
    #[serde(default)]
    pub product_image: String,
    #[serde(default)]
    pub classe: String,
    #[serde(default = "default_true")]
    pub ativo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CardTrioCms {
    pub id: String,
    pub badge: String,
    pub titulo: String,
    pub descricao: String,
    pub preco_destaque: String,
    pub botao_texto: String,
    pub botao_link: String,
    pub imagem_url: String,
    pub cor: String,
    #[serde(default = "default_true")]
    pub ativo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CardDuoCms {
    pub id: String,
    pub tag: String,
    pub titulo: String,
    pub descricao: String,
    pub destaque: String,
    pub botao_texto: String,
    pub botao_link: String,
    pub imagem_url: String,
    pub estilo: String, // "plasma" | "combo"
    #[serde(default = "default_true")]
    pub ativo: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct SeloCms {
    pub id: String,
    pub titulo: String,
    #[serde(default)]
    pub descricao: String,
    #[serde(default)]
    pub link: String,
    #[serde(default)]
    pub icone_url: String,
    #[serde(default)]
    pub externo: bool,
    #[serde(default = "default_true")]
    pub ativo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct CmsLoja {
    pub marcas: Vec<MarcaCms>,
    pub slides: Vec<SlideBannerCms>,
    pub trio_banners: Vec<CardTrioCms>,
    pub duo_banners: Vec<CardDuoCms>,
    #[serde(default)]
    pub selos: Vec<SeloCms>,
}

fn cms_padrao() -> CmsLoja {
    CmsLoja {
        marcas: vec![
            MarcaCms { id: "esab".into(), nome: "ESAB".into(), logo: "assets/brands/esab.svg".into(), ativa: true },
            MarcaCms { id: "miller".into(), nome: "Miller Electric".into(), logo: "assets/brands/miller.svg".into(), ativa: true },
            MarcaCms { id: "lincoln".into(), nome: "Lincoln Electric".into(), logo: "assets/brands/lincoln-electric.svg".into(), ativa: true },
            MarcaCms { id: "boxer".into(), nome: "Boxer Soldas".into(), logo: "assets/brands/boxer.svg".into(), ativa: true },
            MarcaCms { id: "balmer".into(), nome: "Balmer".into(), logo: "assets/brands/balmer.svg".into(), ativa: true },
            MarcaCms { id: "bambozzi".into(), nome: "Bambozzi".into(), logo: "assets/brands/bambozzi.svg".into(), ativa: true },
            MarcaCms { id: "norton".into(), nome: "Norton Abrasivos".into(), logo: "assets/brands/norton.svg".into(), ativa: true },
            MarcaCms { id: "carbografite".into(), nome: "Carbografite".into(), logo: "assets/brands/carbografite.svg".into(), ativa: true },
            MarcaCms { id: "black-decker".into(), nome: "BLACK+DECKER".into(), logo: "assets/brands/black-decker.png".into(), ativa: true },
            MarcaCms { id: "garthen".into(), nome: "Garthen".into(), logo: "assets/brands/garthen.png".into(), ativa: true },
            MarcaCms { id: "motomil".into(), nome: "MOTOMIL".into(), logo: "assets/brands/motomil.png".into(), ativa: true },
            MarcaCms { id: "pressure".into(), nome: "Pressure".into(), logo: "assets/brands/pressure.png".into(), ativa: true },
            MarcaCms { id: "paletrans".into(), nome: "Paletrans".into(), logo: "assets/brands/paletrans.png".into(), ativa: true },
        ],
        slides: vec![
            SlideBannerCms {
                id: "ferramentas-eletricas".into(),
                badge: "".into(),
                title: "".into(),
                subtitle: "".into(),
                price: "".into(),
                button_text: "".into(),
                button_link: "/busca".into(),
                bg_image: "assets/header/banner/icons/fundo.1.png".into(),
                image_mobile: "assets/header/banner/icons/fundo.1-mobile.png".into(),
                product_image: "".into(),
                classe: "slide-ferramentas".into(),
                ativo: true,
            },
            SlideBannerCms {
                id: "soldagem".into(),
                badge: "LINHA DE SOLDAGEM".into(),
                title: "Equipamentos de Soldagem".into(),
                subtitle: "Soluções e equipamentos para trabalhos de soldagem com qualidade e precisão.".into(),
                price: "".into(),
                button_text: "Ver produtos".into(),
                button_link: "/busca".into(),
                bg_image: "assets/header/banner/icons/fundo.2.png".into(),
                image_mobile: "assets/header/banner/icons/fundo.2-mobile.png".into(),
                product_image: "assets/header/banner/icons/soldagem-produto.png".into(),
                classe: "slide-soldagem".into(),
                ativo: true,
            },
        ],
        trio_banners: vec![
            CardTrioCms {
                id: "trio-1".into(),
                badge: "ATÉ 35% OFF".into(),
                titulo: "Inversoras Industriais IGBT".into(),
                descricao: "Arc Force, Hot Start e bivolt automático para alta produtividade em serralheria.".into(),
                preco_destaque: "A partir de R$ 689,90".into(),
                botao_texto: "Ver Ofertas".into(),
                botao_link: "/busca?q=inversora".into(),
                imagem_url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80".into(),
                cor: "orange".into(),
                ativo: true,
            },
            CardTrioCms {
                id: "trio-2".into(),
                badge: "PROTEÇÃO CERTIFICADA".into(),
                titulo: "Máscaras de Auto-Escurecimento".into(),
                descricao: "Filtro True Color DIN 9-13, 4 sensores e máxima ergonomia com CA ativo.".into(),
                preco_destaque: "Parcele em até 10x sem juros".into(),
                botao_texto: "Conferir Linha".into(),
                botao_link: "/busca?q=mascara".into(),
                imagem_url: "https://images.unsplash.com/photo-1508873535684-277a3cbcc4e8?auto=format&fit=crop&w=800&q=80".into(),
                cor: "cyan".into(),
                ativo: true,
            },
            CardTrioCms {
                id: "trio-3".into(),
                badge: "FATURAMENTO B2B".into(),
                titulo: "Arames MIG & Eletrodos E7018".into(),
                descricao: "Caixas fechadas e bobinas de 15kg com desconto progressivo para CNPJ.".into(),
                preco_destaque: "Preço direto de distribuidora".into(),
                botao_texto: "Comprar Lote".into(),
                botao_link: "/busca?q=eletrodo".into(),
                imagem_url: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=800&q=80".into(),
                cor: "blue".into(),
                ativo: true,
            },
        ],
        duo_banners: vec![
            CardDuoCms {
                id: "duo-1".into(),
                tag: "LINHA CORTE CNC".into(),
                titulo: "Sistemas de Corte Plasma de Alta Definição".into(),
                descricao: "Precisão milimétrica em aço carbono, inox e alumínio. Corte rápido com tochas de alta durabilidade e consumíveis de reposição imediata.".into(),
                destaque: "Corte até 32mm de espessura".into(),
                botao_texto: "Ver Máquinas Plasma".into(),
                botao_link: "/busca?q=plasma".into(),
                imagem_url: "https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?auto=format&fit=crop&w=900&q=80".into(),
                estilo: "plasma".into(),
                ativo: true,
            },
            CardDuoCms {
                id: "duo-2".into(),
                tag: "COMBOS PROFISSIONAIS".into(),
                titulo: "Kits Completos para Serralheria & Oficinas".into(),
                descricao: "Leve Máquina Inversora + Máscara Automática + Tocha + Eletrodos com economia garantida de combo e frete unificado para sua empresa.".into(),
                destaque: "Economia de até R$ 420,00 no combo".into(),
                botao_texto: "Montar Meu Kit".into(),
                botao_link: "/busca?q=kit".into(),
                imagem_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80".into(),
                estilo: "combo".into(),
                ativo: true,
            },
        ],
        selos: selos_padrao(),
    }
}

fn selos_padrao() -> Vec<SeloCms> {
    vec![
        SeloCms {
            id: "entrega-brasil".into(),
            titulo: "Entrega em Todo o Brasil".into(),
            descricao: "".into(),
            link: "/conta/pedidos".into(),
            icone_url: "assets/header/icons/icon-map.png".into(),
            externo: false,
            ativo: true,
        },
        SeloCms {
            id: "faturamento-direto".into(),
            titulo: "Faturamento Direto".into(),
            descricao: "".into(),
            link: "/conta".into(),
            icone_url: "assets/header/icons/icon-faturamento-direto.png".into(),
            externo: false,
            ativo: true,
        },
        SeloCms {
            id: "cotacao-b2b".into(),
            titulo: "Cotação B2B em 30 min".into(),
            descricao: "Preço especial por lote e atacado".into(),
            link: "/busca".into(),
            icone_url: "assets/header/icons/icon-cotacao.png".into(),
            externo: false,
            ativo: true,
        },
        SeloCms {
            id: "portal-cnpj".into(),
            titulo: "Portal do Cliente CNPJ".into(),
            descricao: "2ª via, faturas e suporte de fábrica".into(),
            link: "/conta".into(),
            icone_url: "assets/header/icons/icon-usuario.png".into(),
            externo: false,
            ativo: true,
        },
        SeloCms {
            id: "instagram".into(),
            titulo: "Instagram Oficial".into(),
            descricao: "Dicas técnicas e novidades @hweld".into(),
            link: "https://instagram.com".into(),
            icone_url: "assets/header/icons/icon-instagram.png".into(),
            externo: true,
            ativo: true,
        },
    ]
}

static CMS_CACHE: std::sync::RwLock<Option<(std::time::Instant, std::sync::Arc<CmsLoja>)>> =
    std::sync::RwLock::new(None);
const CMS_TTL: std::time::Duration = std::time::Duration::from_secs(30);

async fn carregar_cms(
    storage: &dyn hweld_application::ports::armazenamento::ArmazenamentoObjetos,
) -> std::sync::Arc<CmsLoja> {
    if let Ok(g) = CMS_CACHE.read() {
        if let Some((expira, cms)) = g.as_ref() {
            if std::time::Instant::now() < *expira {
                return cms.clone();
            }
        }
    }
    let cms = std::sync::Arc::new(carregar_cms_remoto(storage).await);
    if let Ok(mut g) = CMS_CACHE.write() {
        *g = Some((std::time::Instant::now() + CMS_TTL, cms.clone()));
    }
    cms
}

fn invalidar_cms_cache() {
    if let Ok(mut g) = CMS_CACHE.write() {
        *g = None;
    }
}

async fn carregar_cms_remoto(
    storage: &dyn hweld_application::ports::armazenamento::ArmazenamentoObjetos,
) -> CmsLoja {
    if let Ok(bytes) = storage.ler(CMS_CHAVE).await {
        if let Ok(mut cms) = serde_json::from_slice::<CmsLoja>(&bytes) {
            if cms.selos.is_empty() {
                cms.selos = selos_padrao();
            }
            return cms;
        }
    }
    let padrao = cms_padrao();
    let _ = salvar_cms(storage, &padrao).await;
    padrao
}

async fn salvar_cms(
    storage: &dyn hweld_application::ports::armazenamento::ArmazenamentoObjetos,
    cms: &CmsLoja,
) -> Result<(), hweld_application::ErroApp> {
    let json = serde_json::to_vec_pretty(cms)
        .map_err(|e| hweld_application::ErroApp::interno("cms_json", e))?;
    storage.salvar(CMS_CHAVE, &json, "application/json").await
}

#[get("/portal/cms")]
pub async fn obter_cms_publico(state: web::Data<AppState>) -> Resposta<HttpResponse> {
    let cms = carregar_cms(state.armazenamento.as_ref()).await;
    Ok(HttpResponse::Ok().json(cms))
}

#[get("/cms")]
pub async fn obter_cms_staff(
    state: web::Data<AppState>,
    _staff: AuthStaff,
) -> Resposta<HttpResponse> {
    let cms = carregar_cms(state.armazenamento.as_ref()).await;
    Ok(HttpResponse::Ok().json(cms))
}

/// Atualiza o CMS da loja (marcas, banners topo, trio e duo) e publica em tempo real.
#[put("/cms")]
pub async fn salvar_cms_staff(
    state: web::Data<AppState>,
    staff: AuthStaff,
    body: web::Json<CmsLoja>,
) -> Resposta<HttpResponse> {
    staff.exige(CATALOGO)?;
    let cms = body.into_inner();
    salvar_cms(state.armazenamento.as_ref(), &cms).await?;
    invalidar_cms_cache();
    state.categorias.publicar_cms_atualizado();
    Ok(HttpResponse::Ok().json(cms))
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
    portal: AuthPortalOpcional,
    q: web::Query<QueryProdutos>,
) -> Resposta<HttpResponse> {
    let empresa_id = match portal.contato_id() {
        Some(cid) => state
            .contatos
            .buscar(Id::novo(cid))
            .await
            .ok()
            .map(|c| c.empresa_id),
        None => None,
    };
    let pagina = state
        .catalogo_portal
        .catalogo(
            empresa_id,
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
