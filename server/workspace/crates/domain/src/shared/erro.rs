//! Erros de domínio tipados — nunca strings soltas como mecanismo de erro.

use thiserror::Error;

/// Falha de validação de um campo individual.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErroCampo {
    pub campo: &'static str,
    pub mensagem: String,
}

impl ErroCampo {
    pub fn novo(campo: &'static str, mensagem: impl Into<String>) -> Self {
        Self {
            campo,
            mensagem: mensagem.into(),
        }
    }
}

/// Erros que expressam violações de invariantes e regras de negócio.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum ErroDominio {
    #[error("validação falhou")]
    Validacao(Vec<ErroCampo>),

    #[error("valor inválido em '{campo}': {mensagem}")]
    ValorInvalido {
        campo: &'static str,
        mensagem: String,
    },

    #[error("transição de estado inválida: {de} → {para} em {entidade}")]
    TransicaoInvalida {
        entidade: &'static str,
        de: String,
        para: String,
    },

    #[error("estoque insuficiente para o produto {produto_id}: disponível {disponivel}, solicitado {solicitado}")]
    EstoqueInsuficiente {
        produto_id: i64,
        disponivel: String,
        solicitado: String,
    },

    #[error("{0}")]
    RegraNegocio(String),

    #[error("{entidade} não encontrado(a): {id}")]
    NaoEncontrado { entidade: &'static str, id: String },
}

impl ErroDominio {
    pub fn valor_invalido(campo: &'static str, mensagem: impl Into<String>) -> Self {
        Self::ValorInvalido {
            campo,
            mensagem: mensagem.into(),
        }
    }

    pub fn regra(mensagem: impl Into<String>) -> Self {
        Self::RegraNegocio(mensagem.into())
    }

    pub fn nao_encontrado(entidade: &'static str, id: impl std::fmt::Display) -> Self {
        Self::NaoEncontrado {
            entidade,
            id: id.to_string(),
        }
    }
}
