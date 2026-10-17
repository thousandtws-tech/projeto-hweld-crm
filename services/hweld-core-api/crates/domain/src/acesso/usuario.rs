//! `usuarios` — equipe interna (vendedor, admin, estoque, financeiro, técnico).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::enum_str;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

enum_str! {
    /// Perfis de acesso interno — dirigem a autorização por papel (RBAC).
    pub enum Perfil {
        Admin = "admin",
        Vendedor = "vendedor",
        Financeiro = "financeiro",
        Estoque = "estoque",
        Tecnico = "tecnico",
    }
}

impl Perfil {
    /// Pode administrar usuários e configurações sensíveis.
    pub fn eh_admin(self) -> bool {
        matches!(self, Self::Admin)
    }

    /// Papéis com acesso ao módulo financeiro/caixa.
    pub fn acessa_financeiro(self) -> bool {
        matches!(self, Self::Admin | Self::Financeiro)
    }

    /// Papéis que operam vendas/CRM.
    pub fn acessa_vendas(self) -> bool {
        matches!(self, Self::Admin | Self::Vendedor)
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Usuario {
    pub id: Id<Usuario>,
    pub nome: String,
    pub email: String,
    #[serde(skip_serializing)]
    pub senha_hash: String,
    pub perfil: Perfil,
    pub ativo: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Dados de entrada para criar/atualizar usuário (senha já hasheada na borda).
pub struct NovoUsuario {
    pub nome: String,
    pub email: String,
    pub senha_hash: String,
    pub perfil: Perfil,
}

impl NovoUsuario {
    /// Validação aplicativa — acumula todos os erros de campo.
    pub fn validar(self) -> Result<NovoUsuario, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let nome = v.validar("nome", texto::obrigatorio("nome", &self.nome, 120));
        let email = v.validar("email", texto::email("email", &self.email));
        v.regra(
            "senha_hash",
            !self.senha_hash.is_empty(),
            "hash de senha obrigatório",
        );
        v.finish()?;

        Ok(NovoUsuario {
            nome: nome.unwrap(),
            email: email.unwrap(),
            senha_hash: self.senha_hash,
            perfil: self.perfil,
        })
    }
}
