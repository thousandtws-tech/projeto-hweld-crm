//! Stub do gateway fiscal — fronteira reservada para integração SEFAZ real.
//! Gera chave de acesso determinística-formato (44 dígitos) e protocolo fake
//! para desenvolvimento/testes; em produção, substituir por cliente NF-e.

use async_trait::async_trait;
use hweld_application::ports::externos::{AutorizacaoFiscal, GatewayFiscal};
use hweld_application::Resultado;
use hweld_domain::fiscal::nota_fiscal::NotaFiscal;

pub struct GatewayFiscalStub;

impl GatewayFiscalStub {
    pub fn novo() -> Self {
        Self
    }

    /// Chave de acesso no formato NF-e (44 dígitos) — stub determinístico
    /// sobre o número da NF para não colidir entre notas.
    fn chave_fake(nf: &NotaFiscal) -> String {
        let base = format!(
            "3525010000000000000055001{:0>13}1",
            nf.numero
                .chars()
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
        );
        let mut chave: String = base.chars().take(43).collect();
        // DV módulo 11 — mesmo algoritmo da chave real.
        let soma: u32 = chave
            .chars()
            .rev()
            .enumerate()
            .map(|(i, c)| c.to_digit(10).unwrap_or(0) * ((i % 8) as u32 + 2))
            .sum();
        let dv = 11 - (soma % 11);
        chave.push(char::from_digit(if dv >= 10 { 0 } else { dv }, 10).unwrap_or('0'));
        chave
    }
}

#[async_trait]
impl GatewayFiscal for GatewayFiscalStub {
    async fn autorizar(&self, nf: &NotaFiscal) -> Resultado<AutorizacaoFiscal> {
        let chave = Self::chave_fake(nf);
        Ok(AutorizacaoFiscal {
            chave_acesso: chave,
            protocolo: format!("135{:0>12}", nf.id.valor()),
            xml_path: Some(format!("fiscal/{}/{}.xml", nf.id.valor(), nf.numero)),
            pdf_path: Some(format!("fiscal/{}/{}.pdf", nf.id.valor(), nf.numero)),
        })
    }

    async fn cancelar(&self, _nf: &NotaFiscal, _motivo: &str) -> Resultado<()> {
        Ok(())
    }
}
