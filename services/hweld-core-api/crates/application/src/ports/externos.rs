//! Ports para serviços externos — adaptadores substituíveis na infraestrutura.

use async_trait::async_trait;
use hweld_domain::auditoria::log::EventoAuditoria;
use hweld_domain::fiscal::nota_fiscal::NotaFiscal;

use crate::erro::Resultado;

/// Resultado da autorização fiscal junto à SEFAZ (ou stub).
#[derive(Debug, Clone)]
pub struct AutorizacaoFiscal {
    pub chave_acesso: String,
    pub protocolo: String,
    pub xml_path: Option<String>,
    pub pdf_path: Option<String>,
}

/// Gateway fiscal — em produção, integração SEFAZ real (NF-e).
/// O modelo (§8) reserva esta fronteira: implementação stub em dev.
#[async_trait]
pub trait GatewayFiscal: Send + Sync {
    async fn autorizar(&self, nf: &NotaFiscal) -> Resultado<AutorizacaoFiscal>;
    async fn cancelar(&self, nf: &NotaFiscal, motivo: &str) -> Resultado<()>;
}

/// Trilha de auditoria — escrita append-only em `logs_auditoria` (§4.18).
/// Falhas de auditoria não devem derrubar a operação principal: o
/// implementador decide entre log estruturado de fallback ou erro.
#[async_trait]
pub trait RegistradorAuditoria: Send + Sync {
    async fn registrar(&self, evento: EventoAuditoria);
}
