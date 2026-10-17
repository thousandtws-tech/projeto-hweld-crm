//! `carrinhos` + `carrinho_itens` — e-commerce. UUID público para não expor
//! ids sequenciais; convidados usam `session_id`.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::catalogo::produto::Produto;
use crate::crm::contato::Contato;
use crate::crm::empresa::Empresa;
use crate::enum_str;
use crate::shared::dinheiro::{Dinheiro, Quantidade};
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;

enum_str! {
    pub enum StatusCarrinho {
        Aberto = "aberto",
        Convertido = "convertido",
        Abandonado = "abandonado",
    }
}

impl StatusCarrinho {
    /// `aberto` é o único estado que evolui (conversão ou abandono por job).
    pub fn transicionar(self, proximo: Self) -> Result<Self, ErroDominio> {
        match (self, proximo) {
            (Self::Aberto, Self::Convertido | Self::Abandonado) => Ok(proximo),
            _ => Err(ErroDominio::TransicaoInvalida {
                entidade: "carrinho",
                de: self.to_string(),
                para: proximo.to_string(),
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Carrinho {
    pub id: Id<Carrinho>,
    pub uuid: Uuid,
    pub contato_id: Option<Id<Contato>>,
    pub empresa_id: Option<Id<Empresa>>,
    pub session_id: Option<String>,
    pub status: StatusCarrinho,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Carrinho {
    pub fn esta_aberto(&self) -> bool {
        self.status == StatusCarrinho::Aberto
    }

    /// Dono do carrinho: contato autenticado ou sessão de convidado.
    pub fn pertence_a(&self, contato: Option<Id<Contato>>, sessao: Option<&str>) -> bool {
        match (self.contato_id, contato) {
            (Some(dono), Some(c)) if dono == c => true,
            (Some(_), _) => false,
            _ => match (self.session_id.as_deref(), sessao) {
                (Some(d), Some(s)) => d == s,
                _ => false,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CarrinhoItem {
    pub id: Id<CarrinhoItem>,
    pub carrinho_id: Id<Carrinho>,
    pub produto_id: Id<Produto>,
    pub quantidade: Quantidade,
    pub preco_unitario: Dinheiro,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl CarrinhoItem {
    pub fn total(&self) -> Dinheiro {
        self.preco_unitario.vezes(self.quantidade)
    }
}

/// Total funcional do carrinho — fold sobre os itens.
pub fn total_carrinho<'a>(itens: impl IntoIterator<Item = &'a CarrinhoItem>) -> Dinheiro {
    itens.into_iter().map(CarrinhoItem::total).sum()
}
