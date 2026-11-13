//! `usuarios` — repositório SQLx. Row → domínio via `TryFrom` (enums TEXT).

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_application::ports::acesso::{AtualizarUsuario, FiltroUsuarios, RepositorioUsuarios};
use hweld_application::{ErroApp, Resultado};
use hweld_domain::acesso::usuario::{NovoUsuario, Usuario};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::cache::{invalidar_listas, CacheListas};
use super::db::erro_db;

const CTX: &str = "usuarios";
const COLS: &str = "id, nome, email, senha_hash, perfil, ativo, created_at, updated_at";

#[derive(FromRow)]
struct UsuarioRow {
    id: i64,
    nome: String,
    email: String,
    senha_hash: String,
    perfil: String,
    ativo: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<UsuarioRow> for Usuario {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: UsuarioRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            nome: r.nome,
            email: r.email,
            senha_hash: r.senha_hash,
            perfil: r.perfil.parse()?,
            ativo: r.ativo,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_row(r: UsuarioRow) -> Resultado<Usuario> {
    Usuario::try_from(r).map_err(ErroApp::Dominio)
}

/// Filtros dinâmicos — mesma função alimenta o COUNT e o SELECT,
/// garantindo binds idênticos nas duas queries.
fn push_filtro<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroUsuarios) {
    if let Some(perfil) = filtro.perfil {
        qb.push(" AND perfil = ").push_bind(perfil.as_str());
    }
    if let Some(ativo) = filtro.ativo {
        qb.push(" AND ativo = ").push_bind(ativo);
    }
    if let Some(busca) = filtro.busca.as_ref().filter(|b| !b.trim().is_empty()) {
        let padrao = format!("%{}%", busca.trim());
        qb.push(" AND (nome ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR email ILIKE ")
            .push_bind(padrao)
            .push(")");
    }
}

pub struct RepositorioUsuariosPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Usuario>>,
}

impl RepositorioUsuariosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("usuarios"),
        }
    }
}

#[async_trait]
impl RepositorioUsuarios for RepositorioUsuariosPg {
    async fn buscar_por_id(&self, id: Id<Usuario>) -> Resultado<Option<Usuario>> {
        let row =
            sqlx::query_as::<_, UsuarioRow>(&format!("SELECT {COLS} FROM usuarios WHERE id = $1"))
                .bind(id.valor())
                .fetch_optional(&self.pool)
                .await
                .map_err(erro_db(CTX))?;
        row.map(map_row).transpose()
    }

    async fn buscar_por_email(&self, email: &str) -> Resultado<Option<Usuario>> {
        let row = sqlx::query_as::<_, UsuarioRow>(&format!(
            "SELECT {COLS} FROM usuarios WHERE email = $1"
        ))
        .bind(email.to_lowercase())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        row.map(map_row).transpose()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroUsuarios,
    ) -> Resultado<Pagina<Usuario>> {
        let chave = format!("{paginacao:?}|{filtro:?}");
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM usuarios WHERE TRUE");
        push_filtro(&mut count_qb, &filtro);

        let mut qb =
            QueryBuilder::<Postgres>::new(&format!("SELECT {COLS} FROM usuarios WHERE TRUE"));
        push_filtro(&mut qb, &filtro);
        qb.push(" ORDER BY id")
            .push(" LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<UsuarioRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX))?;
        let rows = rows_res.map_err(erro_db(CTX))?;

        let itens = rows
            .into_iter()
            .map(map_row)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    async fn criar(&self, novo: NovoUsuario) -> Resultado<Usuario> {
        let row = sqlx::query_as::<_, UsuarioRow>(&format!(
            "INSERT INTO usuarios (nome, email, senha_hash, perfil) \
             VALUES ($1, $2, $3, $4) RETURNING {COLS}"
        ))
        .bind(novo.nome)
        .bind(novo.email.to_lowercase())
        .bind(novo.senha_hash)
        .bind(novo.perfil.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        let usuario = map_row(row)?;
        invalidar_listas();
        Ok(usuario)
    }

    async fn atualizar(&self, id: Id<Usuario>, dados: AtualizarUsuario) -> Resultado<Usuario> {
        let mut qb = QueryBuilder::<Postgres>::new("UPDATE usuarios SET updated_at = now()");
        if let Some(nome) = dados.nome {
            qb.push(", nome = ").push_bind(nome);
        }
        if let Some(email) = dados.email {
            qb.push(", email = ").push_bind(email.to_lowercase());
        }
        if let Some(perfil) = dados.perfil {
            qb.push(", perfil = ").push_bind(perfil.as_str());
        }
        qb.push(" WHERE id = ").push_bind(id.valor());
        qb.push(format!(" RETURNING {COLS}"));
        let row = qb
            .build_query_as::<UsuarioRow>()
            .fetch_one(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        let usuario = map_row(row)?;
        invalidar_listas();
        Ok(usuario)
    }

    async fn definir_ativo(&self, id: Id<Usuario>, ativo: bool) -> Resultado<()> {
        sqlx::query("UPDATE usuarios SET ativo = $2, updated_at = now() WHERE id = $1")
            .bind(id.valor())
            .bind(ativo)
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        invalidar_listas();
        Ok(())
    }

    async fn atualizar_senha(&self, id: Id<Usuario>, senha_hash: &str) -> Resultado<()> {
        sqlx::query("UPDATE usuarios SET senha_hash = $2, updated_at = now() WHERE id = $1")
            .bind(id.valor())
            .bind(senha_hash)
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        invalidar_listas();
        Ok(())
    }

    async fn total(&self) -> Resultado<i64> {
        let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM usuarios")
            .fetch_one(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        Ok(n)
    }
}
