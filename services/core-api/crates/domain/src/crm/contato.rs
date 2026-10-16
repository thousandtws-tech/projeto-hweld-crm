//! `contatos` — pessoas de contato da empresa + acesso ao portal/e-commerce.

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

use super::empresa::Empresa;

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Contato {
    pub id: Id<Contato>,
    pub empresa_id: Id<Empresa>,
    pub nome: String,
    pub cargo: Option<String>,
    pub email: Option<String>,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
    pub is_principal: bool,
    pub acesso_portal: bool,
    #[serde(skip_serializing)]
    pub senha_hash: Option<String>,
    pub observacoes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Contato {
    /// Pode autenticar no portal B2B: flag + credencial presente + não deletado.
    pub fn pode_logar_portal(&self) -> bool {
        self.acesso_portal && self.senha_hash.is_some() && self.deleted_at.is_none()
    }
}

#[derive(Debug, Clone)]
pub struct ContatoInput {
    pub empresa_id: Id<Empresa>,
    pub nome: String,
    pub cargo: Option<String>,
    pub email: Option<String>,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
    pub is_principal: bool,
    pub acesso_portal: bool,
    pub observacoes: Option<String>,
}

impl ContatoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let nome = v.validar("nome", texto::obrigatorio("nome", &self.nome, 120));
        let email = v.validar_opcional(
            "email",
            self.email.as_deref().map(|s| texto::email("email", s)),
        );
        // Acesso ao portal exige e-mail — é o login do contato.
        v.regra(
            "email",
            !self.acesso_portal || email.is_some(),
            "e-mail obrigatório para acesso ao portal",
        );
        v.finish()?;

        Ok(Self {
            nome: nome.unwrap(),
            email,
            ..self
        })
    }
}
