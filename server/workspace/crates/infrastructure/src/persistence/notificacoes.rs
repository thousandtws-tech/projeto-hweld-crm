//! `notificacoes` — repositório SQLx. Toda query carrega o escopo do
//! destinatário (`usuario_id` XOR `contato_id`) — nunca lista/marca de outro.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_application::ports::notificacoes::RepositorioNotificacoes;
use hweld_application::{ErroApp, Resultado};
use hweld_domain::notificacao::{DestinoNotificacao, Notificacao, NotificacaoInput};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use sqlx::{FromRow, PgPool};

use super::db::erro_db;

const CTX: &str = "notificacoes";
const COLS: &str =
    "id, destino_tipo, usuario_id, contato_id, tipo, titulo, mensagem, link, lida_em, created_at";

#[derive(FromRow)]
struct NotificacaoRow {
    id: i64,
    destino_tipo: String,
    usuario_id: Option<i64>,
    contato_id: Option<i64>,
    tipo: String,
    titulo: String,
    mensagem: String,
    link: Option<String>,
    lida_em: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

impl From<NotificacaoRow> for Notificacao {
    fn from(r: NotificacaoRow) -> Self {
        // CHECK na tabela garante exatamente um FK preenchido; o fallback
        // é defensivo (a linha corrompida morre no parse, não no cliente).
        let destino = match (r.destino_tipo.as_str(), r.usuario_id, r.contato_id) {
            ("staff", Some(u), None) => DestinoNotificacao::Staff(Id::novo(u)),
            ("portal", None, Some(c)) => DestinoNotificacao::Portal(Id::novo(c)),
            _ => DestinoNotificacao::Staff(Id::novo(0)),
        };
        Self {
            id: Id::novo(r.id),
            destino,
            tipo: r.tipo,
            titulo: r.titulo,
            mensagem: r.mensagem,
            link: r.link,
            lida_em: r.lida_em,
            created_at: r.created_at,
        }
    }
}

/// WHERE do escopo — a mesma expressão alimenta listar/contar/marcar.
fn escopo(destino: DestinoNotificacao) -> (&'static str, i64) {
    match destino {
        DestinoNotificacao::Staff(u) => ("usuario_id", u.valor()),
        DestinoNotificacao::Portal(c) => ("contato_id", c.valor()),
    }
}

pub struct RepositorioNotificacoesPg {
    pool: PgPool,
}

impl RepositorioNotificacoesPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioNotificacoes for RepositorioNotificacoesPg {
    async fn criar(&self, input: NotificacaoInput) -> Resultado<Notificacao> {
        let (tipo_dest, usuario_id, contato_id) = match input.destino {
            DestinoNotificacao::Staff(u) => ("staff", Some(u.valor()), None),
            DestinoNotificacao::Portal(c) => ("portal", None, Some(c.valor())),
        };
        let row = sqlx::query_as::<_, NotificacaoRow>(&format!(
            "INSERT INTO notificacoes \
             (destino_tipo, usuario_id, contato_id, tipo, titulo, mensagem, link) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING {COLS}"
        ))
        .bind(tipo_dest)
        .bind(usuario_id)
        .bind(contato_id)
        .bind(input.tipo)
        .bind(input.titulo)
        .bind(input.mensagem)
        .bind(input.link)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(row.into())
    }

    async fn listar(
        &self,
        destino: DestinoNotificacao,
        paginacao: Paginacao,
    ) -> Resultado<Pagina<Notificacao>> {
        let (col, id) = escopo(destino);
        let (total,): (i64,) = sqlx::query_as(&format!(
            "SELECT COUNT(*) FROM notificacoes WHERE {col} = $1"
        ))
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;

        let rows = sqlx::query_as::<_, NotificacaoRow>(&format!(
            "SELECT {COLS} FROM notificacoes WHERE {col} = $1 \
             ORDER BY (lida_em IS NULL) DESC, created_at DESC LIMIT $2 OFFSET $3"
        ))
        .bind(id)
        .bind(paginacao.limite())
        .bind(paginacao.offset())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;

        Ok(Pagina::nova(
            rows.into_iter().map(Notificacao::from).collect(),
            total,
            paginacao,
        ))
    }

    async fn nao_lidas(&self, destino: DestinoNotificacao) -> Resultado<i64> {
        let (col, id) = escopo(destino);
        let (n,): (i64,) = sqlx::query_as(&format!(
            "SELECT COUNT(*) FROM notificacoes WHERE {col} = $1 AND lida_em IS NULL"
        ))
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(n)
    }

    async fn marcar_lida(&self, id: Id<Notificacao>, destino: DestinoNotificacao) -> Resultado<()> {
        let (col, dono) = escopo(destino);
        let res = sqlx::query(&format!(
            "UPDATE notificacoes SET lida_em = now() \
             WHERE id = $1 AND {col} = $2 AND lida_em IS NULL"
        ))
        .bind(id.valor())
        .bind(dono)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        if res.rows_affected() == 0 {
            // Não existe OU não pertence ao destinatário OU já estava lida.
            // Verifico pertencimento para distinguir 404 de no-op.
            let (existe,): (bool,) = sqlx::query_as(&format!(
                "SELECT EXISTS(SELECT 1 FROM notificacoes WHERE id = $1 AND {col} = $2)"
            ))
            .bind(id.valor())
            .bind(dono)
            .fetch_one(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
            if !existe {
                return Err(ErroApp::nao_encontrado("notificacao", id));
            }
        }
        Ok(())
    }

    async fn marcar_todas_lidas(&self, destino: DestinoNotificacao) -> Resultado<u64> {
        let (col, dono) = escopo(destino);
        let res = sqlx::query(&format!(
            "UPDATE notificacoes SET lida_em = now() WHERE {col} = $1 AND lida_em IS NULL"
        ))
        .bind(dono)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(res.rows_affected())
    }
}
