//! `oportunidades` — funil comercial do CRM.

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::acesso::usuario::Usuario;
use crate::enum_str;
use crate::shared::dinheiro::Dinheiro;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

use super::contato::Contato;
use super::empresa::Empresa;

enum_str! {
    /// Canal de origem — rastreabilidade de aquisição.
    pub enum OrigemOportunidade {
        Ecommerce = "ecommerce",
        Indicacao = "indicacao",
        Prospeccao = "prospeccao",
        Site = "site",
        Telefone = "telefone",
        Outro = "outro",
    }
}

enum_str! {
    /// Estágios do funil. `ganha`/`perdida` são terminais.
    pub enum EstagioOportunidade {
        Lead = "lead",
        Qualificacao = "qualificacao",
        Proposta = "proposta",
        Negociacao = "negociacao",
        Ganha = "ganha",
        Perdida = "perdida",
    }
}

impl EstagioOportunidade {
    pub fn eh_terminal(self) -> bool {
        matches!(self, Self::Ganha | Self::Perdida)
    }

    /// Máquina de estados — função total sobre (atual, próximo).
    /// Movimentação livre entre estágios ativos; perdida exige motivo
    /// (validado no agregado); terminais não saem do estado final.
    pub fn pode_transicionar_para(self, proximo: Self) -> bool {
        match self {
            Self::Ganha | Self::Perdida => false,
            _ => proximo != self,
        }
    }

    pub fn transicionar(self, proximo: Self) -> Result<Self, ErroDominio> {
        if self.pode_transicionar_para(proximo) {
            Ok(proximo)
        } else {
            Err(ErroDominio::TransicaoInvalida {
                entidade: "oportunidade",
                de: self.to_string(),
                para: proximo.to_string(),
            })
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Oportunidade {
    pub id: Id<Oportunidade>,
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub responsavel_id: Id<Usuario>,
    pub titulo: String,
    pub descricao: Option<String>,
    pub origem: Option<OrigemOportunidade>,
    pub estagio: EstagioOportunidade,
    pub valor_estimado: Option<Dinheiro>,
    pub data_prevista_fechamento: Option<NaiveDate>,
    pub motivo_perda: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Oportunidade {
    /// Transição de estágio com a regra de motivo de perda — retorna nova
    /// instância (estilo funcional: agregados tratados como valores).
    pub fn mover_para(
        &self,
        proximo: EstagioOportunidade,
        motivo_perda: Option<String>,
    ) -> Result<Self, ErroDominio> {
        let novo_estagio = self.estagio.transicionar(proximo)?;

        if proximo == EstagioOportunidade::Perdida
            && motivo_perda
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .is_empty()
        {
            return Err(ErroDominio::regra(
                "motivo_perda obrigatório ao marcar oportunidade como perdida",
            ));
        }

        Ok(Self {
            estagio: novo_estagio,
            motivo_perda: if proximo == EstagioOportunidade::Perdida {
                motivo_perda.map(|m| m.trim().to_string())
            } else {
                None
            },
            updated_at: Utc::now(),
            ..self.clone()
        })
    }
}

#[derive(Debug, Clone)]
pub struct OportunidadeInput {
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub responsavel_id: Id<Usuario>,
    pub titulo: String,
    pub descricao: Option<String>,
    pub origem: Option<OrigemOportunidade>,
    pub valor_estimado: Option<Decimal>,
    pub data_prevista_fechamento: Option<NaiveDate>,
}

impl OportunidadeInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let titulo = v.validar("titulo", texto::obrigatorio("titulo", &self.titulo, 160));
        v.finish()?;
        Ok(Self {
            titulo: titulo.unwrap(),
            ..self
        })
    }
}
