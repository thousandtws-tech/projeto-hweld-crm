//! `enderecos` — endereços da empresa (fiscal, entrega, correspondência).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::enum_str;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

use super::empresa::Empresa;

enum_str! {
    pub enum TipoEndereco {
        Fiscal = "fiscal",
        Entrega = "entrega",
        Correspondencia = "correspondencia",
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Endereco {
    pub id: Id<Endereco>,
    pub empresa_id: Id<Empresa>,
    pub tipo: TipoEndereco,
    pub logradouro: Option<String>,
    pub numero: Option<String>,
    pub complemento: Option<String>,
    pub bairro: Option<String>,
    pub cidade: String,
    pub uf: String,
    pub cep: String,
    pub pais: String,
    pub principal: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct EnderecoInput {
    pub empresa_id: Id<Empresa>,
    pub tipo: TipoEndereco,
    pub logradouro: Option<String>,
    pub numero: Option<String>,
    pub complemento: Option<String>,
    pub bairro: Option<String>,
    pub cidade: String,
    pub uf: String,
    pub cep: String,
    pub pais: Option<String>,
    pub principal: bool,
}

impl EnderecoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let cidade = v.validar("cidade", texto::obrigatorio("cidade", &self.cidade, 100));

        let uf = self.uf.trim().to_uppercase();
        v.regra(
            "uf",
            uf.len() == 2 && uf.chars().all(|c| c.is_ascii_uppercase()),
            "UF deve ter 2 letras",
        );

        let cep_digits: String = self.cep.chars().filter(char::is_ascii_digit).collect();
        v.regra("cep", cep_digits.len() == 8, "CEP deve ter 8 dígitos");

        v.finish()?;

        Ok(Self {
            cidade: cidade.unwrap(),
            uf,
            cep: cep_digits,
            pais: self.pais.or_else(|| Some("Brasil".into())),
            ..self
        })
    }
}
