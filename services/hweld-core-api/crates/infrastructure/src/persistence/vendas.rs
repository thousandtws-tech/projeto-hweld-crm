//! `carrinhos`, `pedidos`, `pagamentos`, `formas_pagamento` — repositórios SQLx.
//!
//! Escritas multi-tabela acontecem dentro de transação aqui mesmo — a porta
//! expõe a operação atômica e o adaptador garante o "tudo ou nada" (§7.4).

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use hweld_application::ports::vendas::{
    DonoCarrinho, FiltroPagamentos, FiltroPedidos, NovoPedido, RepositorioCarrinhos,
    RepositorioFormasPagamento, RepositorioPagamentos, RepositorioPedidos,
};
use hweld_application::{ErroApp, Resultado};
use hweld_domain::estoque::movimentacao::MovimentacaoCmd;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::documento::TipoDocumento;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::carrinho::{Carrinho, CarrinhoItem, StatusCarrinho};
use hweld_domain::vendas::pagamento::{FormaPagamento, Pagamento};
use hweld_domain::vendas::pedido::{ItemPedidoNovo, Pedido, PedidoItem, StatusPedido};
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder, Transaction};
use uuid::Uuid;

use super::cache::{chave_lista, invalidar_listas, CacheListas};
use super::db::{erro_db, proximo_numero};

// ---------------------------------------------------------------------------
// Carrinho
// ---------------------------------------------------------------------------

const CTX_CART: &str = "carrinhos";
const CART_COLS: &str =
    "id, uuid, contato_id, empresa_id, session_id, status, created_at, updated_at";
const CART_ITEM_COLS: &str =
    "id, carrinho_id, produto_id, quantidade, preco_unitario, created_at, updated_at";

#[derive(FromRow)]
struct CarrinhoRow {
    id: i64,
    uuid: Uuid,
    contato_id: Option<i64>,
    empresa_id: Option<i64>,
    session_id: Option<String>,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<CarrinhoRow> for Carrinho {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: CarrinhoRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            uuid: r.uuid,
            contato_id: r.contato_id.map(Id::novo),
            empresa_id: r.empresa_id.map(Id::novo),
            session_id: r.session_id,
            status: r.status.parse()?,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_carrinho(r: CarrinhoRow) -> Resultado<Carrinho> {
    Carrinho::try_from(r).map_err(ErroApp::Dominio)
}

#[derive(FromRow)]
struct CarrinhoItemRow {
    id: i64,
    carrinho_id: i64,
    produto_id: i64,
    quantidade: Decimal,
    preco_unitario: Decimal,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<CarrinhoItemRow> for CarrinhoItem {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: CarrinhoItemRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            carrinho_id: Id::novo(r.carrinho_id),
            produto_id: Id::novo(r.produto_id),
            quantidade: hweld_domain::shared::dinheiro::Quantidade::nova(r.quantidade)?,
            preco_unitario: Dinheiro::novo(r.preco_unitario),
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

pub struct RepositorioCarrinhosPg {
    pool: PgPool,
}

impl RepositorioCarrinhosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn buscar_carrinho_where(&self, coluna: &str, valor: i64) -> Resultado<Option<Carrinho>> {
        let sql = format!(
            "SELECT {CART_COLS} FROM carrinhos WHERE {coluna} = $1 AND status = 'aberto' ORDER BY id DESC LIMIT 1"
        );
        let row = sqlx::query_as::<_, CarrinhoRow>(&sql)
            .bind(valor)
            .fetch_optional(&self.pool)
            .await
            .map_err(erro_db(CTX_CART))?;
        row.map(map_carrinho).transpose()
    }
}

#[async_trait]
impl RepositorioCarrinhos for RepositorioCarrinhosPg {
    async fn buscar_por_id(&self, id: Id<Carrinho>) -> Resultado<Option<Carrinho>> {
        let row = sqlx::query_as::<_, CarrinhoRow>(&format!(
            "SELECT {CART_COLS} FROM carrinhos WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_CART))?;
        row.map(map_carrinho).transpose()
    }

    async fn buscar_por_uuid(&self, uuid: Uuid) -> Resultado<Option<Carrinho>> {
        let row = sqlx::query_as::<_, CarrinhoRow>(&format!(
            "SELECT {CART_COLS} FROM carrinhos WHERE uuid = $1"
        ))
        .bind(uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_CART))?;
        row.map(map_carrinho).transpose()
    }

    async fn obter_ou_criar(&self, dono: &DonoCarrinho) -> Resultado<Carrinho> {
        let existente = match dono {
            DonoCarrinho::Contato { contato_id, .. } => {
                self.buscar_carrinho_where("contato_id", contato_id.valor())
                    .await?
            }
            DonoCarrinho::Convidado { session_id } => {
                let row = sqlx::query_as::<_, CarrinhoRow>(&format!(
                    "SELECT {CART_COLS} FROM carrinhos WHERE session_id = $1 AND status = 'aberto' ORDER BY id DESC LIMIT 1"
                ))
                .bind(session_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(erro_db(CTX_CART))?;
                row.map(map_carrinho).transpose()?
            }
        };
        if let Some(c) = existente {
            return Ok(c);
        }

        let (contato_id, empresa_id, session_id) = match dono {
            DonoCarrinho::Contato {
                contato_id,
                empresa_id,
            } => (
                Some(contato_id.valor()),
                empresa_id.map(|e| e.valor()),
                None,
            ),
            DonoCarrinho::Convidado { session_id } => (None, None, Some(session_id.clone())),
        };
        let row = sqlx::query_as::<_, CarrinhoRow>(&format!(
            "INSERT INTO carrinhos (uuid, contato_id, empresa_id, session_id) \
             VALUES ($1, $2, $3, $4) RETURNING {CART_COLS}"
        ))
        .bind(Uuid::new_v4())
        .bind(contato_id)
        .bind(empresa_id)
        .bind(session_id)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_CART))?;
        map_carrinho(row)
    }

    async fn definir_status(&self, id: Id<Carrinho>, status: StatusCarrinho) -> Resultado<()> {
        sqlx::query("UPDATE carrinhos SET status = $2, updated_at = now() WHERE id = $1")
            .bind(id.valor())
            .bind(status.as_str())
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_CART))?;
        Ok(())
    }

    async fn itens(&self, carrinho_id: Id<Carrinho>) -> Resultado<Vec<CarrinhoItem>> {
        let rows = sqlx::query_as::<_, CarrinhoItemRow>(&format!(
            "SELECT {CART_ITEM_COLS} FROM carrinho_itens WHERE carrinho_id = $1 ORDER BY id"
        ))
        .bind(carrinho_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_CART))?;
        rows.into_iter()
            .map(|r| CarrinhoItem::try_from(r).map_err(ErroApp::Dominio))
            .collect()
    }

    /// UPSERT no item: mesmo produto soma quantidade — única linha por produto.
    async fn adicionar_item(
        &self,
        carrinho_id: Id<Carrinho>,
        produto_id: Id<hweld_domain::catalogo::produto::Produto>,
        quantidade: Decimal,
        preco: Dinheiro,
    ) -> Resultado<()> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_CART))?;
        sqlx::query(
            "INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade, preco_unitario) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (carrinho_id, produto_id) DO UPDATE \
             SET quantidade = carrinho_itens.quantidade + EXCLUDED.quantidade, \
                 preco_unitario = EXCLUDED.preco_unitario, updated_at = now()",
        )
        .bind(carrinho_id.valor())
        .bind(produto_id.valor())
        .bind(quantidade)
        .bind(preco.valor())
        .execute(&mut *tx)
        .await
        .map_err(erro_db(CTX_CART))?;
        sqlx::query("UPDATE carrinhos SET updated_at = now() WHERE id = $1")
            .bind(carrinho_id.valor())
            .execute(&mut *tx)
            .await
            .map_err(erro_db(CTX_CART))?;
        tx.commit().await.map_err(erro_db(CTX_CART))
    }

    async fn atualizar_item(
        &self,
        carrinho_id: Id<Carrinho>,
        produto_id: Id<hweld_domain::catalogo::produto::Produto>,
        quantidade: Decimal,
    ) -> Resultado<()> {
        sqlx::query(
            "UPDATE carrinho_itens SET quantidade = $3, updated_at = now() \
             WHERE carrinho_id = $1 AND produto_id = $2",
        )
        .bind(carrinho_id.valor())
        .bind(produto_id.valor())
        .bind(quantidade)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX_CART))?;
        Ok(())
    }

    async fn remover_item(
        &self,
        carrinho_id: Id<Carrinho>,
        produto_id: Id<hweld_domain::catalogo::produto::Produto>,
    ) -> Resultado<()> {
        sqlx::query("DELETE FROM carrinho_itens WHERE carrinho_id = $1 AND produto_id = $2")
            .bind(carrinho_id.valor())
            .bind(produto_id.valor())
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_CART))?;
        Ok(())
    }

    async fn abandonar_inativos(&self, dias: u32) -> Resultado<u64> {
        let r = sqlx::query(
            "UPDATE carrinhos SET status = 'abandonado', updated_at = now() \
             WHERE status = 'aberto' AND updated_at < now() - ($1::int * interval '1 day')",
        )
        .bind(dias as i32)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX_CART))?;
        Ok(r.rows_affected())
    }
}

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

const CTX_PED: &str = "pedidos";
pub(crate) const PED_COLS: &str =
    "id, public_id, numero, empresa_id, contato_id, endereco_faturamento_id, \
    endereco_entrega_id, origem, orcamento_id, carrinho_id, vendedor_id, status, \
    subtotal, desconto, frete, total, condicao_pagamento, observacoes, created_at, updated_at";
const PED_ITEM_COLS: &str =
    "id, pedido_id, produto_id, descricao, sku, quantidade, preco_unitario, desconto, total";

#[derive(FromRow)]
pub(crate) struct PedidoRow {
    pub id: i64,
    pub public_id: uuid::Uuid,
    pub numero: String,
    pub empresa_id: i64,
    pub contato_id: i64,
    pub endereco_faturamento_id: i64,
    pub endereco_entrega_id: i64,
    pub origem: String,
    pub orcamento_id: Option<i64>,
    pub carrinho_id: Option<i64>,
    pub vendedor_id: Option<i64>,
    pub status: String,
    pub subtotal: Decimal,
    pub desconto: Decimal,
    pub frete: Decimal,
    pub total: Decimal,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl TryFrom<PedidoRow> for Pedido {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: PedidoRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            public_id: r.public_id,
            numero: r.numero,
            empresa_id: Id::novo(r.empresa_id),
            contato_id: Id::novo(r.contato_id),
            endereco_faturamento_id: Id::novo(r.endereco_faturamento_id),
            endereco_entrega_id: Id::novo(r.endereco_entrega_id),
            origem: r.origem.parse()?,
            orcamento_id: r.orcamento_id.map(Id::novo),
            carrinho_id: r.carrinho_id.map(Id::novo),
            vendedor_id: r.vendedor_id.map(Id::novo),
            status: r.status.parse()?,
            subtotal: Dinheiro::novo(r.subtotal),
            desconto: Dinheiro::novo(r.desconto),
            frete: Dinheiro::novo(r.frete),
            total: Dinheiro::novo(r.total),
            condicao_pagamento: r.condicao_pagamento,
            observacoes: r.observacoes,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

pub(crate) fn map_pedido(r: PedidoRow) -> Resultado<Pedido> {
    Pedido::try_from(r).map_err(ErroApp::Dominio)
}

#[derive(FromRow)]
struct PedidoItemRow {
    id: i64,
    pedido_id: i64,
    produto_id: i64,
    descricao: String,
    sku: String,
    quantidade: Decimal,
    preco_unitario: Decimal,
    desconto: Decimal,
    total: Decimal,
}

impl TryFrom<PedidoItemRow> for PedidoItem {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: PedidoItemRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            pedido_id: Id::novo(r.pedido_id),
            produto_id: Id::novo(r.produto_id),
            descricao: r.descricao,
            sku: r.sku,
            quantidade: hweld_domain::shared::dinheiro::Quantidade::nova(r.quantidade)?,
            preco_unitario: Dinheiro::novo(r.preco_unitario),
            desconto: Dinheiro::novo(r.desconto),
            total: Dinheiro::novo(r.total),
        })
    }
}

/// Insere pedido + itens dentro de uma transação já aberta — compartilhado
/// entre `criar_de_carrinho`, `criar_manual` e a conversão de orçamento.
pub(crate) async fn inserir_pedido_tx(
    tx: &mut Transaction<'_, Postgres>,
    pedido: &NovoPedido,
) -> Resultado<Pedido> {
    let numero = proximo_numero(tx, TipoDocumento::Pedido).await?;
    let row = sqlx::query_as::<_, PedidoRow>(&format!(
        "INSERT INTO pedidos (numero, empresa_id, contato_id, endereco_faturamento_id, \
         endereco_entrega_id, origem, orcamento_id, carrinho_id, vendedor_id, status, \
         subtotal, desconto, frete, total, condicao_pagamento, observacoes) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'aguardando_pagamento',$10,$11,$12,$13,$14,$15) \
         RETURNING {PED_COLS}"
    ))
    .bind(&numero)
    .bind(pedido.empresa_id.valor())
    .bind(pedido.contato_id.valor())
    .bind(pedido.endereco_faturamento_id.valor())
    .bind(pedido.endereco_entrega_id.valor())
    .bind(pedido.origem.as_str())
    .bind(pedido.orcamento_id.map(|i| i.valor()))
    .bind(pedido.carrinho_id.map(|i| i.valor()))
    .bind(pedido.vendedor_id.map(|i| i.valor()))
    .bind(pedido.subtotal.valor())
    .bind(pedido.desconto.valor())
    .bind(pedido.frete.valor())
    .bind(pedido.total.valor())
    .bind(&pedido.condicao_pagamento)
    .bind(&pedido.observacoes)
    .fetch_one(&mut **tx)
    .await
    .map_err(erro_db(CTX_PED))?;
    let pedido_salvo = map_pedido(row)?;

    for item in &pedido.itens {
        inserir_item_tx(tx, pedido_salvo.id, item).await?;
    }
    Ok(pedido_salvo)
}

async fn inserir_item_tx(
    tx: &mut Transaction<'_, Postgres>,
    pedido_id: Id<Pedido>,
    item: &ItemPedidoNovo,
) -> Resultado<()> {
    sqlx::query(
        "INSERT INTO pedido_itens (pedido_id, produto_id, descricao, sku, quantidade, \
         preco_unitario, desconto, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(pedido_id.valor())
    .bind(item.produto_id.valor())
    .bind(&item.descricao)
    .bind(&item.sku)
    .bind(item.quantidade.valor())
    .bind(item.preco_unitario.valor())
    .bind(item.desconto.valor())
    .bind(item.total().valor())
    .execute(&mut **tx)
    .await
    .map_err(erro_db(CTX_PED))?;
    Ok(())
}

/// Aplica movimentações de estoque dentro da transação corrente — mesmo
/// algoritmo de `RepositorioEstoquePg::movimentar`, reutilizado pelas
/// transições de pedido (reserva na confirmação, baixa no faturamento,
/// liberação no cancelamento — Fluxo D).
/// Retorna os ids das movimentações gravadas, na ordem dos comandos.
pub(crate) async fn movimentar_estoque_tx(
    tx: &mut Transaction<'_, Postgres>,
    comandos: &[MovimentacaoCmd],
) -> Resultado<Vec<i64>> {
    let mut ids = Vec::with_capacity(comandos.len());
    for cmd in comandos {
        cmd.validar().map_err(hweld_application::ErroApp::Dominio)?;

        // Lock pessimista da linha de saldo — serializa movimentações do produto.
        let saldo_row: Option<(Decimal, Decimal)> = sqlx::query_as(
            "SELECT quantidade_disponivel, quantidade_reservada FROM estoque_saldos \
             WHERE produto_id = $1 FOR UPDATE",
        )
        .bind(cmd.produto_id.valor())
        .fetch_optional(&mut **tx)
        .await
        .map_err(erro_db("estoque_movimentacao"))?;

        let saldo = match saldo_row {
            Some((disp, res)) => hweld_domain::estoque::movimentacao::EstoqueSaldo {
                produto_id: cmd.produto_id,
                quantidade_disponivel: disp,
                quantidade_reservada: res,
            },
            None => {
                // Primeira movimentação do produto — cria a linha de saldo.
                sqlx::query(
                    "INSERT INTO estoque_saldos (produto_id, quantidade_disponivel, quantidade_reservada) \
                     VALUES ($1, 0, 0) ON CONFLICT (produto_id) DO NOTHING",
                )
                .bind(cmd.produto_id.valor())
                .execute(&mut **tx)
                .await
                .map_err(erro_db("estoque_movimentacao"))?;
                hweld_domain::estoque::movimentacao::EstoqueSaldo::zero(cmd.produto_id)
            }
        };

        let antes = saldo.quantidade_disponivel;
        let novo = saldo
            .aplicar(cmd.tipo, cmd.quantidade)
            .map_err(hweld_application::ErroApp::Dominio)?;

        sqlx::query(
            "UPDATE estoque_saldos SET quantidade_disponivel = $2, quantidade_reservada = $3 \
             WHERE produto_id = $1",
        )
        .bind(cmd.produto_id.valor())
        .bind(novo.quantidade_disponivel)
        .bind(novo.quantidade_reservada)
        .execute(&mut **tx)
        .await
        .map_err(erro_db("estoque_movimentacao"))?;

        let mov_id: i64 = sqlx::query_scalar(
            "INSERT INTO estoque_movimentacoes (produto_id, tipo, quantidade, saldo_antes, \
             saldo_depois, pedido_id, ordem_servico_id, usuario_id, motivo) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        )
        .bind(cmd.produto_id.valor())
        .bind(cmd.tipo.as_str())
        .bind(cmd.quantidade)
        .bind(antes)
        .bind(novo.quantidade_disponivel)
        .bind(cmd.pedido_id.map(|i| i.valor()))
        .bind(cmd.ordem_servico_id.map(|i| i.valor()))
        .bind(cmd.usuario_id.map(|i| i.valor()))
        .bind(&cmd.motivo)
        .fetch_one(&mut **tx)
        .await
        .map_err(erro_db("estoque_movimentacao"))?;
        ids.push(mov_id);
    }
    Ok(ids)
}

pub struct RepositorioPedidosPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Pedido>>,
}

impl RepositorioPedidosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("pedidos"),
        }
    }
}

#[async_trait]
impl RepositorioPedidos for RepositorioPedidosPg {
    async fn buscar_por_id(&self, id: Id<Pedido>) -> Resultado<Option<Pedido>> {
        let row = sqlx::query_as::<_, PedidoRow>(&format!(
            "SELECT {PED_COLS} FROM pedidos WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_PED))?;
        row.map(map_pedido).transpose()
    }

    async fn buscar_por_public_id(&self, public_id: uuid::Uuid) -> Resultado<Option<Pedido>> {
        let row = sqlx::query_as::<_, PedidoRow>(&format!(
            "SELECT {PED_COLS} FROM pedidos WHERE public_id = $1"
        ))
        .bind(public_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_PED))?;
        row.map(map_pedido).transpose()
    }

    async fn buscar_por_numero(&self, numero: &str) -> Resultado<Option<Pedido>> {
        let row = sqlx::query_as::<_, PedidoRow>(&format!(
            "SELECT {PED_COLS} FROM pedidos WHERE numero = $1"
        ))
        .bind(numero)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_PED))?;
        row.map(map_pedido).transpose()
    }

    async fn buscar_itens(&self, pedido_id: Id<Pedido>) -> Resultado<Vec<PedidoItem>> {
        let rows = sqlx::query_as::<_, PedidoItemRow>(&format!(
            "SELECT {PED_ITEM_COLS} FROM pedido_itens WHERE pedido_id = $1 ORDER BY id"
        ))
        .bind(pedido_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_PED))?;
        rows.into_iter()
            .map(|r| PedidoItem::try_from(r).map_err(ErroApp::Dominio))
            .collect()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroPedidos,
    ) -> Resultado<Pagina<Pedido>> {
        let chave = chave_lista(&paginacao, &filtro);
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb = QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM pedidos WHERE TRUE");
        push_filtro_pedidos(&mut count_qb, &filtro);

        let mut qb =
            QueryBuilder::<Postgres>::new(&format!("SELECT {PED_COLS} FROM pedidos WHERE TRUE"));
        push_filtro_pedidos(&mut qb, &filtro);
        qb.push(" ORDER BY id DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<PedidoRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX_PED))?;
        let rows = rows_res.map_err(erro_db(CTX_PED))?;

        let itens = rows
            .into_iter()
            .map(map_pedido)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    /// Carrinho → pedido na mesma transação: cria o documento e fecha o
    /// carrinho atomicamente — nunca meio caminho (§4.13).
    async fn criar_de_carrinho(
        &self,
        pedido: NovoPedido,
        carrinho_id: Id<Carrinho>,
    ) -> Resultado<Pedido> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_PED))?;

        // Idempotência na origem: re-entrega retorna o pedido já criado.
        let existente = sqlx::query_as::<_, PedidoRow>(&format!(
            "SELECT {PED_COLS} FROM pedidos WHERE carrinho_id = $1"
        ))
        .bind(carrinho_id.valor())
        .fetch_optional(&mut *tx)
        .await
        .map_err(erro_db(CTX_PED))?;
        if let Some(row) = existente {
            tx.commit().await.map_err(erro_db(CTX_PED))?;
            return map_pedido(row);
        }

        let salvo = match inserir_pedido_tx(&mut tx, &pedido).await {
            Ok(p) => p,
            // Race de double-submit: outra transação converteu o mesmo carrinho
            // primeiro e a UK `pedidos_carrinho_uk` disparou. Devolvemos o pedido
            // já criado — retentativa idempotente, nunca pedido duplicado.
            // Só essa constraint — outras violações (FK, numero_uk) propagam.
            Err(ErroApp::Conflito(ref msg)) if msg.contains("pedidos_carrinho_uk") => {
                tx.rollback().await.map_err(erro_db(CTX_PED))?;
                let row = sqlx::query_as::<_, PedidoRow>(&format!(
                    "SELECT {PED_COLS} FROM pedidos WHERE carrinho_id = $1"
                ))
                .bind(carrinho_id.valor())
                .fetch_optional(&self.pool)
                .await
                .map_err(erro_db(CTX_PED))?
                .ok_or_else(|| ErroApp::conflito("carrinho já convertido"))?;
                return map_pedido(row);
            }
            Err(e) => return Err(e),
        };
        sqlx::query("UPDATE carrinhos SET status = 'convertido', updated_at = now() WHERE id = $1")
            .bind(carrinho_id.valor())
            .execute(&mut *tx)
            .await
            .map_err(erro_db(CTX_PED))?;
        tx.commit().await.map_err(erro_db(CTX_PED))?;

        // Automação CRM (pós-commit): pedido originado no e-commerce gera automaticamente oportunidade no funil
        let _ = sqlx::query(
            "INSERT INTO oportunidades \
             (empresa_id, contato_id, responsavel_id, titulo, descricao, origem, estagio, valor_estimado, data_prevista_fechamento) \
             VALUES ( \
               $1, $2, \
               (SELECT id FROM usuarios ORDER BY ativo DESC, id ASC LIMIT 1), \
               'Pedido E-commerce ' || $3, \
               'Oportunidade gerada automaticamente a partir do checkout da loja web (' || $3 || ').', \
               'ecommerce', 'negociacao', $4, CURRENT_DATE \
             )",
        )
        .bind(salvo.empresa_id.valor())
        .bind(salvo.contato_id.valor())
        .bind(&salvo.numero)
        .bind(salvo.total.valor())
        .execute(&self.pool)
        .await;

        invalidar_listas();
        Ok(salvo)
    }

    async fn criar_manual(&self, pedido: NovoPedido) -> Resultado<Pedido> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_PED))?;
        let salvo = inserir_pedido_tx(&mut tx, &pedido).await?;
        tx.commit().await.map_err(erro_db(CTX_PED))?;
        invalidar_listas();
        Ok(salvo)
    }

    /// Transição de status + efeitos de estoque na MESMA transação —
    /// ou acontece tudo, ou nada (Fluxo D / §7.4).
    async fn transicionar(
        &self,
        id: Id<Pedido>,
        novo: StatusPedido,
        movimentos: &[MovimentacaoCmd],
    ) -> Resultado<Pedido> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_PED))?;
        let _ = movimentar_estoque_tx(&mut tx, movimentos).await?;
        let row = sqlx::query_as::<_, PedidoRow>(&format!(
            "UPDATE pedidos SET status = $2, updated_at = now() WHERE id = $1 RETURNING {PED_COLS}"
        ))
        .bind(id.valor())
        .bind(novo.as_str())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_PED))?;
        let pedido = map_pedido(row)?;
        tx.commit().await.map_err(erro_db(CTX_PED))?;

        // Automação CRM (pós-commit): sincroniza oportunidade vinculada ao pedido e-commerce
        match novo.as_str() {
            "confirmado" | "faturado" | "concluido" => {
                let _ = sqlx::query(
                    "UPDATE oportunidades SET estagio = 'ganha', motivo_perda = NULL, updated_at = now() \
                     WHERE empresa_id = $1 AND titulo = ('Pedido E-commerce ' || $2)",
                )
                .bind(pedido.empresa_id.valor())
                .bind(&pedido.numero)
                .execute(&self.pool)
                .await;
            }
            "cancelado" => {
                let _ = sqlx::query(
                    "UPDATE oportunidades SET estagio = 'perdida', motivo_perda = 'Pedido cancelado', updated_at = now() \
                     WHERE empresa_id = $1 AND titulo = ('Pedido E-commerce ' || $2)",
                )
                .bind(pedido.empresa_id.valor())
                .bind(&pedido.numero)
                .execute(&self.pool)
                .await;
            }
            _ => {}
        }

        invalidar_listas();
        Ok(pedido)
    }
}

fn push_filtro_pedidos<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroPedidos) {
    if !filtro.statuses.is_empty() {
        let statuses: Vec<&str> = filtro.statuses.iter().map(|s| s.as_str()).collect();
        qb.push(" AND status = ANY(").push_bind(statuses).push(")");
    }
    if let Some(empresa_id) = filtro.empresa_id {
        qb.push(" AND empresa_id = ").push_bind(empresa_id.valor());
    }
    if let Some(contato_id) = filtro.contato_id {
        qb.push(" AND contato_id = ").push_bind(contato_id.valor());
    }
    if let Some(origem) = filtro.origem {
        qb.push(" AND origem = ").push_bind(origem.as_str());
    }
    if let Some(busca) = filtro.busca.as_ref().filter(|b| !b.trim().is_empty()) {
        let padrao = format!("%{}%", busca.trim());
        qb.push(" AND (numero ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR EXISTS (SELECT 1 FROM empresas e WHERE e.id = empresa_id \
                   AND (e.razao_social ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR e.nome_fantasia ILIKE ")
            .push_bind(padrao)
            .push(")))");
    }
}

// ---------------------------------------------------------------------------
// Pagamentos + formas
// ---------------------------------------------------------------------------

const CTX_PAG: &str = "pagamentos";
const PAG_COLS: &str = "id, pedido_id, parcela_num, valor, vencimento, pago_em, status, \
    forma_pagamento_id, caixa_movimentacao_id, observacao, created_at, updated_at";

#[derive(FromRow)]
struct PagamentoRow {
    id: i64,
    pedido_id: i64,
    parcela_num: i32,
    valor: Decimal,
    vencimento: NaiveDate,
    pago_em: Option<DateTime<Utc>>,
    status: String,
    forma_pagamento_id: Option<i64>,
    caixa_movimentacao_id: Option<i64>,
    observacao: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<PagamentoRow> for Pagamento {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: PagamentoRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            pedido_id: Id::novo(r.pedido_id),
            parcela_num: r.parcela_num,
            valor: Dinheiro::novo(r.valor),
            vencimento: r.vencimento,
            pago_em: r.pago_em,
            status: r.status.parse()?,
            forma_pagamento_id: r.forma_pagamento_id.map(Id::novo),
            caixa_movimentacao_id: r.caixa_movimentacao_id.map(Id::novo),
            observacao: r.observacao,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_pagamento(r: PagamentoRow) -> Resultado<Pagamento> {
    Pagamento::try_from(r).map_err(ErroApp::Dominio)
}

#[derive(FromRow)]
struct FormaPagamentoRow {
    id: i64,
    nome: String,
    ativo: bool,
    permite_parcelamento: bool,
    max_parcelas: i32,
}

impl From<FormaPagamentoRow> for FormaPagamento {
    fn from(r: FormaPagamentoRow) -> Self {
        Self {
            id: Id::novo(r.id),
            nome: r.nome,
            ativo: r.ativo,
            permite_parcelamento: r.permite_parcelamento,
            max_parcelas: r.max_parcelas,
        }
    }
}

pub struct RepositorioPagamentosPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Pagamento>>,
}

impl RepositorioPagamentosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("pagamentos"),
        }
    }
}

#[async_trait]
impl RepositorioPagamentos for RepositorioPagamentosPg {
    async fn buscar_por_id(&self, id: Id<Pagamento>) -> Resultado<Option<Pagamento>> {
        let row = sqlx::query_as::<_, PagamentoRow>(&format!(
            "SELECT {PAG_COLS} FROM pagamentos WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_PAG))?;
        row.map(map_pagamento).transpose()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroPagamentos,
    ) -> Resultado<Pagina<Pagamento>> {
        let chave = chave_lista(&paginacao, &filtro);
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM pagamentos WHERE TRUE");
        push_filtro_pagamentos(&mut count_qb, &filtro);

        let mut qb =
            QueryBuilder::<Postgres>::new(&format!("SELECT {PAG_COLS} FROM pagamentos WHERE TRUE"));
        push_filtro_pagamentos(&mut qb, &filtro);
        qb.push(" ORDER BY vencimento, parcela_num LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<PagamentoRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX_PAG))?;
        let rows = rows_res.map_err(erro_db(CTX_PAG))?;

        let itens = rows
            .into_iter()
            .map(map_pagamento)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    async fn listar_por_pedido(&self, pedido_id: Id<Pedido>) -> Resultado<Vec<Pagamento>> {
        let rows = sqlx::query_as::<_, PagamentoRow>(&format!(
            "SELECT {PAG_COLS} FROM pagamentos WHERE pedido_id = $1 ORDER BY parcela_num"
        ))
        .bind(pedido_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_PAG))?;
        rows.into_iter().map(map_pagamento).collect()
    }

    /// Plano de parcelas criado de uma vez — UNIQUE(pedido_id, parcela_num)
    /// torna a re-execução segura (conflito → 409, nunca duplicata).
    async fn criar_parcelas(
        &self,
        pedido_id: Id<Pedido>,
        parcelas: Vec<(i32, Dinheiro, NaiveDate)>,
        forma_id: Option<Id<FormaPagamento>>,
    ) -> Resultado<Vec<Pagamento>> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_PAG))?;
        let mut criados = Vec::with_capacity(parcelas.len());
        for (num, valor, vencimento) in parcelas {
            let row = sqlx::query_as::<_, PagamentoRow>(&format!(
                "INSERT INTO pagamentos (pedido_id, parcela_num, valor, vencimento, forma_pagamento_id) \
                 VALUES ($1,$2,$3,$4,$5) RETURNING {PAG_COLS}"
            ))
            .bind(pedido_id.valor())
            .bind(num)
            .bind(valor.valor())
            .bind(vencimento)
            .bind(forma_id.map(|f| f.valor()))
            .fetch_one(&mut *tx)
            .await
            .map_err(erro_db(CTX_PAG))?;
            criados.push(map_pagamento(row)?);
        }
        tx.commit().await.map_err(erro_db(CTX_PAG))?;
        invalidar_listas();
        Ok(criados)
    }

    /// Baixa atômica (Fluxo E): pagamento vira `pago` e o lançamento
    /// `recebimento` cai no caixa aberto — tudo na mesma transação.
    /// Exige caixa aberto: lançamento de caixa não existe sem sessão (§5).
    async fn baixar(
        &self,
        id: Id<Pagamento>,
        forma_id: Id<FormaPagamento>,
        usuario_id: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
        observacao: Option<&str>,
    ) -> Resultado<Pagamento> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_PAG))?;

        let caixa_id: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM caixas WHERE status = 'aberto' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(erro_db(CTX_PAG))?;
        let caixa_id = caixa_id.ok_or_else(|| {
            ErroApp::conflito("nenhum caixa aberto — abra um caixa antes de baixar parcelas")
        })?;

        let mov_id: i64 = sqlx::query_scalar(
            "INSERT INTO caixa_movimentacoes (caixa_id, tipo, valor, forma_pagamento_id, pagamento_id, usuario_id, descricao) \
             SELECT $1, 'recebimento', p.valor, $2, p.id, $3, $4 FROM pagamentos p WHERE p.id = $5 \
             RETURNING id",
        )
        .bind(caixa_id)
        .bind(forma_id.valor())
        .bind(usuario_id.map(|u| u.valor()))
        .bind(observacao)
        .bind(id.valor())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_PAG))?;

        let row = sqlx::query_as::<_, PagamentoRow>(&format!(
            "UPDATE pagamentos SET status = 'pago', pago_em = now(), forma_pagamento_id = $2, \
             caixa_movimentacao_id = $3, observacao = COALESCE($4, observacao), updated_at = now() \
             WHERE id = $1 RETURNING {PAG_COLS}"
        ))
        .bind(id.valor())
        .bind(forma_id.valor())
        .bind(mov_id)
        .bind(observacao)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_PAG))?;
        let pago = map_pagamento(row)?;
        tx.commit().await.map_err(erro_db(CTX_PAG))?;
        invalidar_listas();
        Ok(pago)
    }

    /// Estorno atômico: parcela `pago` → `estornado` e lançamento `estorno`
    /// no caixa aberto — mesma transação, exige caixa aberto (§5).
    async fn estornar(
        &self,
        id: Id<Pagamento>,
        usuario_id: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
        motivo: &str,
    ) -> Resultado<Pagamento> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_PAG))?;

        let caixa_id: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM caixas WHERE status = 'aberto' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(erro_db(CTX_PAG))?;
        let caixa_id = caixa_id.ok_or_else(|| {
            ErroApp::conflito("nenhum caixa aberto — abra um caixa antes de estornar")
        })?;

        sqlx::query(
            "INSERT INTO caixa_movimentacoes (caixa_id, tipo, valor, forma_pagamento_id, pagamento_id, usuario_id, descricao) \
             SELECT $1, 'estorno', p.valor, p.forma_pagamento_id, p.id, $2, $3 FROM pagamentos p WHERE p.id = $4",
        )
        .bind(caixa_id)
        .bind(usuario_id.map(|u| u.valor()))
        .bind(motivo)
        .bind(id.valor())
        .execute(&mut *tx)
        .await
        .map_err(erro_db(CTX_PAG))?;

        let row = sqlx::query_as::<_, PagamentoRow>(&format!(
            "UPDATE pagamentos SET status = 'estornado', observacao = $2, updated_at = now() \
             WHERE id = $1 RETURNING {PAG_COLS}"
        ))
        .bind(id.valor())
        .bind(motivo)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_PAG))?;
        let estornado = map_pagamento(row)?;
        tx.commit().await.map_err(erro_db(CTX_PAG))?;
        invalidar_listas();
        Ok(estornado)
    }

    /// Job diário: marca `vencido` tudo que passou do prazo em aberto.
    async fn marcar_vencidos(&self, hoje: NaiveDate) -> Resultado<u64> {
        let r = sqlx::query(
            "UPDATE pagamentos SET status = 'vencido', updated_at = now() \
             WHERE status = 'pendente' AND vencimento < $1",
        )
        .bind(hoje)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX_PAG))?;
        if r.rows_affected() > 0 {
            invalidar_listas();
        }
        Ok(r.rows_affected())
    }
}

fn push_filtro_pagamentos<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroPagamentos) {
    if let Some(pedido_id) = filtro.pedido_id {
        qb.push(" AND pedido_id = ").push_bind(pedido_id.valor());
    }
    if let Some(status) = filtro.status {
        qb.push(" AND status = ").push_bind(status.as_str());
    }
    if let Some(vencidos_em) = filtro.vencidos_em {
        qb.push(" AND vencimento < ")
            .push_bind(vencidos_em)
            .push(" AND status IN ('pendente','vencido')");
    }
    if let Some(busca) = filtro.busca.as_ref().filter(|b| !b.trim().is_empty()) {
        let padrao = format!("%{}%", busca.trim());
        // Busca textual passa pelo pedido — número e nome da empresa.
        qb.push(" AND EXISTS (SELECT 1 FROM pedidos p \
                 JOIN empresas e ON e.id = p.empresa_id \
                 WHERE p.id = pedido_id AND (p.numero ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR e.razao_social ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR e.nome_fantasia ILIKE ")
            .push_bind(padrao)
            .push("))");
    }
}

pub struct RepositorioFormasPagamentoPg {
    pool: PgPool,
}

impl RepositorioFormasPagamentoPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioFormasPagamento for RepositorioFormasPagamentoPg {
    async fn buscar_por_id(&self, id: Id<FormaPagamento>) -> Resultado<Option<FormaPagamento>> {
        let row = sqlx::query_as::<_, FormaPagamentoRow>(
            "SELECT id, nome, ativo, permite_parcelamento, max_parcelas \
             FROM formas_pagamento WHERE id = $1",
        )
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db("formas_pagamento"))?;
        Ok(row.map(FormaPagamento::from))
    }

    async fn listar(&self, somente_ativas: bool) -> Resultado<Vec<FormaPagamento>> {
        let sql = if somente_ativas {
            "SELECT id, nome, ativo, permite_parcelamento, max_parcelas \
             FROM formas_pagamento WHERE ativo ORDER BY nome"
        } else {
            "SELECT id, nome, ativo, permite_parcelamento, max_parcelas \
             FROM formas_pagamento ORDER BY nome"
        };
        let rows = sqlx::query_as::<_, FormaPagamentoRow>(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(erro_db("formas_pagamento"))?;
        Ok(rows.into_iter().map(FormaPagamento::from).collect())
    }
}
