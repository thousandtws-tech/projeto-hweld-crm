//! `notificacoes` — inbox persistente que alimenta o sino dos dois apps.
//!
//! Fan-out na escrita: cada notificação é uma linha por destinatário, porque
//! `lida_em` é estado individual. O destino nunca é serializado — o cliente só
//! vê as próprias notificações (o handler já escopou pelo token).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::acesso::usuario::Usuario;
use crate::crm::contato::Contato;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

/// Destinatário da notificação — staff (backoffice) ou contato (portal B2B).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DestinoNotificacao {
    Staff(Id<Usuario>),
    Portal(Id<Contato>),
}

impl DestinoNotificacao {
    /// Coluna/scopo usado nas queries — mantém o WHERE consistente.
    pub fn staff_usuario(&self) -> Option<i64> {
        match self {
            Self::Staff(id) => Some(id.valor()),
            Self::Portal(_) => None,
        }
    }

    pub fn portal_contato(&self) -> Option<i64> {
        match self {
            Self::Portal(id) => Some(id.valor()),
            Self::Staff(_) => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Notificacao {
    pub id: Id<Notificacao>,
    /// Nunca serializado — o handler já responde só com as do requisitante.
    #[serde(skip)]
    #[schema(ignore)]
    pub destino: DestinoNotificacao,
    /// `entidade.acao` do evento de origem (ex.: `pedido.criado`).
    pub tipo: String,
    pub titulo: String,
    pub mensagem: String,
    /// Rota do frontend (ex.: `/vendas/pedidos/3`) — nunca URL absoluta.
    pub link: Option<String>,
    pub lida_em: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl Notificacao {
    pub fn lida(&self) -> bool {
        self.lida_em.is_some()
    }
}

#[derive(Debug, Clone)]
pub struct NotificacaoInput {
    pub destino: DestinoNotificacao,
    pub tipo: String,
    pub titulo: String,
    pub mensagem: String,
    pub link: Option<String>,
}

impl NotificacaoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let tipo = v.validar("tipo", texto::obrigatorio("tipo", &self.tipo, 60));
        let titulo = v.validar("titulo", texto::obrigatorio("titulo", &self.titulo, 160));
        let mensagem = v.validar(
            "mensagem",
            texto::obrigatorio("mensagem", &self.mensagem, 400),
        );
        // Link é sempre rota interna — impede open-redirect via URL absoluta.
        v.regra(
            "link",
            self.link
                .as_deref()
                .is_none_or(|l| l.starts_with('/') && l.len() <= 240),
            "link deve ser uma rota interna (ex.: /vendas/pedidos/1)",
        );
        v.finish()?;

        Ok(Self {
            tipo: tipo.unwrap(),
            titulo: titulo.unwrap(),
            mensagem: mensagem.unwrap(),
            ..self
        })
    }
}
