//! `ordens_servico` + `os_itens` + `os_historicos` — Fluxo C.
//! `os_historicos` é trilha append-only escrita na transação da transição.

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use hweld_application::ports::operacao::{FiltroOrdensServico, RepositorioOrdensServico};
use hweld_application::{ErroApp, Resultado};
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::estoque::movimentacao::{MovimentacaoCmd, TipoMovimentacao};
use hweld_domain::operacao::ordem_servico::{
    OrdemServico, OrdemServicoInput, OsHistorico, OsItem, StatusOs,
};
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::documento::TipoDocumento;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::db::{erro_db, proximo_numero};
use super::vendas::movimentar_estoque_tx;

const CTX: &str = "ordens_servico";
const OS_COLS: &str = "id, numero, pedido_id, empresa_id, contato_id, responsavel_id, \
    descricao, status, prioridade, aberta_em, prevista_em, concluida_em, \
    valor_mao_obra, valor_total, observacoes, created_at, updated_at";
const ITEM_COLS: &str = "id, os_id, produto_id, quantidade, preco_unitario, total";
const HIST_COLS: &str =
    "id, os_id, status_anterior, status_novo, usuario_id, observacao, created_at";

#[derive(FromRow)]
struct OsRow {
    id: i64,
    numero: String,
    pedido_id: Option<i64>,
    empresa_id: i64,
    contato_id: Option<i64>,
    responsavel_id: Option<i64>,
    descricao: Option<String>,
    status: String,
    prioridade: String,
    aberta_em: DateTime<Utc>,
    prevista_em: Option<NaiveDate>,
    concluida_em: Option<DateTime<Utc>>,
    valor_mao_obra: Option<Decimal>,
    valor_total: Option<Decimal>,
    observacoes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<OsRow> for OrdemServico {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: OsRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            numero: r.numero,
            pedido_id: r.pedido_id.map(Id::novo),
            empresa_id: Id::novo(r.empresa_id),
            contato_id: r.contato_id.map(Id::novo),
            responsavel_id: r.responsavel_id.map(Id::novo),
            descricao: r.descricao,
            status: r.status.parse()?,
            prioridade: r.prioridade.parse()?,
            aberta_em: r.aberta_em,
            prevista_em: r.prevista_em,
            concluida_em: r.concluida_em,
            valor_mao_obra: r.valor_mao_obra.map(Dinheiro::novo),
            valor_total: r.valor_total.map(Dinheiro::novo),
            observacoes: r.observacoes,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_os(r: OsRow) -> Resultado<OrdemServico> {
    OrdemServico::try_from(r).map_err(ErroApp::Dominio)
}

#[derive(FromRow)]
struct OsItemRow {
    id: i64,
    os_id: i64,
    produto_id: i64,
    quantidade: Decimal,
    preco_unitario: Decimal,
    total: Decimal,
}

impl TryFrom<OsItemRow> for OsItem {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: OsItemRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            os_id: Id::novo(r.os_id),
            produto_id: Id::novo(r.produto_id),
            quantidade: Quantidade::nova(r.quantidade)?,
            preco_unitario: Dinheiro::novo(r.preco_unitario),
            total: Dinheiro::novo(r.total),
        })
    }
}

#[derive(FromRow)]
struct OsHistoricoRow {
    id: i64,
    os_id: i64,
    status_anterior: Option<String>,
    status_novo: String,
    usuario_id: Option<i64>,
    observacao: Option<String>,
    created_at: DateTime<Utc>,
}

impl From<OsHistoricoRow> for OsHistorico {
    fn from(r: OsHistoricoRow) -> Self {
        Self {
            id: Id::novo(r.id),
            os_id: Id::novo(r.os_id),
            status_anterior: r.status_anterior,
            status_novo: r.status_novo,
            usuario_id: r.usuario_id.map(Id::novo),
            observacao: r.observacao,
            created_at: r.created_at,
        }
    }
}

pub struct RepositorioOrdensServicoPg {
    pool: PgPool,
}

impl RepositorioOrdensServicoPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioOrdensServico for RepositorioOrdensServicoPg {
    async fn buscar_por_id(&self, id: Id<OrdemServico>) -> Resultado<Option<OrdemServico>> {
        let row = sqlx::query_as::<_, OsRow>(&format!(
            "SELECT {OS_COLS} FROM ordens_servico WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        row.map(map_os).transpose()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOrdensServico,
    ) -> Resultado<Pagina<OrdemServico>> {
        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM ordens_servico WHERE TRUE");
        push_filtro_os(&mut count_qb, &filtro);
        let (total,): (i64,) = count_qb
            .build_query_as()
            .fetch_one(&self.pool)
            .await
            .map_err(erro_db(CTX))?;

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {OS_COLS} FROM ordens_servico WHERE TRUE"
        ));
        push_filtro_os(&mut qb, &filtro);
        qb.push(" ORDER BY id DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let rows = qb
            .build_query_as::<OsRow>()
            .fetch_all(&self.pool)
            .await
            .map_err(erro_db(CTX))?;

        let itens = rows
            .into_iter()
            .map(map_os)
            .collect::<Resultado<Vec<_>>>()?;
        Ok(Pagina::nova(itens, total, paginacao))
    }

    async fn listar_itens(&self, os_id: Id<OrdemServico>) -> Resultado<Vec<OsItem>> {
        let rows = sqlx::query_as::<_, OsItemRow>(&format!(
            "SELECT {ITEM_COLS} FROM os_itens WHERE os_id = $1 ORDER BY id"
        ))
        .bind(os_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        rows.into_iter()
            .map(|r| OsItem::try_from(r).map_err(ErroApp::Dominio))
            .collect()
    }

    async fn listar_historico(&self, os_id: Id<OrdemServico>) -> Resultado<Vec<OsHistorico>> {
        let rows = sqlx::query_as::<_, OsHistoricoRow>(&format!(
            "SELECT {HIST_COLS} FROM os_historicos WHERE os_id = $1 ORDER BY id"
        ))
        .bind(os_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(rows.into_iter().map(OsHistorico::from).collect())
    }

    /// OS criada com número sequencial + primeiro registro de histórico
    /// na mesma transação — toda OS nasce já auditada.
    async fn criar(
        &self,
        input: OrdemServicoInput,
        usuario_id: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
    ) -> Resultado<OrdemServico> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;
        let numero = proximo_numero(&mut tx, TipoDocumento::OrdemServico).await?;

        let row = sqlx::query_as::<_, OsRow>(&format!(
            "INSERT INTO ordens_servico (numero, pedido_id, empresa_id, contato_id, \
             responsavel_id, descricao, status, prioridade, prevista_em, valor_mao_obra, \
             observacoes) \
             VALUES ($1,$2,$3,$4,$5,$6,'aberta',$7,$8,$9,$10) RETURNING {OS_COLS}"
        ))
        .bind(&numero)
        .bind(input.pedido_id.map(|i| i.valor()))
        .bind(input.empresa_id.valor())
        .bind(input.contato_id.map(|i| i.valor()))
        .bind(input.responsavel_id.map(|i| i.valor()))
        .bind(&input.descricao)
        .bind(input.prioridade.as_str())
        .bind(input.prevista_em)
        .bind(input.valor_mao_obra.map(|v| v.valor()))
        .bind(&input.observacoes)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let os = map_os(row)?;

        sqlx::query(
            "INSERT INTO os_historicos (os_id, status_anterior, status_novo, usuario_id, observacao) \
             VALUES ($1, NULL, 'aberta', $2, 'ordem de serviço criada')",
        )
        .bind(os.id.valor())
        .bind(usuario_id.map(|u| u.valor()))
        .execute(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;

        tx.commit().await.map_err(erro_db(CTX))?;
        Ok(os)
    }

    /// Material adicionado + baixa de estoque (`saida` com `ordem_servico_id`)
    /// + recálculo de `valor_total` — tudo na mesma transação (Fluxo C/D).
    async fn adicionar_item(
        &self,
        os_id: Id<OrdemServico>,
        produto_id: Id<Produto>,
        quantidade: Quantidade,
        preco: Dinheiro,
        baixar_estoque: bool,
        usuario_id: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
    ) -> Resultado<OsItem> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;

        // Baixa primeiro: estoque insuficiente aborta a transação inteira
        // antes de gravar o item — nunca fica item sem movimentação.
        if baixar_estoque {
            movimentar_estoque_tx(
                &mut tx,
                &[MovimentacaoCmd {
                    produto_id,
                    tipo: TipoMovimentacao::Saida,
                    quantidade: quantidade.valor(),
                    pedido_id: None,
                    ordem_servico_id: Some(os_id),
                    usuario_id,
                    motivo: Some("consumo em ordem de serviço".into()),
                }],
            )
            .await?;
        }

        let total = preco.vezes(quantidade);
        let row = sqlx::query_as::<_, OsItemRow>(&format!(
            "INSERT INTO os_itens (os_id, produto_id, quantidade, preco_unitario, total) \
             VALUES ($1,$2,$3,$4,$5) RETURNING {ITEM_COLS}"
        ))
        .bind(os_id.valor())
        .bind(produto_id.valor())
        .bind(quantidade.valor())
        .bind(preco.valor())
        .bind(total.valor())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let item = OsItem::try_from(row).map_err(ErroApp::Dominio)?;

        // valor_total = mão de obra + Σ materiais — recalculado de uma vez.
        sqlx::query(
            "UPDATE ordens_servico SET \
             valor_total = COALESCE(valor_mao_obra, 0) + \
                 (SELECT COALESCE(SUM(total), 0) FROM os_itens WHERE os_id = $1), \
             updated_at = now() WHERE id = $1",
        )
        .bind(os_id.valor())
        .execute(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;

        tx.commit().await.map_err(erro_db(CTX))?;
        Ok(item)
    }

    /// Transição com registro no histórico — mesma transação, sempre
    /// com `status_anterior`/`status_novo` para a trilha imutável.
    async fn transicionar(
        &self,
        id: Id<OrdemServico>,
        novo: StatusOs,
        usuario_id: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
        observacao: Option<&str>,
    ) -> Resultado<OrdemServico> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;

        let atual: Option<String> =
            sqlx::query_scalar("SELECT status FROM ordens_servico WHERE id = $1 FOR UPDATE")
                .bind(id.valor())
                .fetch_optional(&mut *tx)
                .await
                .map_err(erro_db(CTX))?;
        let anterior = atual.ok_or_else(|| ErroApp::nao_encontrado("ordem_servico", id.valor()))?;

        let concluida_em = if novo == StatusOs::Concluida {
            "now()"
        } else {
            "NULL"
        };
        let row = sqlx::query_as::<_, OsRow>(&format!(
            "UPDATE ordens_servico SET status=$2, concluida_em={concluida_em}, updated_at=now() \
             WHERE id=$1 RETURNING {OS_COLS}"
        ))
        .bind(id.valor())
        .bind(novo.as_str())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let os = map_os(row)?;

        sqlx::query(
            "INSERT INTO os_historicos (os_id, status_anterior, status_novo, usuario_id, observacao) \
             VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(id.valor())
        .bind(&anterior)
        .bind(novo.as_str())
        .bind(usuario_id.map(|u| u.valor()))
        .bind(observacao)
        .execute(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;

        tx.commit().await.map_err(erro_db(CTX))?;
        Ok(os)
    }
}

fn push_filtro_os<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroOrdensServico) {
    if let Some(status) = filtro.status {
        qb.push(" AND status = ").push_bind(status.as_str());
    }
    if let Some(empresa_id) = filtro.empresa_id {
        qb.push(" AND empresa_id = ").push_bind(empresa_id.valor());
    }
    if let Some(pedido_id) = filtro.pedido_id {
        qb.push(" AND pedido_id = ").push_bind(pedido_id.valor());
    }
    if let Some(responsavel_id) = filtro.responsavel_id {
        qb.push(" AND responsavel_id = ")
            .push_bind(responsavel_id.valor());
    }
}
