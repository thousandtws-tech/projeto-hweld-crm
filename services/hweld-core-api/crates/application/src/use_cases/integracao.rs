//! Integração service-to-service — eventos financeiros/fiscais emitidos pelo
//! `hweld-operations-api` (Java) via `POST /api/v1/internal/eventos-financeiros`.
//!
//! Contrato (docs/business-operations-architecture.md):
//! - envelope { eventId, eventType, eventVersion, aggregateId, correlationId,
//!   occurredAt, payload } — entrega at-least-once pela outbox do Java;
//! - deduplicação por `event_id` único antes de qualquer efeito colateral;
//! - o pedido é a fonte da verdade aqui — `PaymentConfirmed` confirma o
//!   pedido (aguardando_pagamento → confirmado, com reserva de estoque via
//!   `ServicoPedidos::transicionar`); baixa de parcelas e caixa continuam
//!   sendo decisão do financeiro (não automatizamos sem forma de pagamento
//!   nem caixa aberto garantido);
//! - conflitos de estado não retornam erro — o evento é marcado `ignorado`
//!   para não prender a outbox do emissor em retry infinito (poison message).

use std::sync::Arc;

use hweld_domain::crm::empresa::Empresa;
use hweld_domain::fiscal::nota_fiscal::{NotaFiscal, StatusNotaFiscal};
use hweld_domain::shared::id::Id;
use hweld_domain::vendas::pedido::{Pedido, StatusPedido};
use serde::Deserialize;
use uuid::Uuid;

use crate::erro::{ErroApp, Resultado};
use crate::ports::externos::AutorizacaoFiscal;
use crate::ports::fiscal::{FiltroNotasFiscais, RepositorioNotasFiscais};
use crate::ports::integracao::RepositorioEventosIntegracao;
use crate::ports::notificacoes::{CaixaDeEntrada, NovaNotificacao};
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::vendas::RepositorioPedidos;
use crate::use_cases::pedidos::ServicoPedidos;

/// Envelope padrão compartilhado com o emissor (Java).
#[derive(Debug, Deserialize)]
pub struct EventoFinanceiro {
    #[serde(rename = "eventId")]
    pub event_id: Uuid,
    #[serde(rename = "eventType")]
    pub event_type: String,
    #[serde(rename = "aggregateId", default)]
    pub aggregate_id: String,
    #[serde(rename = "correlationId", default)]
    pub correlation_id: Option<String>,
    #[serde(default)]
    pub payload: serde_json::Value,
}

/// Resultado do processamento — o endpoint devolve isso ao emissor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResultadoEvento {
    Processado,
    /// Já recebido antes — deduplicação por `event_id`.
    Duplicado,
    /// Estado atual não permite efeito (ex.: pedido já confirmado/cancelado)
    /// ou tipo desconhecido — ack explícito, sem retry.
    Ignorado(&'static str),
}

impl ResultadoEvento {
    pub fn rotulo(&self) -> &'static str {
        match self {
            Self::Processado => "processado",
            Self::Duplicado => "duplicado",
            Self::Ignorado(_) => "ignorado",
        }
    }
}

pub struct ServicoIntegracao {
    eventos: Arc<dyn RepositorioEventosIntegracao>,
    pedidos: Arc<ServicoPedidos>,
    pedidos_repo: Arc<dyn RepositorioPedidos>,
    notas: Arc<dyn RepositorioNotasFiscais>,
    notificacoes: Arc<dyn CaixaDeEntrada>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoIntegracao {
    pub fn novo(
        eventos: Arc<dyn RepositorioEventosIntegracao>,
        pedidos: Arc<ServicoPedidos>,
        pedidos_repo: Arc<dyn RepositorioPedidos>,
        notas: Arc<dyn RepositorioNotasFiscais>,
        notificacoes: Arc<dyn CaixaDeEntrada>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            eventos,
            pedidos,
            pedidos_repo,
            notas,
            notificacoes,
            realtime,
        }
    }

    /// Processa um evento financeiro já autenticado. Idempotente por
    /// `event_id` — a inserção única é a barreira de deduplicação.
    pub async fn processar(&self, evento: EventoFinanceiro) -> Resultado<ResultadoEvento> {
        let novo = self
            .eventos
            .registrar_se_novo(
                evento.event_id,
                &evento.event_type,
                &evento.aggregate_id,
                "processando",
            )
            .await?;
        if !novo {
            return Ok(ResultadoEvento::Duplicado);
        }

        let resultado = self.aplicar(&evento).await;
        // Mesmo em erro de processamento o registro permanece — a falha vira
        // investigação operacional, não retry cego da outbox.
        let rotulo = match &resultado {
            Ok(r) => r.rotulo(),
            Err(_) => "erro",
        };
        let _ = self.eventos.marcar_resultado(evento.event_id, rotulo).await;
        resultado
    }

    async fn aplicar(&self, evento: &EventoFinanceiro) -> Resultado<ResultadoEvento> {
        match evento.event_type.as_str() {
            "PaymentConfirmed" => self.pagamento_confirmado(evento).await,
            "PaymentFailed" => {
                self.notificar_empresa(evento, "pagamento.falhou", "Pagamento não autorizado")
                    .await;
                Ok(ResultadoEvento::Processado)
            }
            "PaymentCancelled" | "PaymentExpired" | "RefundCompleted" => {
                // Não cancela o pedido sozinho — devolução/cancelamento são
                // decisões do financeiro; o staff é avisado no sino.
                self.notificar_staff(evento).await;
                Ok(ResultadoEvento::Processado)
            }
            "InvoiceAuthorized" => {
                let r = self.nota_autorizada(evento).await?;
                self.notificar_staff(evento).await;
                Ok(r)
            }
            "InvoiceRejected" => {
                let r = self.nota_rejeitada(evento).await?;
                self.notificar_staff(evento).await;
                Ok(r)
            }
            "FiscalDocumentCancelled" => {
                let r = self.nota_cancelada(evento).await?;
                self.notificar_staff(evento).await;
                Ok(r)
            }
            _ => Ok(ResultadoEvento::Ignorado("tipo desconhecido")),
        }
    }

    /// Pedido pago no PSP → confirma o pedido (reserva estoque, notifica).
    /// Pedido que não está mais `aguardando_pagamento` vira ack `ignorado` —
    /// o evento já foi materializado antes ou o pedido mudou de rumo.
    async fn pagamento_confirmado(&self, evento: &EventoFinanceiro) -> Resultado<ResultadoEvento> {
        let pedido_id = evento
            .payload
            .get("pedidoId")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| {
                ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                    "PaymentConfirmed sem pedidoId",
                ))
            })?;
        let pedido_id: Id<Pedido> = Id::novo(pedido_id);

        let pedido = self
            .pedidos_repo
            .buscar_por_id(pedido_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("pedido", pedido_id.valor()))?;

        if pedido.status != StatusPedido::AguardandoPagamento {
            return Ok(ResultadoEvento::Ignorado(
                "pedido fora de aguardando_pagamento",
            ));
        }
        // `transicionar` já cuida de reserva de estoque, auditoria, realtime
        // e inbox do contato — ator None (ação do sistema, não de usuário).
        self.pedidos
            .transicionar(pedido_id, StatusPedido::Confirmado, None)
            .await?;
        Ok(ResultadoEvento::Processado)
    }

    /// Localiza a NF de negócio alvo do evento: `notaFiscalId` no payload
    /// quando presente; senão a NF mais recente do pedido (a que o
    /// operations-api acabou de emitir). Evento sem NF aplicável vira
    /// `ignorado` — a outbox não prende em retry uma ação sem objeto.
    async fn nota_do_evento(&self, evento: &EventoFinanceiro) -> Resultado<Option<NotaFiscal>> {
        if let Some(id) = evento.payload.get("notaFiscalId").and_then(|v| v.as_i64()) {
            let nota = self.notas.buscar_por_id(Id::novo(id)).await?;
            if nota.is_none() {
                return Ok(None);
            }
            return Ok(nota);
        }
        let pedido_id = match evento.payload.get("pedidoId").and_then(|v| v.as_i64()) {
            Some(id) => Id::<Pedido>::novo(id),
            None => return Ok(None),
        };
        let pagina = self
            .notas
            .listar(
                hweld_domain::shared::paginacao::Paginacao {
                    pagina: 1,
                    por_pagina: 1,
                },
                FiltroNotasFiscais {
                    pedido_id: Some(pedido_id),
                    ..Default::default()
                },
            )
            .await?;
        Ok(pagina.itens.into_iter().next())
    }

    /// `InvoiceAuthorized` — provedor autorizou: registra chave/protocolo na
    /// NF rascunho. Reenvio com a NF já autorizada é ack `ignorado`.
    async fn nota_autorizada(&self, evento: &EventoFinanceiro) -> Resultado<ResultadoEvento> {
        let Some(nota) = self.nota_do_evento(evento).await? else {
            return Ok(ResultadoEvento::Ignorado(
                "nenhuma nota fiscal para o evento",
            ));
        };
        if nota.status == StatusNotaFiscal::Autorizada {
            return Ok(ResultadoEvento::Ignorado("nota já autorizada"));
        }
        if nota.status != StatusNotaFiscal::Rascunho {
            return Ok(ResultadoEvento::Ignorado("nota fora de rascunho"));
        }
        let p = &evento.payload;
        let autorizacao = AutorizacaoFiscal {
            chave_acesso: p
                .get("accessKey")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            protocolo: p
                .get("protocol")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            xml_path: p.get("xmlUrl").and_then(|v| v.as_str()).map(String::from),
            pdf_path: p.get("pdfUrl").and_then(|v| v.as_str()).map(String::from),
        };
        let depois = self
            .notas
            .registrar_autorizacao(nota.id, &autorizacao)
            .await?;
        self.realtime.publicar(EventoRealtime::novo(
            "fiscal.nota_autorizada",
            Audiencia::Empresa(depois.empresa_id.valor()),
            serde_json::json!({ "id": depois.id.valor(), "numero": depois.numero }),
        ));
        Ok(ResultadoEvento::Processado)
    }

    /// `InvoiceRejected` — provedor/SEFAZ rejeitou: NF rascunho → rejeitada.
    /// O motivo fica no documento do operations-api (fonte) e na notificação.
    async fn nota_rejeitada(&self, evento: &EventoFinanceiro) -> Resultado<ResultadoEvento> {
        let Some(nota) = self.nota_do_evento(evento).await? else {
            return Ok(ResultadoEvento::Ignorado(
                "nenhuma nota fiscal para o evento",
            ));
        };
        if nota.status == StatusNotaFiscal::Rejeitada {
            return Ok(ResultadoEvento::Ignorado("nota já rejeitada"));
        }
        if nota.status != StatusNotaFiscal::Rascunho {
            return Ok(ResultadoEvento::Ignorado("nota fora de rascunho"));
        }
        let depois = self
            .notas
            .registrar_status(nota.id, StatusNotaFiscal::Rejeitada)
            .await?;
        self.realtime.publicar(EventoRealtime::novo(
            "fiscal.nota_rejeitada",
            Audiencia::Empresa(depois.empresa_id.valor()),
            serde_json::json!({ "id": depois.id.valor(), "numero": depois.numero }),
        ));
        Ok(ResultadoEvento::Processado)
    }

    /// `FiscalDocumentCancelled` — cancelamento confirmado no provedor:
    /// NF autorizada → cancelada, com o motivo persistido.
    async fn nota_cancelada(&self, evento: &EventoFinanceiro) -> Resultado<ResultadoEvento> {
        let Some(nota) = self.nota_do_evento(evento).await? else {
            return Ok(ResultadoEvento::Ignorado(
                "nenhuma nota fiscal para o evento",
            ));
        };
        if nota.status == StatusNotaFiscal::Cancelada {
            return Ok(ResultadoEvento::Ignorado("nota já cancelada"));
        }
        if nota.status != StatusNotaFiscal::Autorizada {
            return Ok(ResultadoEvento::Ignorado(
                "somente nota autorizada pode ser cancelada",
            ));
        }
        let motivo = evento
            .payload
            .get("statusDetail")
            .and_then(|v| v.as_str())
            .filter(|s| s.trim().len() >= 15)
            .unwrap_or("cancelamento registrado pelo provedor fiscal");
        let depois = self.notas.cancelar(nota.id, motivo).await?;
        self.realtime.publicar(EventoRealtime::novo(
            "fiscal.nota_cancelada",
            Audiencia::Empresa(depois.empresa_id.valor()),
            serde_json::json!({ "id": depois.id.valor(), "numero": depois.numero }),
        ));
        Ok(ResultadoEvento::Processado)
    }

    async fn notificar_empresa(&self, evento: &EventoFinanceiro, tipo: &'static str, titulo: &str) {
        if let Some(empresa_id) = evento.payload.get("empresaId").and_then(|v| v.as_i64()) {
            self.notificacoes
                .notificar_empresa(
                    Id::<Empresa>::novo(empresa_id),
                    NovaNotificacao {
                        tipo,
                        titulo: titulo.to_string(),
                        mensagem: format!(
                            "Pedido #{} — {}",
                            pedido_id_str(evento).unwrap_or_default(),
                            titulo
                        ),
                        link: pedido_id_str(evento).map(|id| format!("/conta/pedidos/{id}")),
                    },
                )
                .await;
        }
    }

    async fn notificar_staff(&self, evento: &EventoFinanceiro) {
        self.notificacoes
            .notificar_staff(NovaNotificacao {
                tipo: "integracao.evento",
                titulo: format!("Evento {}", evento.event_type),
                mensagem: format!(
                    "Evento {} recebido do serviço de operações (pedido {:?}).",
                    evento.event_type,
                    pedido_id_str(evento).unwrap_or_default(),
                ),
                link: pedido_id_str(evento).map(|id| format!("/vendas/pedidos/{id}")),
            })
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "integracao.evento_financeiro",
            Audiencia::Staff,
            serde_json::json!({
                "tipo": evento.event_type,
                "aggregate_id": evento.aggregate_id,
                "pedido_id": pedido_id_str(evento),
            }),
        ));
    }
}

fn pedido_id_str(evento: &EventoFinanceiro) -> Option<i64> {
    evento.payload.get("pedidoId").and_then(|v| v.as_i64())
}
