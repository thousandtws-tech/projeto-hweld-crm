//! Erro da camada de aplicação — fronteira entre domínio e mundo exterior.
//! Preserva a fonte para logs sem vazar detalhes internos ao cliente.

use hweld_domain::shared::erro::ErroDominio;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ErroApp {
    /// Violação de invariante/regra — traduz para 400/409/422 conforme o caso.
    #[error(transparent)]
    Dominio(#[from] ErroDominio),

    /// Credencial ausente/inválida — 401.
    #[error("{0}")]
    NaoAutenticado(String),

    /// Autenticado mas sem permissão — 403.
    #[error("{0}")]
    Proibido(String),

    /// Estado de recurso conflitante (UNIQUE, conversão dupla, caixa aberto) — 409.
    #[error("{0}")]
    Conflito(String),

    /// Dependência externa fora do ar ou não configurada (ex.: motor de
    /// busca desligado) — 503.
    #[error("serviço indisponível: {0}")]
    Indisponivel(&'static str),

    /// Falha de infraestrutura — 500. `fonte` vai para o log, nunca ao cliente.
    #[error("erro interno em {contexto}")]
    Interno {
        contexto: &'static str,
        #[source]
        fonte: Box<dyn std::error::Error + Send + Sync>,
    },
}

impl ErroApp {
    pub fn interno(
        contexto: &'static str,
        fonte: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        Self::Interno {
            contexto,
            fonte: Box::new(fonte),
        }
    }

    /// 404 — ressource introuvable, traduit `ErroDominio::NaoEncontrado`.
    pub fn nao_encontrado(entidade: &'static str, id: impl std::fmt::Display) -> Self {
        Self::Dominio(ErroDominio::nao_encontrado(entidade, id))
    }

    pub fn nao_autenticado(msg: impl Into<String>) -> Self {
        Self::NaoAutenticado(msg.into())
    }

    pub fn proibido(msg: impl Into<String>) -> Self {
        Self::Proibido(msg.into())
    }

    pub fn conflito(msg: impl Into<String>) -> Self {
        Self::Conflito(msg.into())
    }
}

pub type Resultado<T> = Result<T, ErroApp>;
