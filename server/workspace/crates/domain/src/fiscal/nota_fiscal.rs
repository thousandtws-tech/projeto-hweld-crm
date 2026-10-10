use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::catalogo::produto::Produto;
use crate::crm::empresa::Empresa;
use crate::enum_str;
use crate::shared::dinheiro::{Dinheiro, Quantidade};
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::vendas::pedido::Pedido;

enum_str! {
    pub enum TipoNotaFiscal {
        Saida = "saida",
        Devolucao = "devolucao",
        Complementar = "complementar",
    }
}

enum_str! {
    pub enum StatusNotaFiscal {
        Rascunho = "rascunho",
        Autorizada = "autorizada",
        Cancelada = "cancelada",
        Rejeitada = "rejeitada",
        Denegada = "denegada",
    }
}

impl StatusNotaFiscal {
    pub fn transicionar(self, proximo: Self) -> Result<Self, ErroDominio> {
        use StatusNotaFiscal::*;
        let ok = matches!(
            (self, proximo),
            (Rascunho, Autorizada | Rejeitada | Denegada)
                | (Autorizada, Cancelada)
                | (Rejeitada, Rascunho)
        );
        if ok {
            Ok(proximo)
        } else {
            Err(ErroDominio::TransicaoInvalida {
                entidade: "nota_fiscal",
                de: self.to_string(),
                para: proximo.to_string(),
            })
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct NotaFiscal {
    pub id: Id<NotaFiscal>,
    pub numero: String,
    pub serie: Option<String>,
    pub chave_acesso: Option<String>,
    pub pedido_id: Id<Pedido>,
    pub empresa_id: Id<Empresa>,
    pub tipo: TipoNotaFiscal,
    pub status: StatusNotaFiscal,
    pub natureza_operacao: Option<String>,
    pub cfop: Option<String>,
    pub emitida_em: Option<DateTime<Utc>>,
    pub valor_produtos: Option<Dinheiro>,
    pub valor_frete: Option<Dinheiro>,
    pub valor_desconto: Option<Dinheiro>,
    pub valor_total: Option<Dinheiro>,
    pub protocolo_autorizacao: Option<String>,
    pub xml_path: Option<String>,
    pub pdf_path: Option<String>,
    pub motivo_cancelamento: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl NotaFiscal {
    /// Chave de acesso válida: 44 dígitos numéricos.
    pub fn validar_chave(chave: &str) -> Result<(), ErroDominio> {
        if chave.len() == 44 && chave.chars().all(|c| c.is_ascii_digit()) {
            Ok(())
        } else {
            Err(ErroDominio::valor_invalido(
                "chave_acesso",
                "deve ter exatamente 44 dígitos",
            ))
        }
    }
}

/// Item da NF — tributos nas colunas; cálculo tributário fica na camada fiscal.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct NotaFiscalItem {
    pub id: Id<NotaFiscalItem>,
    pub nf_id: Id<NotaFiscal>,
    pub produto_id: Option<Id<Produto>>,
    pub codigo: Option<String>,
    pub descricao: Option<String>,
    pub ncm: Option<String>,
    pub cfop: Option<String>,
    pub unidade: Option<String>,
    pub quantidade: Option<Quantidade>,
    pub valor_unitario: Option<Dinheiro>,
    pub valor_total: Option<Dinheiro>,
    pub icms_aliquota: Option<rust_decimal::Decimal>,
    pub icms_valor: Option<Dinheiro>,
    pub ipi_aliquota: Option<rust_decimal::Decimal>,
    pub ipi_valor: Option<Dinheiro>,
    pub pis_valor: Option<Dinheiro>,
    pub cofins_valor: Option<Dinheiro>,
}
