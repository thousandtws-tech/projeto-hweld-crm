//! `caixas` + `caixa_movimentacoes` — Fluxo E.
//! Uma sessão aberta por vez (partial unique index); fechamento confere
//! saldo calculado (fold sobre lançamentos) × informado (§4.17).

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_application::ports::financeiro::{MovimentarCaixaCmd, RepositorioCaixas};
use hweld_application::{ErroApp, Resultado};
use hweld_domain::financeiro::caixa::{Caixa, CaixaMovimentacao};
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool};

use super::db::erro_db;

const CTX: &str = "caixas";
const CX_COLS: &str = "id, aberto_por, aberto_em, valor_abertura, fechado_por, fechado_em, \
    valor_fechamento_calculado, valor_fechamento_informado, diferenca, status";
const MOV_COLS: &str = "id, caixa_id, tipo, valor, forma_pagamento_id, pagamento_id, \
    usuario_id, descricao, created_at";

#[derive(FromRow)]
struct CaixaRow {
    id: i64,
    aberto_por: i64,
    aberto_em: DateTime<Utc>,
    valor_abertura: Decimal,
    fechado_por: Option<i64>,
    fechado_em: Option<DateTime<Utc>>,
    valor_fechamento_calculado: Option<Decimal>,
    valor_fechamento_informado: Option<Decimal>,
    diferenca: Option<Decimal>,
    status: String,
}

impl TryFrom<CaixaRow> for Caixa {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: CaixaRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            aberto_por: Id::novo(r.aberto_por),
            aberto_em: r.aberto_em,
            valor_abertura: Dinheiro::novo(r.valor_abertura),
            fechado_por: r.fechado_por.map(Id::novo),
            fechado_em: r.fechado_em,
            valor_fechamento_calculado: r.valor_fechamento_calculado.map(Dinheiro::novo),
            valor_fechamento_informado: r.valor_fechamento_informado.map(Dinheiro::novo),
            diferenca: r.diferenca.map(Dinheiro::novo),
            status: r.status.parse()?,
        })
    }
}

fn map_caixa(r: CaixaRow) -> Resultado<Caixa> {
    Caixa::try_from(r).map_err(ErroApp::Dominio)
}

#[derive(FromRow)]
struct MovRow {
    id: i64,
    caixa_id: i64,
    tipo: String,
    valor: Decimal,
    forma_pagamento_id: Option<i64>,
    pagamento_id: Option<i64>,
    usuario_id: Option<i64>,
    descricao: Option<String>,
    created_at: DateTime<Utc>,
}

impl TryFrom<MovRow> for CaixaMovimentacao {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: MovRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            caixa_id: Id::novo(r.caixa_id),
            tipo: r.tipo.parse()?,
            valor: Dinheiro::novo(r.valor),
            forma_pagamento_id: r.forma_pagamento_id.map(Id::novo),
            pagamento_id: r.pagamento_id.map(Id::novo),
            usuario_id: r.usuario_id.map(Id::novo),
            descricao: r.descricao,
            created_at: r.created_at,
        })
    }
}

fn map_mov(r: MovRow) -> Resultado<CaixaMovimentacao> {
    CaixaMovimentacao::try_from(r).map_err(ErroApp::Dominio)
}

pub struct RepositorioCaixasPg {
    pool: PgPool,
}

impl RepositorioCaixasPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioCaixas for RepositorioCaixasPg {
    async fn buscar_por_id(&self, id: Id<Caixa>) -> Resultado<Option<Caixa>> {
        let row =
            sqlx::query_as::<_, CaixaRow>(&format!("SELECT {CX_COLS} FROM caixas WHERE id = $1"))
                .bind(id.valor())
                .fetch_optional(&self.pool)
                .await
                .map_err(erro_db(CTX))?;
        row.map(map_caixa).transpose()
    }

    async fn buscar_aberto(&self) -> Resultado<Option<Caixa>> {
        let row = sqlx::query_as::<_, CaixaRow>(&format!(
            "SELECT {CX_COLS} FROM caixas WHERE status = 'aberto' ORDER BY id DESC LIMIT 1"
        ))
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        row.map(map_caixa).transpose()
    }

    async fn listar(&self, paginacao: Paginacao) -> Resultado<Pagina<Caixa>> {
        let (total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM caixas")
            .fetch_one(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        let rows = sqlx::query_as::<_, CaixaRow>(&format!(
            "SELECT {CX_COLS} FROM caixas ORDER BY id DESC LIMIT $1 OFFSET $2"
        ))
        .bind(paginacao.limite())
        .bind(paginacao.offset())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        let itens = rows
            .into_iter()
            .map(map_caixa)
            .collect::<Resultado<Vec<_>>>()?;
        Ok(Pagina::nova(itens, total, paginacao))
    }

    async fn movimentacoes(&self, caixa_id: Id<Caixa>) -> Resultado<Vec<CaixaMovimentacao>> {
        let rows = sqlx::query_as::<_, MovRow>(&format!(
            "SELECT {MOV_COLS} FROM caixa_movimentacoes WHERE caixa_id = $1 ORDER BY id"
        ))
        .bind(caixa_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        rows.into_iter().map(map_mov).collect()
    }

    /// Abertura — o índice parcial UNIQUE(status='aberto') garante uma
    /// única sessão: segunda abertura simultânea vira 409.
    async fn abrir(
        &self,
        aberto_por: Id<hweld_domain::acesso::usuario::Usuario>,
        valor_abertura: Dinheiro,
    ) -> Resultado<Caixa> {
        let row = sqlx::query_as::<_, CaixaRow>(&format!(
            "INSERT INTO caixas (aberto_por, valor_abertura) VALUES ($1,$2) RETURNING {CX_COLS}"
        ))
        .bind(aberto_por.valor())
        .bind(valor_abertura.valor())
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        map_caixa(row)
    }

    /// Lançamento imutável — valida caixa aberto com lock e insere na mesma tx.
    async fn movimentar(&self, cmd: MovimentarCaixaCmd) -> Resultado<CaixaMovimentacao> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;

        let status: Option<String> =
            sqlx::query_scalar("SELECT status FROM caixas WHERE id = $1 FOR UPDATE")
                .bind(cmd.caixa_id.valor())
                .fetch_optional(&mut *tx)
                .await
                .map_err(erro_db(CTX))?;
        match status.as_deref() {
            Some("aberto") => {}
            Some(_) => {
                return Err(ErroApp::conflito(
                    "caixa fechado — lançamento exige caixa aberto",
                ))
            }
            None => return Err(ErroApp::nao_encontrado("caixa", cmd.caixa_id.valor())),
        }

        let row = sqlx::query_as::<_, MovRow>(&format!(
            "INSERT INTO caixa_movimentacoes (caixa_id, tipo, valor, forma_pagamento_id, \
             pagamento_id, usuario_id, descricao) \
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING {MOV_COLS}"
        ))
        .bind(cmd.caixa_id.valor())
        .bind(cmd.tipo.as_str())
        .bind(cmd.valor.valor())
        .bind(cmd.forma_id.map(|f| f.valor()))
        .bind(cmd.pagamento_id.map(|p| p.valor()))
        .bind(cmd.usuario_id.map(|u| u.valor()))
        .bind(cmd.descricao)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let mov = map_mov(row)?;
        tx.commit().await.map_err(erro_db(CTX))?;
        Ok(mov)
    }

    /// Fechamento atômico: soma os lançamentos, confere com o informado
    /// e grava a diferença (quebra de caixa) — tudo numa tx com lock.
    async fn fechar(
        &self,
        id: Id<Caixa>,
        fechado_por: Id<hweld_domain::acesso::usuario::Usuario>,
        valor_informado: Dinheiro,
    ) -> Resultado<Caixa> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;

        let row = sqlx::query_as::<_, CaixaRow>(&format!(
            "SELECT {CX_COLS} FROM caixas WHERE id = $1 FOR UPDATE"
        ))
        .bind(id.valor())
        .fetch_optional(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let caixa = row
            .map(map_caixa)
            .transpose()?
            .ok_or_else(|| ErroApp::nao_encontrado("caixa", id.valor()))?;
        if !caixa.esta_aberto() {
            return Err(ErroApp::conflito("caixa já está fechado"));
        }

        // Saldo calculado = abertura + Σ entradas − Σ saídas (fold no SQL).
        let (saldo,): (Decimal,) = sqlx::query_as(
            "SELECT $2 + COALESCE(SUM(CASE WHEN tipo IN ('suprimento','venda','recebimento') \
             THEN valor ELSE -valor END), 0) \
             FROM caixa_movimentacoes WHERE caixa_id = $1",
        )
        .bind(id.valor())
        .bind(caixa.valor_abertura.valor())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let calculado = Dinheiro::novo(saldo);

        let row = sqlx::query_as::<_, CaixaRow>(&format!(
            "UPDATE caixas SET status='fechado', fechado_por=$2, fechado_em=now(), \
             valor_fechamento_calculado=$3, valor_fechamento_informado=$4, diferenca=$5 \
             WHERE id=$1 RETURNING {CX_COLS}"
        ))
        .bind(id.valor())
        .bind(fechado_por.valor())
        .bind(calculado.valor())
        .bind(valor_informado.valor())
        .bind((valor_informado - calculado).valor())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let fechado = map_caixa(row)?;
        tx.commit().await.map_err(erro_db(CTX))?;
        Ok(fechado)
    }
}
