//! Use cases de estoque — movimentação manual (entrada/ajuste) e consultas.
//! Reserva/saída por pedido e baixa por OS passam pelos repositórios desses
//! agregados (transação única); este serviço cobre o lançamento direto.

use std::sync::Arc;

use hweld_domain::auditoria::log::EventoAuditoria;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::estoque::movimentacao::{
    EstoqueMovimentacao, EstoqueSaldo, MovimentacaoCmd, TipoMovimentacao,
};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::RepositorioProdutos;
use crate::ports::estoque::RepositorioEstoque;
use crate::ports::externos::RegistradorAuditoria;
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};

pub struct ServicoEstoque {
    estoque: Arc<dyn RepositorioEstoque>,
    produtos: Arc<dyn RepositorioProdutos>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoEstoque {
    pub fn novo(
        estoque: Arc<dyn RepositorioEstoque>,
        produtos: Arc<dyn RepositorioProdutos>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            estoque,
            produtos,
            audit,
            realtime,
        }
    }

    pub async fn saldo(&self, produto_id: Id<Produto>) -> Resultado<EstoqueSaldo> {
        self.estoque.saldo(produto_id).await
    }

    pub async fn movimentacoes(
        &self,
        paginacao: Paginacao,
        produto_id: Option<Id<Produto>>,
    ) -> Resultado<Pagina<EstoqueMovimentacao>> {
        self.estoque
            .listar_movimentacoes(paginacao, produto_id)
            .await
    }

    pub async fn abaixo_do_minimo(&self, limite: u32) -> Resultado<Vec<(Produto, EstoqueSaldo)>> {
        self.estoque.abaixo_do_minimo(limite).await
    }

    /// Lançamento manual — entrada (reposição) ou ajuste (correção com motivo).
    /// Reserva/liberação/saída vinculadas a pedido/OS passam por aqueles
    /// agregados, não por aqui.
    pub async fn lancar(
        &self,
        produto_id: Id<Produto>,
        tipo: TipoMovimentacao,
        quantidade: Decimal,
        motivo: Option<String>,
        ator: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
    ) -> Resultado<EstoqueMovimentacao> {
        if matches!(
            tipo,
            TipoMovimentacao::Reserva
                | TipoMovimentacao::LiberacaoReserva
                | TipoMovimentacao::Saida
        ) {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "reserva, liberação e saída nascem de pedidos e ordens de serviço",
            )));
        }

        self.produtos
            .buscar_por_id(produto_id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", produto_id))?;

        let cmd = MovimentacaoCmd {
            produto_id,
            tipo,
            quantidade,
            pedido_id: None,
            ordem_servico_id: None,
            usuario_id: ator,
            motivo,
        };
        cmd.validar().map_err(ErroApp::Dominio)?;

        let movimentos = self.estoque.movimentar(&[cmd]).await?;
        let movimento = movimentos.into_iter().next().ok_or_else(|| {
            ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "movimentação não persistida",
            ))
        })?;

        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                "estoque_movimentacoes",
                movimento.id.valor(),
                serde_json::json!({
                    "produto_id": movimento.produto_id,
                    "tipo": movimento.tipo,
                    "quantidade": movimento.quantidade,
                }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "estoque.movimentado",
            Audiencia::Staff,
            serde_json::json!({
                "produto_id": movimento.produto_id.valor(),
                "tipo": movimento.tipo,
                "quantidade": movimento.quantidade,
            }),
        ));
        Ok(movimento)
    }
}
