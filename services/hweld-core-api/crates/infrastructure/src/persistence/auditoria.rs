//! `logs_auditoria` — trilha append-only (§4.18).
//! Dois papéis: `RepositorioAuditoriaPg` (consulta paginada) e
//! `RegistradorAuditoriaPg` (escrita — falha vira log, nunca derruba a operação).

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_application::ports::auditoria::{FiltroAuditoria, RepositorioAuditoria};
use hweld_application::ports::externos::RegistradorAuditoria;
use hweld_application::{ErroApp, Resultado};
use hweld_domain::auditoria::log::{EventoAuditoria, LogAuditoria};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use serde_json::Value;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::cache::{CacheListas, invalidar_listas};
use super::db::erro_db;

const CTX: &str = "logs_auditoria";
const COLS: &str = "id, usuario_id, entidade, entidade_id, acao, dados_antes, \
    dados_depois, ip, created_at";

#[derive(FromRow)]
struct LogRow {
    id: i64,
    usuario_id: Option<i64>,
    entidade: String,
    entidade_id: i64,
    acao: String,
    dados_antes: Option<Value>,
    dados_depois: Option<Value>,
    ip: Option<String>,
    created_at: DateTime<Utc>,
}

impl TryFrom<LogRow> for LogAuditoria {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: LogRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            usuario_id: r.usuario_id.map(Id::novo),
            entidade: r.entidade,
            entidade_id: r.entidade_id,
            acao: r.acao.parse()?,
            dados_antes: r.dados_antes,
            dados_depois: r.dados_depois,
            ip: r.ip,
            created_at: r.created_at,
        })
    }
}

pub struct RepositorioAuditoriaPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<LogAuditoria>>,
}

impl RepositorioAuditoriaPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("logs_auditoria"),
        }
    }
}

#[async_trait]
impl RepositorioAuditoria for RepositorioAuditoriaPg {
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroAuditoria,
    ) -> Resultado<Pagina<LogAuditoria>> {
        let chave = format!("{paginacao:?}|{filtro:?}");
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM logs_auditoria WHERE TRUE");
        push_filtro(&mut count_qb, &filtro);

        let mut qb =
            QueryBuilder::<Postgres>::new(&format!("SELECT {COLS} FROM logs_auditoria WHERE TRUE"));
        push_filtro(&mut qb, &filtro);
        qb.push(" ORDER BY id DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<LogRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX))?;
        let rows = rows_res.map_err(erro_db(CTX))?;

        let itens = rows
            .into_iter()
            .map(|r| LogAuditoria::try_from(r).map_err(ErroApp::Dominio))
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }
}

fn push_filtro<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroAuditoria) {
    if let Some(entidade) = &filtro.entidade {
        qb.push(" AND entidade = ").push_bind(entidade);
    }
    if let Some(id) = filtro.entidade_id {
        qb.push(" AND entidade_id = ").push_bind(id);
    }
    if let Some(uid) = filtro.usuario_id {
        qb.push(" AND usuario_id = ").push_bind(uid);
    }
}

// ---------------------------------------------------------------------------
// Registrador — escrita da trilha. Falha → tracing::error (§4.18: auditoria
// não deve derrubar a operação principal, mas nunca é silenciosa).
// ---------------------------------------------------------------------------

pub struct RegistradorAuditoriaPg {
    pool: PgPool,
}

impl RegistradorAuditoriaPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RegistradorAuditoria for RegistradorAuditoriaPg {
    async fn registrar(&self, evento: EventoAuditoria) {
        let r = sqlx::query(
            "INSERT INTO logs_auditoria (usuario_id, entidade, entidade_id, acao, \
             dados_antes, dados_depois, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(evento.usuario_id.map(|u| u.valor()))
        .bind(&evento.entidade)
        .bind(evento.entidade_id)
        .bind(evento.acao.as_str())
        .bind(&evento.dados_antes)
        .bind(&evento.dados_depois)
        .bind(&evento.ip)
        .execute(&self.pool)
        .await;
        match r {
            Ok(_) => invalidar_listas(),
            Err(e) => tracing::error!(
                entidade = %evento.entidade,
                entidade_id = evento.entidade_id,
                acao = %evento.acao,
                erro = %e,
                "falha ao gravar trilha de auditoria"
            ),
        }
    }
}
