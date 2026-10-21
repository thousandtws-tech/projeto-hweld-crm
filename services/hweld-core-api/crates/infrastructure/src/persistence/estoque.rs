//! `estoque_saldos` + `estoque_movimentacoes` — projeção materializada
//! atualizada na mesma transação do movimento imutável (§7.4, Fluxo D).

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_application::ports::estoque::RepositorioEstoque;
use hweld_application::{ErroApp, Resultado};
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::estoque::movimentacao::{EstoqueMovimentacao, EstoqueSaldo, MovimentacaoCmd};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::cache::{invalidar_listas, CacheListas};
use super::catalogo::RepositorioProdutosPg;
use super::db::erro_db;
use super::vendas::movimentar_estoque_tx;
use hweld_application::ports::catalogo::RepositorioProdutos;

const CTX: &str = "estoque";
const MOV_COLS: &str = "id, produto_id, tipo, quantidade, saldo_antes, saldo_depois, \
    pedido_id, ordem_servico_id, usuario_id, motivo, created_at";

#[derive(FromRow)]
struct MovimentacaoRow {
    id: i64,
    produto_id: i64,
    tipo: String,
    quantidade: Decimal,
    saldo_antes: Decimal,
    saldo_depois: Decimal,
    pedido_id: Option<i64>,
    ordem_servico_id: Option<i64>,
    usuario_id: Option<i64>,
    motivo: Option<String>,
    created_at: DateTime<Utc>,
}

impl TryFrom<MovimentacaoRow> for EstoqueMovimentacao {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: MovimentacaoRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            produto_id: Id::novo(r.produto_id),
            tipo: r.tipo.parse()?,
            quantidade: r.quantidade,
            saldo_antes: r.saldo_antes,
            saldo_depois: r.saldo_depois,
            pedido_id: r.pedido_id.map(Id::novo),
            ordem_servico_id: r.ordem_servico_id.map(Id::novo),
            usuario_id: r.usuario_id.map(Id::novo),
            motivo: r.motivo,
            created_at: r.created_at,
        })
    }
}

#[derive(FromRow)]
struct SaldoRow {
    produto_id: i64,
    quantidade_disponivel: Decimal,
    quantidade_reservada: Decimal,
}

impl From<SaldoRow> for EstoqueSaldo {
    fn from(r: SaldoRow) -> Self {
        Self {
            produto_id: Id::novo(r.produto_id),
            quantidade_disponivel: r.quantidade_disponivel,
            quantidade_reservada: r.quantidade_reservada,
        }
    }
}

pub struct RepositorioEstoquePg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<EstoqueMovimentacao>>,
}

impl RepositorioEstoquePg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("estoque_movimentacoes"),
        }
    }
}

#[async_trait]
impl RepositorioEstoque for RepositorioEstoquePg {
    /// Saldo zero quando o produto ainda não movimentou — "não encontrado"
    /// não é erro de saldo, é estoque inexistente.
    async fn saldo(&self, produto_id: Id<Produto>) -> Resultado<EstoqueSaldo> {
        let row = sqlx::query_as::<_, SaldoRow>(
            "SELECT produto_id, quantidade_disponivel, quantidade_reservada \
             FROM estoque_saldos WHERE produto_id = $1",
        )
        .bind(produto_id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(row
            .map(EstoqueSaldo::from)
            .unwrap_or_else(|| EstoqueSaldo::zero(produto_id)))
    }

    async fn saldos(&self, produto_ids: &[Id<Produto>]) -> Resultado<Vec<EstoqueSaldo>> {
        let valores: Vec<i64> = produto_ids.iter().map(|i| i.valor()).collect();
        let rows = sqlx::query_as::<_, SaldoRow>(
            "SELECT produto_id, quantidade_disponivel, quantidade_reservada \
             FROM estoque_saldos WHERE produto_id = ANY($1)",
        )
        .bind(&valores)
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(rows.into_iter().map(EstoqueSaldo::from).collect())
    }

    async fn listar_movimentacoes(
        &self,
        paginacao: Paginacao,
        produto_id: Option<Id<Produto>>,
    ) -> Resultado<Pagina<EstoqueMovimentacao>> {
        let chave = format!("{paginacao:?}|{produto_id:?}");
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM estoque_movimentacoes WHERE TRUE");
        if let Some(id) = produto_id {
            count_qb.push(" AND produto_id = ").push_bind(id.valor());
        }

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {MOV_COLS} FROM estoque_movimentacoes WHERE TRUE"
        ));
        if let Some(id) = produto_id {
            qb.push(" AND produto_id = ").push_bind(id.valor());
        }
        qb.push(" ORDER BY id DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<MovimentacaoRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX))?;
        let rows = rows_res.map_err(erro_db(CTX))?;

        let itens = rows
            .into_iter()
            .map(|r| EstoqueMovimentacao::try_from(r).map_err(ErroApp::Dominio))
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    /// Batch atômico: todos os movimentos aplicados com lock por produto —
    /// `EstoqueSaldo::aplicar` valida a invariante antes de persistir.
    async fn movimentar(
        &self,
        comandos: &[MovimentacaoCmd],
    ) -> Resultado<Vec<EstoqueMovimentacao>> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;
        let ids = movimentar_estoque_tx(&mut tx, comandos).await?;

        // Devolve exatamente as linhas gravadas nesta transação.
        let rows = sqlx::query_as::<_, MovimentacaoRow>(&format!(
            "SELECT {MOV_COLS} FROM estoque_movimentacoes WHERE id = ANY($1) ORDER BY id"
        ))
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let itens = rows
            .into_iter()
            .map(|r| EstoqueMovimentacao::try_from(r).map_err(ErroApp::Dominio))
            .collect::<Resultado<Vec<_>>>()?;
        tx.commit().await.map_err(erro_db(CTX))?;
        invalidar_listas();
        Ok(itens)
    }

    /// Produtos com `disponível < estoque_minimo` — relatório de reposição.
    /// Saldo é derivado por join na projeção; produtos via `buscar_por_ids`.
    async fn abaixo_do_minimo(&self, limite: u32) -> Resultado<Vec<(Produto, EstoqueSaldo)>> {
        let saldos = sqlx::query_as::<_, SaldoRow>(
            "SELECT s.produto_id, s.quantidade_disponivel, s.quantidade_reservada \
             FROM estoque_saldos s \
             JOIN produtos p ON p.id = s.produto_id \
             WHERE p.deleted_at IS NULL AND p.controla_estoque \
               AND p.estoque_minimo IS NOT NULL \
               AND s.quantidade_disponivel < p.estoque_minimo \
             ORDER BY s.quantidade_disponivel ASC LIMIT $1",
        )
        .bind(limite as i64)
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;

        let ids: Vec<Id<Produto>> = saldos.iter().map(|s| Id::novo(s.produto_id)).collect();
        let produtos = RepositorioProdutosPg::novo(self.pool.clone())
            .buscar_por_ids(&ids)
            .await?;

        let mapa: std::collections::HashMap<i64, EstoqueSaldo> = saldos
            .into_iter()
            .map(|s| (s.produto_id, EstoqueSaldo::from(s)))
            .collect();
        Ok(produtos
            .into_iter()
            .filter_map(|p| mapa.get(&p.id.valor()).copied().map(|s| (p, s)))
            .collect())
    }
}
