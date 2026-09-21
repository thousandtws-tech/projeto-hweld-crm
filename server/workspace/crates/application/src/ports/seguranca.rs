//! Ports de segurança — hashing de senha e emissão/validação de tokens.
//! Implementações vivem em `hweld-infrastructure` (Argon2id, JWT).

use async_trait::async_trait;
use hweld_domain::acesso::usuario::Perfil;

use crate::erro::Resultado;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoSujeito {
    Staff,
    Portal,
}

impl TipoSujeito {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Staff => "staff",
            Self::Portal => "portal",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct SujeitoToken {
    pub tipo: TipoSujeito,
    pub id: i64,
    pub perfil: Option<Perfil>,
}

#[derive(Debug, Clone)]
pub struct Claims {
    pub sujeito: SujeitoToken,
    pub exp: usize,
}

#[derive(Debug, Clone)]
pub struct ParTokens {
    pub access_token: String,
    pub access_expira_em: i64,
    pub refresh_token: String,
    pub refresh_expira_em: i64,
}

#[async_trait]
pub trait HasherSenha: Send + Sync {
    async fn hash(&self, senha: &str) -> Resultado<String>;
    async fn verificar(&self, senha: &str, hash: &str) -> Resultado<bool>;
}

#[async_trait]
pub trait EmissorTokens: Send + Sync {
    async fn emitir_par(&self, sujeito: SujeitoToken) -> Resultado<ParTokens>;

    fn validar_access(&self, token: &str) -> Resultado<Claims>;

    async fn rotacionar(&self, refresh_token: &str) -> Resultado<ParTokens>;

    async fn revogar(&self, refresh_token: &str) -> Resultado<()>;
}
