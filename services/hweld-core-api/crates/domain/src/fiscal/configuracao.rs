//! Configuração fiscal da integração SEFAZ — credenciais, certificado
//! digital A1 e parâmetros de transmissão. Entidade mascarada: segredos
//! (`csc_token`, senha do certificado) existem no agregado para o gateway,
//! mas nunca são serializados na API.

use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;

use crate::enum_str;
use crate::shared::erro::ErroDominio;

enum_str! {
    /// Ambiente-alvo das transmissões fiscais.
    pub enum AmbienteSefaz {
        Homologacao = "homologacao",
        Producao = "producao",
    }
}

enum_str! {
    /// Prontidão da integração com a SEFAZ.
    pub enum StatusIntegracaoFiscal {
        /// Falta credencial (certificado, CSC, série ou regime).
        PendenteCredenciais = "pendente_credenciais",
        /// Credenciais completas em ambiente de homologação.
        HomologacaoPronta = "homologacao_pronta",
        /// Credenciais completas apontando para produção.
        ProducaoPronta = "producao_pronta",
    }
}

/// Visão mascarada da configuração — segura para serializar na API.
/// O binário do certificado vive apenas no repositório.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ConfiguracaoFiscal {
    pub ambiente: AmbienteSefaz,
    pub serie_nf: Option<String>,
    /// 1 = Simples Nacional, 2 = Simples excesso sublimite, 3 = Normal.
    pub regime_tributario: Option<String>,
    pub csc_id: Option<String>,
    #[serde(skip_serializing)]
    #[schema(ignore)]
    pub csc_token: Option<String>,
    #[serde(skip_serializing)]
    #[schema(ignore)]
    pub certificado_senha: Option<String>,
    pub certificado_configurado: bool,
    pub certificado_nome: Option<String>,
    pub certificado_validade: Option<NaiveDate>,
    /// Fingerprint SHA-256 do .pfx — trilha de auditoria sem expor bytes.
    pub certificado_sha256: Option<String>,
    pub updated_at: DateTime<Utc>,
}

impl ConfiguracaoFiscal {
    /// Checklist do que ainda falta para a transmissão fiscal real operar.
    pub fn pendencias(&self, hoje: NaiveDate) -> Vec<&'static str> {
        let mut faltando = Vec::with_capacity(5);
        if !self.certificado_configurado {
            faltando.push("certificado_a1");
        } else if self.certificado_validade.is_some_and(|v| v < hoje) {
            faltando.push("certificado_expirado");
        }
        if self.csc_id.is_none() || self.csc_token.is_none() {
            faltando.push("csc");
        }
        if self.serie_nf.is_none() {
            faltando.push("serie_nf");
        }
        if self.regime_tributario.is_none() {
            faltando.push("regime_tributario");
        }
        faltando
    }

    /// Estado de prontidão derivado das credenciais + ambiente escolhido.
    pub fn status_integracao(&self, hoje: NaiveDate) -> StatusIntegracaoFiscal {
        if !self.pendencias(hoje).is_empty() {
            StatusIntegracaoFiscal::PendenteCredenciais
        } else if self.ambiente == AmbienteSefaz::Producao {
            StatusIntegracaoFiscal::ProducaoPronta
        } else {
            StatusIntegracaoFiscal::HomologacaoPronta
        }
    }

    /// `true` quando a configuração está completa para o ambiente atual —
    /// pré-condição para plugar o transmissor SEFAZ real no lugar do stub.
    pub fn pronta_para_transmissao(&self, hoje: NaiveDate) -> bool {
        self.pendencias(hoje).is_empty()
    }
}

/// Campos editáveis da configuração — segredos usam semântica
/// "ausente = mantém o atual" para não exigir reenvio a cada edição.
#[derive(Debug, Clone, Default)]
pub struct ConfigFiscalInput {
    pub ambiente: Option<AmbienteSefaz>,
    pub serie_nf: Option<String>,
    pub regime_tributario: Option<String>,
    pub csc_id: Option<String>,
    /// `Some(v)` define/limpa o token; `None` mantém o valor gravado.
    pub csc_token: Option<String>,
}

impl ConfigFiscalInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let limpo = |v: Option<String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let mut input = self;

        input.serie_nf = limpo(input.serie_nf);
        if let Some(s) = &input.serie_nf {
            if s.len() > 3 || !s.chars().all(|c| c.is_ascii_digit()) {
                return Err(ErroDominio::valor_invalido(
                    "serie_nf",
                    "série deve ser numérica de 1 a 3 dígitos",
                ));
            }
        }

        input.regime_tributario = limpo(input.regime_tributario);
        if let Some(r) = &input.regime_tributario {
            if !matches!(r.as_str(), "1" | "2" | "3") {
                return Err(ErroDominio::valor_invalido(
                    "regime_tributario",
                    "use 1 (Simples), 2 (Simples excesso) ou 3 (Normal)",
                ));
            }
        }

        input.csc_id = limpo(input.csc_id);
        if let Some(id) = &input.csc_id {
            if id.len() > 20 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
                return Err(ErroDominio::valor_invalido(
                    "csc_id",
                    "identificador CSC inválido",
                ));
            }
        }

        if let Some(t) = &input.csc_token {
            let t = t.trim();
            if t.len() > 120 {
                return Err(ErroDominio::valor_invalido(
                    "csc_token",
                    "token CSC muito longo",
                ));
            }
            input.csc_token = if t.is_empty() {
                Some(String::new()) // "" explícito = limpar o token gravado
            } else {
                Some(t.to_string())
            };
        }

        Ok(input)
    }
}
