//! Use cases financeiros — parcelas (contas a receber) e sessões de caixa.
//! Fluxo E do modelo: pedido → N pagamentos → baixa lança no caixa aberto →
//! fechamento confere calculado × informado.

use std::sync::Arc;

use chrono::NaiveDate;
use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::auditoria::log::EventoAuditoria;
use hweld_domain::financeiro::caixa::{Caixa, CaixaMovimentacao, TipoCaixaMovimentacao};
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pagamento::{plano_parcelas, FormaPagamento, Pagamento, StatusPagamento};
use hweld_domain::vendas::pedido::Pedido;

use crate::erro::{ErroApp, Resultado};
use crate::ports::externos::RegistradorAuditoria;
use crate::ports::financeiro::RepositorioCaixas;
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::vendas::{
    FiltroPagamentos, RepositorioFormasPagamento, RepositorioPagamentos, RepositorioPedidos,
};

// ── Pagamentos ──────────────────────────────────────────────────────────────

pub struct ServicoPagamentos {
    pagamentos: Arc<dyn RepositorioPagamentos>,
    pedidos: Arc<dyn RepositorioPedidos>,
    formas: Arc<dyn RepositorioFormasPagamento>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoPagamentos {
    pub fn novo(
        pagamentos: Arc<dyn RepositorioPagamentos>,
        pedidos: Arc<dyn RepositorioPedidos>,
        formas: Arc<dyn RepositorioFormasPagamento>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            pagamentos,
            pedidos,
            formas,
            audit,
            realtime,
        }
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroPagamentos,
    ) -> Resultado<Pagina<Pagamento>> {
        self.pagamentos.listar(paginacao, filtro).await
    }

    pub async fn por_pedido(&self, pedido_id: Id<Pedido>) -> Resultado<Vec<Pagamento>> {
        self.pagamentos.listar_por_pedido(pedido_id).await
    }

    /// Gera o plano de parcelas do pedido (função pura `plano_parcelas`)
    /// e persiste numa transação. Recusa se o pedido já tem parcelas.
    pub async fn gerar_parcelas(
        &self,
        pedido_id: Id<Pedido>,
        quantidade: u32,
        primeiro_vencimento: NaiveDate,
        intervalo_dias: i64,
        forma_id: Option<Id<FormaPagamento>>,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Vec<Pagamento>> {
        let pedido = self
            .pedidos
            .buscar_por_id(pedido_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("pedido", pedido_id))?;

        if let Some(forma_id) = forma_id {
            let forma = self
                .formas
                .buscar_por_id(forma_id)
                .await?
                .ok_or_else(|| ErroApp::nao_encontrado("forma_pagamento", forma_id))?;
            if !forma.aceita_parcelas(quantidade) {
                return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(format!(
                    "{} não aceita {} parcela(s)",
                    forma.nome, quantidade
                ))));
            }
        }

        if !self
            .pagamentos
            .listar_por_pedido(pedido_id)
            .await?
            .is_empty()
        {
            return Err(ErroApp::conflito("pedido já possui parcelas geradas"));
        }

        let plano = plano_parcelas(
            pedido.total,
            quantidade,
            primeiro_vencimento,
            intervalo_dias,
        )
        .map_err(ErroApp::Dominio)?;
        let parcelas = plano
            .iter()
            .map(|p| (p.parcela_num, p.valor, p.vencimento))
            .collect();
        let criadas = self
            .pagamentos
            .criar_parcelas(pedido_id, parcelas, forma_id)
            .await?;

        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                "pagamentos",
                pedido_id.valor(),
                serde_json::json!({ "parcelas": quantidade, "total": pedido.total }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "pagamento.parcelas",
            Audiencia::Staff,
            serde_json::json!({
                "pedido_id": pedido_id.valor(),
                "parcelas": quantidade,
                "total": pedido.total,
            }),
        ));
        Ok(criadas)
    }

    /// Baixa da parcela — lança no caixa aberto na mesma transação (§5).
    pub async fn baixar(
        &self,
        id: Id<Pagamento>,
        forma_id: Id<FormaPagamento>,
        ator: Option<Id<Usuario>>,
        observacao: Option<String>,
    ) -> Resultado<Pagamento> {
        let pagamento = self
            .pagamentos
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("pagamento", id))?;
        pagamento.status.transicionar(StatusPagamento::Pago)?;

        // Forma de pagamento deve existir — 404 semântico, antes do FK do banco.
        self.formas
            .buscar_por_id(forma_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("forma_pagamento", forma_id))?;

        let depois = self
            .pagamentos
            .baixar(id, forma_id, ator, observacao.as_deref())
            .await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "pagamentos",
                id.valor(),
                serde_json::json!({ "status": pagamento.status }),
                serde_json::json!({ "status": depois.status }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "pagamento.baixado",
            Audiencia::Staff,
            serde_json::json!({
                "id": depois.id.valor(),
                "pedido_id": depois.pedido_id.valor(),
                "valor": depois.valor,
            }),
        ));
        Ok(depois)
    }

    /// Estorno de parcela paga — lançamento `estorno` no caixa aberto.
    pub async fn estornar(
        &self,
        id: Id<Pagamento>,
        motivo: &str,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Pagamento> {
        let pagamento = self
            .pagamentos
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("pagamento", id))?;
        pagamento.status.transicionar(StatusPagamento::Estornado)?;
        if motivo.trim().is_empty() {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "motivo obrigatório para estornar parcela",
            )));
        }
        let depois = self.pagamentos.estornar(id, ator, motivo).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "pagamentos",
                id.valor(),
                serde_json::json!({ "status": pagamento.status }),
                serde_json::json!({ "status": depois.status, "motivo": motivo }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "pagamento.estornado",
            Audiencia::Staff,
            serde_json::json!({ "id": depois.id.valor(), "pedido_id": depois.pedido_id.valor() }),
        ));
        Ok(depois)
    }
}

// ── Caixas ──────────────────────────────────────────────────────────────────

pub struct ServicoCaixas {
    caixas: Arc<dyn RepositorioCaixas>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoCaixas {
    pub fn novo(
        caixas: Arc<dyn RepositorioCaixas>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            caixas,
            audit,
            realtime,
        }
    }

    pub async fn aberto(&self) -> Resultado<Option<Caixa>> {
        self.caixas.buscar_aberto().await
    }

    pub async fn listar(&self, paginacao: Paginacao) -> Resultado<Pagina<Caixa>> {
        self.caixas.listar(paginacao).await
    }

    pub async fn movimentacoes(&self, caixa_id: Id<Caixa>) -> Resultado<Vec<CaixaMovimentacao>> {
        self.caixas.movimentacoes(caixa_id).await
    }

    pub async fn abrir(&self, valor_abertura: Dinheiro, ator: Id<Usuario>) -> Resultado<Caixa> {
        let caixa = self.caixas.abrir(ator, valor_abertura).await?;
        self.audit
            .registrar(EventoAuditoria::insert(
                Some(ator),
                "caixas",
                caixa.id.valor(),
                serde_json::json!({ "valor_abertura": valor_abertura }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "caixa.aberto",
            Audiencia::Staff,
            serde_json::json!({ "id": caixa.id.valor() }),
        ));
        Ok(caixa)
    }

    /// Lançamento manual — suprimento, sangria ou despesa.
    /// `venda`/`recebimento`/`estorno` nascem de vendas e baixas de parcela.
    pub async fn lancar(
        &self,
        tipo: TipoCaixaMovimentacao,
        valor: Dinheiro,
        forma_id: Option<Id<FormaPagamento>>,
        descricao: Option<String>,
        ator: Id<Usuario>,
    ) -> Resultado<CaixaMovimentacao> {
        if matches!(
            tipo,
            TipoCaixaMovimentacao::Venda
                | TipoCaixaMovimentacao::Recebimento
                | TipoCaixaMovimentacao::Estorno
        ) {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "venda, recebimento e estorno nascem de pedidos e parcelas",
            )));
        }
        let caixa = self.caixas.buscar_aberto().await?.ok_or_else(|| {
            ErroApp::conflito("nenhum caixa aberto — abra um caixa antes de lançar")
        })?;

        let mov = self
            .caixas
            .movimentar(crate::ports::financeiro::MovimentarCaixaCmd {
                caixa_id: caixa.id,
                tipo,
                valor,
                forma_id,
                pagamento_id: None,
                usuario_id: Some(ator),
                descricao,
            })
            .await?;
        self.audit
            .registrar(EventoAuditoria::insert(
                Some(ator),
                "caixa_movimentacoes",
                mov.id.valor(),
                serde_json::json!({ "caixa_id": mov.caixa_id, "tipo": mov.tipo, "valor": mov.valor }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "caixa.movimento",
            Audiencia::Staff,
            serde_json::json!({ "caixa_id": mov.caixa_id.valor(), "tipo": mov.tipo, "valor": mov.valor }),
        ));
        Ok(mov)
    }

    /// Fecha o caixa — confere calculado × informado (quebra de caixa).
    pub async fn fechar(&self, valor_informado: Dinheiro, ator: Id<Usuario>) -> Resultado<Caixa> {
        let caixa = self
            .caixas
            .buscar_aberto()
            .await?
            .ok_or_else(|| ErroApp::conflito("nenhum caixa aberto"))?;
        let depois = self.caixas.fechar(caixa.id, ator, valor_informado).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                Some(ator),
                "caixas",
                caixa.id.valor(),
                serde_json::json!({ "status": caixa.status }),
                serde_json::json!({ "status": depois.status, "diferenca": depois.diferenca }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "caixa.fechado",
            Audiencia::Staff,
            serde_json::json!({ "id": depois.id.valor(), "diferenca": depois.diferenca }),
        ));
        Ok(depois)
    }
}
