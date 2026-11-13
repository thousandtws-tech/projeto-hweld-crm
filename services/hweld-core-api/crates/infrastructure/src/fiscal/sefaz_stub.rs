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

    /// Chave de acesso no layout NF-e real (44 dígitos):
    /// cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1).
    /// Determinística sobre número+id da NF para não colidir entre notas.
    fn chave_fake(nf: &NotaFiscal) -> String {
        let numero: String = nf.numero.chars().filter(|c| c.is_ascii_digit()).collect();
        let n9 = format!("{numero:0>9}");
        let n9 = &n9[n9.len().saturating_sub(9)..]; // nNF = últimos 9 dígitos
        let cnf = format!("{:0>8}", nf.id.valor().rem_euclid(100_000_000));
        let base = format!("3525010000000000000055001{n9}1{cnf}");
        debug_assert_eq!(base.len(), 43);
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
