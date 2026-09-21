//! Módulo catálogo — categorias (árvore), produtos + imagens, tabelas de preço.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_application::ports::catalogo::{
    FiltroProdutos, RepositorioCategorias, RepositorioProdutos, RepositorioTabelasPreco,
};
use hweld_application::Resultado;
use hweld_domain::catalogo::categoria::{Categoria, CategoriaInput};
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem, ProdutoInput};
use hweld_domain::catalogo::tabela_preco::{TabelaPreco, TabelaPrecoInput, TabelaPrecoItem};
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::db::erro_db;

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

const CTX_CAT: &str = "categorias";
const CAT_COLS: &str =
    "id, categoria_pai_id, nome, slug, descricao, imagem_url, ordem, ativa, created_at, updated_at";

#[derive(FromRow)]
struct CategoriaRow {
    id: i64,
    categoria_pai_id: Option<i64>,
    nome: String,
    slug: String,
    descricao: Option<String>,
    imagem_url: Option<String>,
    ordem: i32,
    ativa: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<CategoriaRow> for Categoria {
    fn from(r: CategoriaRow) -> Self {
        Self {
            id: Id::novo(r.id),
            categoria_pai_id: r.categoria_pai_id.map(Id::novo),
            nome: r.nome,
            slug: r.slug,
            descricao: r.descricao,
            imagem_url: r.imagem_url,
            ordem: r.ordem,
            ativa: r.ativa,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

pub struct RepositorioCategoriasPg {
    pool: PgPool,
}

impl RepositorioCategoriasPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioCategorias for RepositorioCategoriasPg {
    async fn buscar_por_id(&self, id: Id<Categoria>) -> Resultado<Option<Categoria>> {
        let row = sqlx::query_as::<_, CategoriaRow>(&format!(
            "SELECT {CAT_COLS} FROM categorias WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_CAT))?;
        Ok(row.map(Categoria::from))
    }

    async fn buscar_por_slug(&self, slug: &str) -> Resultado<Option<Categoria>> {
        let row = sqlx::query_as::<_, CategoriaRow>(&format!(
            "SELECT {CAT_COLS} FROM categorias WHERE slug = $1"
        ))
        .bind(slug)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_CAT))?;
        Ok(row.map(Categoria::from))
    }

    async fn listar_todas(&self, somente_ativas: bool) -> Resultado<Vec<Categoria>> {
        let sql = if somente_ativas {
            format!("SELECT {CAT_COLS} FROM categorias WHERE ativa ORDER BY ordem, nome")
        } else {
            format!("SELECT {CAT_COLS} FROM categorias ORDER BY ordem, nome")
        };
        let rows = sqlx::query_as::<_, CategoriaRow>(&sql)
            .fetch_all(&self.pool)
            .await
            .map_err(erro_db(CTX_CAT))?;
        Ok(rows.into_iter().map(Categoria::from).collect())
    }

    async fn criar(&self, input: CategoriaInput) -> Resultado<Categoria> {
        let row = sqlx::query_as::<_, CategoriaRow>(&format!(
            "INSERT INTO categorias (categoria_pai_id, nome, slug, descricao, imagem_url, ordem, ativa) \
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING {CAT_COLS}"
        ))
        .bind(input.categoria_pai_id.map(|i| i.valor()))
        .bind(input.nome)
        .bind(input.slug.unwrap_or_default())
        .bind(input.descricao)
        .bind(input.imagem_url)
        .bind(input.ordem)
        .bind(input.ativa)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_CAT))?;
        Ok(Categoria::from(row))
    }

    async fn atualizar(&self, id: Id<Categoria>, input: CategoriaInput) -> Resultado<Categoria> {
        let row = sqlx::query_as::<_, CategoriaRow>(&format!(
            "UPDATE categorias SET categoria_pai_id=$2, nome=$3, slug=$4, descricao=$5, \
             imagem_url=$6, ordem=$7, ativa=$8, updated_at=now() WHERE id=$1 RETURNING {CAT_COLS}"
        ))
        .bind(id.valor())
        .bind(input.categoria_pai_id.map(|i| i.valor()))
        .bind(input.nome)
        .bind(input.slug.unwrap_or_default())
        .bind(input.descricao)
        .bind(input.imagem_url)
        .bind(input.ordem)
        .bind(input.ativa)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_CAT))?;
        Ok(Categoria::from(row))
    }

    async fn definir_ativa(&self, id: Id<Categoria>, ativa: bool) -> Resultado<()> {
        sqlx::query("UPDATE categorias SET ativa=$2, updated_at=now() WHERE id=$1")
            .bind(id.valor())
            .bind(ativa)
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_CAT))?;
        Ok(())
    }

    /// Caminhamento iterativo na árvore — `ancestral` é pai/avo/... de `id`?
    /// O grafo é pequeno (categorias), então um laço por nível basta.
    async fn eh_descendente(&self, id: Id<Categoria>, ancestral: Id<Categoria>) -> Resultado<bool> {
        let mut atual = Some(id.valor());
        while let Some(n) = atual {
            if n == ancestral.valor() {
                return Ok(true);
            }
            atual = sqlx::query_scalar("SELECT categoria_pai_id FROM categorias WHERE id = $1")
                .bind(n)
                .fetch_optional(&self.pool)
                .await
                .map_err(erro_db(CTX_CAT))?
                .flatten();
        }
        Ok(false)
    }
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

const CTX_PROD: &str = "produtos";
const PROD_COLS: &str = "id, sku, nome, slug, categoria_id, marca, unidade_medida, \
    descricao_curta, descricao_tecnica, ncm, origem_mercadoria, peso_kg, altura_cm, \
    largura_cm, comprimento_cm, preco_custo, preco_venda, estoque_minimo, \
    controla_estoque, ativo, destaque, created_at, updated_at, deleted_at";
const IMG_COLS: &str = "id, produto_id, url, alt_text, ordem, is_principal";

#[derive(FromRow)]
struct ProdutoRow {
    id: i64,
    sku: String,
    nome: String,
    slug: String,
    categoria_id: i64,
    marca: Option<String>,
    unidade_medida: Option<String>,
    descricao_curta: Option<String>,
    descricao_tecnica: Option<String>,
    ncm: Option<String>,
    origem_mercadoria: String,
    peso_kg: Option<Decimal>,
    altura_cm: Option<Decimal>,
    largura_cm: Option<Decimal>,
    comprimento_cm: Option<Decimal>,
    preco_custo: Option<Decimal>,
    preco_venda: Decimal,
    estoque_minimo: Option<Decimal>,
    controla_estoque: bool,
    ativo: bool,
    destaque: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
}

impl From<ProdutoRow> for Produto {
    fn from(r: ProdutoRow) -> Self {
        Self {
            id: Id::novo(r.id),
            sku: r.sku,
            nome: r.nome,
            slug: r.slug,
            categoria_id: Id::novo(r.categoria_id),
            marca: r.marca,
            unidade_medida: r.unidade_medida,
            descricao_curta: r.descricao_curta,
            descricao_tecnica: r.descricao_tecnica,
            ncm: r.ncm,
            origem_mercadoria: r.origem_mercadoria,
            peso_kg: r.peso_kg,
            altura_cm: r.altura_cm,
            largura_cm: r.largura_cm,
            comprimento_cm: r.comprimento_cm,
            preco_custo: r.preco_custo.map(Dinheiro::novo),
            preco_venda: Dinheiro::novo(r.preco_venda),
            estoque_minimo: r.estoque_minimo,
            controla_estoque: r.controla_estoque,
            ativo: r.ativo,
            destaque: r.destaque,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
        }
    }
}

#[derive(FromRow)]
struct ProdutoImagemRow {
    id: i64,
    produto_id: i64,
    url: String,
    alt_text: Option<String>,
    ordem: i32,
    is_principal: bool,
}

impl From<ProdutoImagemRow> for ProdutoImagem {
    fn from(r: ProdutoImagemRow) -> Self {
        Self {
            id: Id::novo(r.id),
            produto_id: Id::novo(r.produto_id),
            url: r.url,
            alt_text: r.alt_text,
            ordem: r.ordem,
            is_principal: r.is_principal,
        }
    }
}

pub struct RepositorioProdutosPg {
    pool: PgPool,
}

impl RepositorioProdutosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioProdutos for RepositorioProdutosPg {
    async fn buscar_por_id(&self, id: Id<Produto>) -> Resultado<Option<Produto>> {
        let row = sqlx::query_as::<_, ProdutoRow>(&format!(
            "SELECT {PROD_COLS} FROM produtos WHERE id = $1 AND deleted_at IS NULL"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_PROD))?;
        Ok(row.map(Produto::from))
    }

    async fn buscar_por_ids(&self, ids: &[Id<Produto>]) -> Resultado<Vec<Produto>> {
        let valores: Vec<i64> = ids.iter().map(|i| i.valor()).collect();
        let rows = sqlx::query_as::<_, ProdutoRow>(&format!(
            "SELECT {PROD_COLS} FROM produtos WHERE id = ANY($1) AND deleted_at IS NULL"
        ))
        .bind(valores)
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_PROD))?;
        Ok(rows.into_iter().map(Produto::from).collect())
    }

    async fn buscar_por_sku(&self, sku: &str) -> Resultado<Option<Produto>> {
        let row = sqlx::query_as::<_, ProdutoRow>(&format!(
            "SELECT {PROD_COLS} FROM produtos WHERE sku = $1 AND deleted_at IS NULL"
        ))
        .bind(sku.to_uppercase())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_PROD))?;
        Ok(row.map(Produto::from))
    }

    async fn buscar_por_slug(&self, slug: &str) -> Resultado<Option<Produto>> {
        let row = sqlx::query_as::<_, ProdutoRow>(&format!(
            "SELECT {PROD_COLS} FROM produtos WHERE slug = $1 AND deleted_at IS NULL"
        ))
        .bind(slug)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_PROD))?;
        Ok(row.map(Produto::from))
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroProdutos,
    ) -> Resultado<Pagina<Produto>> {
        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM produtos WHERE deleted_at IS NULL");
        push_filtro_produtos(&mut count_qb, &filtro);
        let (total,): (i64,) = count_qb
            .build_query_as()
            .fetch_one(&self.pool)
            .await
            .map_err(erro_db(CTX_PROD))?;

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {PROD_COLS} FROM produtos WHERE deleted_at IS NULL"
        ));
        push_filtro_produtos(&mut qb, &filtro);
        qb.push(" ORDER BY nome LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let rows = qb
            .build_query_as::<ProdutoRow>()
            .fetch_all(&self.pool)
            .await
            .map_err(erro_db(CTX_PROD))?;

        Ok(Pagina::nova(
            rows.into_iter().map(Produto::from).collect(),
            total,
            paginacao,
        ))
    }

    async fn criar(&self, input: ProdutoInput) -> Resultado<Produto> {
        let row = sqlx::query_as::<_, ProdutoRow>(&format!(
            "INSERT INTO produtos (sku, nome, slug, categoria_id, marca, unidade_medida, \
             descricao_curta, descricao_tecnica, ncm, origem_mercadoria, peso_kg, \
             altura_cm, largura_cm, comprimento_cm, preco_custo, preco_venda, \
             estoque_minimo, controla_estoque, ativo, destaque) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) \
             RETURNING {PROD_COLS}"
        ))
        .bind(input.sku)
        .bind(input.nome)
        .bind(input.slug.unwrap_or_default())
        .bind(input.categoria_id.valor())
        .bind(input.marca)
        .bind(input.unidade_medida)
        .bind(input.descricao_curta)
        .bind(input.descricao_tecnica)
        .bind(input.ncm)
        .bind(input.origem_mercadoria.unwrap_or_else(|| "0".into()))
        .bind(input.peso_kg)
        .bind(input.altura_cm)
        .bind(input.largura_cm)
        .bind(input.comprimento_cm)
        .bind(input.preco_custo)
        .bind(input.preco_venda)
        .bind(input.estoque_minimo)
        .bind(input.controla_estoque)
        .bind(input.ativo)
        .bind(input.destaque)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_PROD))?;
        Ok(Produto::from(row))
    }

    async fn atualizar(&self, id: Id<Produto>, input: ProdutoInput) -> Resultado<Produto> {
        let row = sqlx::query_as::<_, ProdutoRow>(&format!(
            "UPDATE produtos SET sku=$2, nome=$3, slug=$4, categoria_id=$5, marca=$6, \
             unidade_medida=$7, descricao_curta=$8, descricao_tecnica=$9, ncm=$10, \
             origem_mercadoria=$11, peso_kg=$12, altura_cm=$13, largura_cm=$14, \
             comprimento_cm=$15, preco_custo=$16, preco_venda=$17, estoque_minimo=$18, \
             controla_estoque=$19, ativo=$20, destaque=$21, updated_at=now() \
             WHERE id=$1 AND deleted_at IS NULL RETURNING {PROD_COLS}"
        ))
        .bind(id.valor())
        .bind(input.sku)
        .bind(input.nome)
        .bind(input.slug.unwrap_or_default())
        .bind(input.categoria_id.valor())
        .bind(input.marca)
        .bind(input.unidade_medida)
        .bind(input.descricao_curta)
        .bind(input.descricao_tecnica)
        .bind(input.ncm)
        .bind(input.origem_mercadoria.unwrap_or_else(|| "0".into()))
        .bind(input.peso_kg)
        .bind(input.altura_cm)
        .bind(input.largura_cm)
        .bind(input.comprimento_cm)
        .bind(input.preco_custo)
        .bind(input.preco_venda)
        .bind(input.estoque_minimo)
        .bind(input.controla_estoque)
        .bind(input.ativo)
        .bind(input.destaque)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_PROD))?;
        Ok(Produto::from(row))
    }

    async fn arquivar(&self, id: Id<Produto>) -> Resultado<()> {
        sqlx::query("UPDATE produtos SET deleted_at = now(), updated_at = now() WHERE id = $1")
            .bind(id.valor())
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_PROD))?;
        Ok(())
    }

    async fn listar_imagens(&self, produto_id: Id<Produto>) -> Resultado<Vec<ProdutoImagem>> {
        let rows = sqlx::query_as::<_, ProdutoImagemRow>(&format!(
            "SELECT {IMG_COLS} FROM produto_imagens WHERE produto_id = $1 ORDER BY ordem, id"
        ))
        .bind(produto_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_PROD))?;
        Ok(rows.into_iter().map(ProdutoImagem::from).collect())
    }

    /// Nova imagem principal desmarca as demais na mesma transação.
    async fn adicionar_imagem(
        &self,
        produto_id: Id<Produto>,
        url: &str,
        alt_text: Option<&str>,
        ordem: i32,
        principal: bool,
    ) -> Resultado<ProdutoImagem> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_PROD))?;
        if principal {
            sqlx::query("UPDATE produto_imagens SET is_principal = FALSE WHERE produto_id = $1")
                .bind(produto_id.valor())
                .execute(&mut *tx)
                .await
                .map_err(erro_db(CTX_PROD))?;
        }
        let row = sqlx::query_as::<_, ProdutoImagemRow>(&format!(
            "INSERT INTO produto_imagens (produto_id, url, alt_text, ordem, is_principal) \
             VALUES ($1,$2,$3,$4,$5) RETURNING {IMG_COLS}"
        ))
        .bind(produto_id.valor())
        .bind(url)
        .bind(alt_text)
        .bind(ordem)
        .bind(principal)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_PROD))?;
        let img = ProdutoImagem::from(row);
        tx.commit().await.map_err(erro_db(CTX_PROD))?;
        Ok(img)
    }

    async fn remover_imagem(&self, imagem_id: Id<ProdutoImagem>) -> Resultado<()> {
        sqlx::query("DELETE FROM produto_imagens WHERE id = $1")
            .bind(imagem_id.valor())
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_PROD))?;
        Ok(())
    }
}

fn push_filtro_produtos<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroProdutos) {
    if let Some(categoria_id) = filtro.categoria_id {
        qb.push(" AND categoria_id = ")
            .push_bind(categoria_id.valor());
    }
    if let Some(ativo) = filtro.ativo {
        qb.push(" AND ativo = ").push_bind(ativo);
    }
    if let Some(destaque) = filtro.destaque {
        qb.push(" AND destaque = ").push_bind(destaque);
    }
    if let Some(busca) = filtro.busca.as_ref().filter(|b| !b.trim().is_empty()) {
        let padrao = format!("%{}%", busca.trim());
        qb.push(" AND (nome ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR sku ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR descricao_curta ILIKE ")
            .push_bind(padrao)
            .push(")");
    }
}

// ---------------------------------------------------------------------------
// Tabelas de preço
// ---------------------------------------------------------------------------

const CTX_TAB: &str = "tabelas_preco";
const TAB_COLS: &str = "id, nome, descricao, ativa, created_at, updated_at";
const TAB_ITEM_COLS: &str = "id, tabela_preco_id, produto_id, preco";

#[derive(FromRow)]
struct TabelaPrecoRow {
    id: i64,
    nome: String,
    descricao: Option<String>,
    ativa: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<TabelaPrecoRow> for TabelaPreco {
    fn from(r: TabelaPrecoRow) -> Self {
        Self {
            id: Id::novo(r.id),
            nome: r.nome,
            descricao: r.descricao,
            ativa: r.ativa,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(FromRow)]
struct TabelaPrecoItemRow {
    id: i64,
    tabela_preco_id: i64,
    produto_id: i64,
    preco: Decimal,
}

impl From<TabelaPrecoItemRow> for TabelaPrecoItem {
    fn from(r: TabelaPrecoItemRow) -> Self {
        Self {
            id: Id::novo(r.id),
            tabela_preco_id: Id::novo(r.tabela_preco_id),
            produto_id: Id::novo(r.produto_id),
            preco: Dinheiro::novo(r.preco),
        }
    }
}

pub struct RepositorioTabelasPrecoPg {
    pool: PgPool,
}

impl RepositorioTabelasPrecoPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioTabelasPreco for RepositorioTabelasPrecoPg {
    async fn buscar_por_id(&self, id: Id<TabelaPreco>) -> Resultado<Option<TabelaPreco>> {
        let row = sqlx::query_as::<_, TabelaPrecoRow>(&format!(
            "SELECT {TAB_COLS} FROM tabelas_preco WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_TAB))?;
        Ok(row.map(TabelaPreco::from))
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        ativa: Option<bool>,
    ) -> Resultado<Pagina<TabelaPreco>> {
        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM tabelas_preco WHERE TRUE");
        if let Some(a) = ativa {
            count_qb.push(" AND ativa = ").push_bind(a);
        }
        let (total,): (i64,) = count_qb
            .build_query_as()
            .fetch_one(&self.pool)
            .await
            .map_err(erro_db(CTX_TAB))?;

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {TAB_COLS} FROM tabelas_preco WHERE TRUE"
        ));
        if let Some(a) = ativa {
            qb.push(" AND ativa = ").push_bind(a);
        }
        qb.push(" ORDER BY nome LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let rows = qb
            .build_query_as::<TabelaPrecoRow>()
            .fetch_all(&self.pool)
            .await
            .map_err(erro_db(CTX_TAB))?;

        Ok(Pagina::nova(
            rows.into_iter().map(TabelaPreco::from).collect(),
            total,
            paginacao,
        ))
    }

    async fn criar(&self, input: TabelaPrecoInput) -> Resultado<TabelaPreco> {
        let row = sqlx::query_as::<_, TabelaPrecoRow>(&format!(
            "INSERT INTO tabelas_preco (nome, descricao, ativa) VALUES ($1,$2,$3) RETURNING {TAB_COLS}"
        ))
        .bind(input.nome)
        .bind(input.descricao)
        .bind(input.ativa)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_TAB))?;
        Ok(TabelaPreco::from(row))
    }

    async fn atualizar(
        &self,
        id: Id<TabelaPreco>,
        input: TabelaPrecoInput,
    ) -> Resultado<TabelaPreco> {
        let row = sqlx::query_as::<_, TabelaPrecoRow>(&format!(
            "UPDATE tabelas_preco SET nome=$2, descricao=$3, ativa=$4, updated_at=now() \
             WHERE id=$1 RETURNING {TAB_COLS}"
        ))
        .bind(id.valor())
        .bind(input.nome)
        .bind(input.descricao)
        .bind(input.ativa)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_TAB))?;
        Ok(TabelaPreco::from(row))
    }

    async fn listar_itens(&self, tabela_id: Id<TabelaPreco>) -> Resultado<Vec<TabelaPrecoItem>> {
        let rows = sqlx::query_as::<_, TabelaPrecoItemRow>(&format!(
            "SELECT {TAB_ITEM_COLS} FROM tabela_preco_itens WHERE tabela_preco_id = $1 ORDER BY produto_id"
        ))
        .bind(tabela_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_TAB))?;
        Ok(rows.into_iter().map(TabelaPrecoItem::from).collect())
    }

    /// UPSERT do preço do produto na tabela — única linha por (tabela, produto).
    async fn definir_preco(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
        preco: Dinheiro,
    ) -> Resultado<TabelaPrecoItem> {
        let row = sqlx::query_as::<_, TabelaPrecoItemRow>(&format!(
            "INSERT INTO tabela_preco_itens (tabela_preco_id, produto_id, preco) \
             VALUES ($1,$2,$3) \
             ON CONFLICT (tabela_preco_id, produto_id) DO UPDATE SET preco = EXCLUDED.preco \
             RETURNING {TAB_ITEM_COLS}"
        ))
        .bind(tabela_id.valor())
        .bind(produto_id.valor())
        .bind(preco.valor())
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_TAB))?;
        Ok(TabelaPrecoItem::from(row))
    }

    async fn remover_item(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
    ) -> Resultado<()> {
        sqlx::query(
            "DELETE FROM tabela_preco_itens WHERE tabela_preco_id = $1 AND produto_id = $2",
        )
        .bind(tabela_id.valor())
        .bind(produto_id.valor())
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX_TAB))?;
        Ok(())
    }

    /// Tabela ativa vinculada à empresa + seus itens — base da precificação B2B.
    async fn tabela_da_empresa(
        &self,
        empresa_id: Id<Empresa>,
    ) -> Resultado<Option<(TabelaPreco, Vec<TabelaPrecoItem>)>> {
        // `id` precisa do alias — `empresas` também tem coluna `id`.
        let tabela = sqlx::query_as::<_, TabelaPrecoRow>(&format!(
            "SELECT {} FROM tabelas_preco t \
             JOIN empresas e ON e.tabela_preco_id = t.id \
             WHERE e.id = $1 AND t.ativa AND e.deleted_at IS NULL",
            TAB_COLS
                .split(", ")
                .map(|c| format!("t.{c}"))
                .collect::<Vec<_>>()
                .join(", ")
        ))
        .bind(empresa_id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_TAB))?;
        match tabela {
            None => Ok(None),
            Some(t) => {
                let itens = self.listar_itens(Id::novo(t.id)).await?;
                Ok(Some((TabelaPreco::from(t), itens)))
            }
        }
    }
}
