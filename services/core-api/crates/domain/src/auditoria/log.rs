//! `logs_auditoria` — quem mexeu, em quê, quando, de onde (§4.18).
//! Append-only: registros nunca são editados nem apagados.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;

use crate::acesso::usuario::Usuario;
use crate::enum_str;
use crate::shared::id::Id;

enum_str! {
    pub enum AcaoAuditoria {
        Insert = "insert",
        Update = "update",
        Delete = "delete",
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct LogAuditoria {
    pub id: Id<LogAuditoria>,
    pub usuario_id: Option<Id<Usuario>>,
    pub entidade: String,
    pub entidade_id: i64,
    pub acao: AcaoAuditoria,
    pub dados_antes: Option<Value>,
    pub dados_depois: Option<Value>,
    pub ip: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Evento de auditoria ainda não persistido — construído na borda da aplicação.
#[derive(Debug, Clone)]
pub struct EventoAuditoria {
    pub usuario_id: Option<Id<Usuario>>,
    pub entidade: String,
    pub entidade_id: i64,
    pub acao: AcaoAuditoria,
    pub dados_antes: Option<Value>,
    pub dados_depois: Option<Value>,
    pub ip: Option<String>,
}

impl EventoAuditoria {
    pub fn insert(usuario_id: Option<Id<Usuario>>, entidade: &str, id: i64, depois: Value) -> Self {
        Self {
            usuario_id,
            entidade: entidade.to_string(),
            entidade_id: id,
            acao: AcaoAuditoria::Insert,
            dados_antes: None,
            dados_depois: Some(depois),
            ip: None,
        }
    }

    pub fn update(
        usuario_id: Option<Id<Usuario>>,
        entidade: &str,
        id: i64,
        antes: Value,
        depois: Value,
    ) -> Self {
        Self {
            usuario_id,
            entidade: entidade.to_string(),
            entidade_id: id,
            acao: AcaoAuditoria::Update,
            dados_antes: Some(antes),
            dados_depois: Some(depois),
            ip: None,
        }
    }

    pub fn delete(usuario_id: Option<Id<Usuario>>, entidade: &str, id: i64, antes: Value) -> Self {
        Self {
            usuario_id,
            entidade: entidade.to_string(),
            entidade_id: id,
            acao: AcaoAuditoria::Delete,
            dados_antes: Some(antes),
            dados_depois: None,
            ip: None,
        }
    }

    pub fn com_ip(mut self, ip: Option<String>) -> Self {
        self.ip = ip;
        self
    }
}
