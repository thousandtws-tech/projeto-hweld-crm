//! Números legíveis de documentos (`ORC-000123`, `PV-000123`, `OS-000123`, `NF-000045`).
//! O valor sequencial vem de SEQUENCEs do Postgres; aqui vive apenas a formatação.

/// Tipos de documento com número sequencial legível.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoDocumento {
    Orcamento,
    Pedido,
    OrdemServico,
    NotaFiscal,
}

impl TipoDocumento {
    pub fn prefixo(self) -> &'static str {
        match self {
            Self::Orcamento => "ORC",
            Self::Pedido => "PV",
            Self::OrdemServico => "OS",
            Self::NotaFiscal => "NF",
        }
    }

    /// `TipoDocumento::Pedido.formatar(123)` → `"PV-000123"`.
    pub fn formatar(self, sequencial: i64) -> String {
        format!("{}-{:06}", self.prefixo(), sequencial)
    }
}
