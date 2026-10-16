//! `interacoes` — timeline única de relacionamento (ligação, e-mail, visita…).
//! Registro imutável: correções são novas interações (modelo §7.2).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::acesso::usuario::Usuario;
use crate::enum_str;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

use super::contato::Contato;
use super::empresa::Empresa;
use super::oportunidade::Oportunidade;

enum_str! {
    pub enum TipoInteracao {
        Ligacao = "ligacao",
        Email = "email",
        Whatsapp = "whatsapp",
        Reuniao = "reuniao",
        Visita = "visita",
        NotaInterna = "nota_interna",
        Outro = "outro",
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Interacao {
    pub id: Id<Interacao>,
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub oportunidade_id: Option<Id<Oportunidade>>,
    pub usuario_id: Option<Id<Usuario>>,
    pub tipo: TipoInteracao,
    pub assunto: Option<String>,
    pub descricao: Option<String>,
    pub ocorrido_em: DateTime<Utc>,
    pub proxima_acao: Option<String>,
    pub proxima_acao_em: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct InteracaoInput {
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub oportunidade_id: Option<Id<Oportunidade>>,
    pub usuario_id: Option<Id<Usuario>>,
    pub tipo: TipoInteracao,
    pub assunto: Option<String>,
    pub descricao: Option<String>,
    pub ocorrido_em: DateTime<Utc>,
    pub proxima_acao: Option<String>,
    pub proxima_acao_em: Option<DateTime<Utc>>,
}

impl InteracaoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let assunto = v.validar_opcional(
            "assunto",
            self.assunto
                .as_deref()
                .map(|s| texto::obrigatorio("assunto", s, 200)),
        );
        let descricao = v.validar_opcional(
            "descricao",
            self.descricao
                .as_deref()
                .map(|s| texto::obrigatorio("descricao", s, 5000)),
        );
        // Follow-up só faz sentido com uma data de execução.
        v.regra(
            "proxima_acao_em",
            self.proxima_acao.is_none() || self.proxima_acao_em.is_some(),
            "próxima ação exige data de execução",
        );
        v.regra(
            "descricao",
            assunto.is_some() || descricao.is_some(),
            "interação precisa de assunto ou descrição",
        );
        v.finish()?;

        Ok(Self {
            assunto,
            descricao,
            ..self
        })
    }
}
