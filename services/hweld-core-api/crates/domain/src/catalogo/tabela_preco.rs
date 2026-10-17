//! `tabelas_preco` + `tabela_preco_itens` — preços diferenciados B2B.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::shared::dinheiro::Dinheiro;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

use super::produto::Produto;

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct TabelaPreco {
    pub id: Id<TabelaPreco>,
    /// Identificador externo opaco (URLs) — nunca expõe o id sequencial.
    pub public_id: Uuid,
    pub nome: String,
    pub descricao: Option<String>,
    pub ativa: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct TabelaPrecoItem {
    pub id: Id<TabelaPrecoItem>,
    pub tabela_preco_id: Id<TabelaPreco>,
    pub produto_id: Id<Produto>,
    pub preco: Dinheiro,
}

#[derive(Debug, Clone)]
pub struct TabelaPrecoInput {
    pub nome: String,
    pub descricao: Option<String>,
    pub ativa: bool,
}

impl TabelaPrecoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let nome = v.validar("nome", texto::obrigatorio("nome", &self.nome, 120));
        v.finish()?;
        Ok(Self {
            nome: nome.unwrap(),
            ..self
        })
    }
}
