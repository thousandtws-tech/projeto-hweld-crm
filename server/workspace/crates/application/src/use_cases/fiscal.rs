//! Use cases fiscais — emissão de NF a partir do pedido, autorização via
//! gateway fiscal (port) e cancelamento com motivo (§7.3).
//!
//! Cálculo tributário real (regime, UF, CST) é fronteira de extensão (§8) —
//! hoje os itens carregam snapshots do pedido com alíquotas zeradas.

use std::sync::Arc;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::auditoria::log::EventoAuditoria;
use hweld_domain::fiscal::nota_fiscal::{NotaFiscal, NotaFiscalItem, StatusNotaFiscal};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pedido::Pedido;

use crate::erro::{ErroApp, Resultado};
use crate::ports::externos::{GatewayFiscal, RegistradorAuditoria};
use crate::ports::fiscal::{
    FiltroNotasFiscais, NovaNotaFiscal, NovoItemNf, RepositorioNotasFiscais,
};
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::vendas::RepositorioPedidos;

pub struct ServicoNotasFiscais {
    notas: Arc<dyn RepositorioNotasFiscais>,
    pedidos: Arc<dyn RepositorioPedidos>,
    gateway: Arc<dyn GatewayFiscal>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoNotasFiscais {
    pub fn novo(
        notas: Arc<dyn RepositorioNotasFiscais>,
        pedidos: Arc<dyn RepositorioPedidos>,
        gateway: Arc<dyn GatewayFiscal>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            notas,
            pedidos,
            gateway,
            audit,
            realtime,
        }
    }

    pub async fn buscar(&self, id: Id<NotaFiscal>) -> Resultado<(NotaFiscal, Vec<NotaFiscalItem>)> {
        let nf = self
            .notas
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("nota_fiscal", id))?;
        let itens = self.notas.buscar_itens(id).await?;
        Ok((nf, itens))
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroNotasFiscais,
    ) -> Resultado<Pagina<NotaFiscal>> {
        self.notas.listar(paginacao, filtro).await
    }

    /// Emite uma NF `rascunho` para o pedido — itens espelham os snapshots
    /// do pedido; tributos ficam para a integração fiscal real (§8).
    pub async fn emitir(
        &self,
        pedido_id: Id<Pedido>,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<NotaFiscal> {
        let pedido = self
            .pedidos
            .buscar_por_id(pedido_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("pedido", pedido_id))?;
        if pedido.status != hweld_domain::vendas::pedido::StatusPedido::EmSeparacao
            && pedido.status != hweld_domain::vendas::pedido::StatusPedido::Faturado
        {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(format!(
                "NF só pode ser emitida com o pedido em separação ou faturado (atual: {})",
                pedido.status
            ))));
        }
        let itens_pedido = self.pedidos.buscar_itens(pedido_id).await?;

        let nf = self
            .notas
            .criar(NovaNotaFiscal {
                pedido_id,
                empresa_id: pedido.empresa_id,
                tipo: hweld_domain::fiscal::nota_fiscal::TipoNotaFiscal::Saida,
                serie: Some("1".into()),
                natureza_operacao: Some("Venda de mercadoria".into()),
                cfop: Some("5102".into()),
                valor_produtos: pedido.subtotal,
                valor_frete: pedido.frete,
                valor_desconto: pedido.desconto,
                valor_total: pedido.total,
                itens: itens_pedido
                    .iter()
                    .map(|i| NovoItemNf {
                        produto_id: Some(i.produto_id),
                        codigo: Some(i.sku.clone()),
                        descricao: Some(i.descricao.clone()),
                        ncm: None,
                        cfop: Some("5102".into()),
                        unidade: None,
                        quantidade: Some(i.quantidade.valor()),
                        valor_unitario: Some(i.preco_unitario),
                        valor_total: Some(i.total),
                        icms_aliquota: None,
                        icms_valor: None,
                        ipi_aliquota: None,
                        ipi_valor: None,
                        pis_valor: None,
                        cofins_valor: None,
                    })
                    .collect(),
            })
            .await?;

        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                "notas_fiscais",
                nf.id.valor(),
                serde_json::json!({ "numero": nf.numero, "pedido_id": nf.pedido_id }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "fiscal.nota_emitida",
            Audiencia::Empresa(nf.empresa_id.valor()),
            serde_json::json!({ "id": nf.id.valor(), "numero": nf.numero, "pedido_id": nf.pedido_id.valor() }),
        ));
        Ok(nf)
    }

    /// Envia a NF ao gateway fiscal e registra a autorização — ou a
    /// rejeição/denegação retornada.
    pub async fn autorizar(
        &self,
        id: Id<NotaFiscal>,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<NotaFiscal> {
        let (nf, _) = self.buscar(id).await?;
        nf.status.transicionar(StatusNotaFiscal::Autorizada)?;

        let autorizacao = self.gateway.autorizar(&nf).await?;
        let depois = self.notas.registrar_autorizacao(id, &autorizacao).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "notas_fiscais",
                id.valor(),
                serde_json::json!({ "status": nf.status }),
                serde_json::json!({ "status": depois.status, "chave_acesso": depois.chave_acesso }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "fiscal.nota_autorizada",
            Audiencia::Empresa(depois.empresa_id.valor()),
            serde_json::json!({ "id": depois.id.valor(), "numero": depois.numero, "status": depois.status }),
        ));
        Ok(depois)
    }

    /// Cancelamento de NF autorizada — motivo obrigatório (§7.3), evento
    /// fiscal vai ao gateway antes de persistir.
    pub async fn cancelar(
        &self,
        id: Id<NotaFiscal>,
        motivo: &str,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<NotaFiscal> {
        let (nf, _) = self.buscar(id).await?;
        nf.status.transicionar(StatusNotaFiscal::Cancelada)?;
        if motivo.trim().is_empty() {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "motivo_cancelamento obrigatório para cancelar NF",
            )));
        }
        self.gateway.cancelar(&nf, motivo).await?;
        let depois = self.notas.cancelar(id, motivo).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "notas_fiscais",
                id.valor(),
                serde_json::json!({ "status": nf.status }),
                serde_json::json!({ "status": depois.status, "motivo": motivo }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "fiscal.nota_cancelada",
            Audiencia::Empresa(depois.empresa_id.valor()),
            serde_json::json!({ "id": depois.id.valor(), "numero": depois.numero }),
        ));
        Ok(depois)
    }
}
