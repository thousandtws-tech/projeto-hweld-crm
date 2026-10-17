//! `pedidos` + `pedido_itens` — núcleo do fluxo de venda.
//!
//! Regras do modelo: um pedido nasce de UM orçamento OU UM carrinho OU manual
//! (§4.13); transições seguem máquina de estados (§7.3); cancelamento com
//! motivo, nunca delete físico (§7.5).

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::acesso::usuario::Usuario;
use crate::catalogo::produto::Produto;
use crate::crm::contato::Contato;
use crate::crm::empresa::Empresa;
use crate::crm::endereco::Endereco;
use crate::crm::orcamento::Orcamento;
use crate::enum_str;
use crate::shared::dinheiro::{Dinheiro, Quantidade};
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;

use super::carrinho::Carrinho;

enum_str! {
    pub enum OrigemPedido {
        Ecommerce = "ecommerce",
        Orcamento = "orcamento",
        Manual = "manual",
    }
}

enum_str! {
    /// Máquina de estados do pedido (Fluxo A do modelo).
    pub enum StatusPedido {
        AguardandoPagamento = "aguardando_pagamento",
        Confirmado = "confirmado",
        EmSeparacao = "em_separacao",
        Faturado = "faturado",
        Enviado = "enviado",
        Entregue = "entregue",
        Concluido = "concluido",
        Cancelado = "cancelado",
    }
}

impl StatusPedido {
    pub fn eh_terminal(self) -> bool {
        matches!(self, Self::Concluido | Self::Cancelado)
    }

    /// Transições válidas — função total sobre (atual, próximo).
    /// `faturado` em diante não admite cancelamento (mercadoria já saiu/NF emitida).
    pub fn transicionar(self, proximo: Self) -> Result<Self, ErroDominio> {
        use StatusPedido::*;
        let ok = matches!(
            (self, proximo),
            (AguardandoPagamento, Confirmado | Cancelado)
                | (Confirmado, EmSeparacao | Cancelado)
                | (EmSeparacao, Faturado | Cancelado)
                | (Faturado, Enviado)
                | (Enviado, Entregue)
                | (Entregue, Concluido)
        );
        if ok {
            Ok(proximo)
        } else {
            Err(ErroDominio::TransicaoInvalida {
                entidade: "pedido",
                de: self.to_string(),
                para: proximo.to_string(),
            })
        }
    }

    /// Estoque reservado pode ser liberado neste status (cancelamento pré-faturamento).
    pub fn libera_reserva_ao_cancelar(self) -> bool {
        matches!(
            self,
            Self::AguardandoPagamento | Self::Confirmado | Self::EmSeparacao
        )
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct PedidoItem {
    pub id: Id<PedidoItem>,
    pub pedido_id: Id<Pedido>,
    pub produto_id: Id<Produto>,
    pub descricao: String,
    pub sku: String,
    pub quantidade: Quantidade,
    pub preco_unitario: Dinheiro,
    pub desconto: Dinheiro,
    pub total: Dinheiro,
}

/// Item ainda não persistido — snapshot capturado no fechamento.
#[derive(Debug, Clone)]
pub struct ItemPedidoNovo {
    pub produto_id: Id<Produto>,
    pub descricao: String,
    pub sku: String,
    pub quantidade: Quantidade,
    pub preco_unitario: Dinheiro,
    pub desconto: Dinheiro,
}

impl ItemPedidoNovo {
    pub fn total(&self) -> Dinheiro {
        (self.preco_unitario.vezes(self.quantidade) - self.desconto).max(Dinheiro::ZERO)
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Pedido {
    pub id: Id<Pedido>,
    /// Identificador externo opaco (URLs) — nunca expõe o id sequencial.
    pub public_id: Uuid,
    pub numero: String,
    pub empresa_id: Id<Empresa>,
    pub contato_id: Id<Contato>,
    pub endereco_faturamento_id: Id<Endereco>,
    pub endereco_entrega_id: Id<Endereco>,
    pub origem: OrigemPedido,
    pub orcamento_id: Option<Id<Orcamento>>,
    pub carrinho_id: Option<Id<Carrinho>>,
    pub vendedor_id: Option<Id<Usuario>>,
    pub status: StatusPedido,
    pub subtotal: Dinheiro,
    pub desconto: Dinheiro,
    pub frete: Dinheiro,
    pub total: Dinheiro,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Pedido {
    /// Invariante de origem (§4.13): exatamente uma fonte por pedido.
    pub fn validar_origem(&self) -> Result<(), ErroDominio> {
        let ok = match self.origem {
            OrigemPedido::Orcamento => self.orcamento_id.is_some() && self.carrinho_id.is_none(),
            OrigemPedido::Ecommerce => self.carrinho_id.is_some() && self.orcamento_id.is_none(),
            OrigemPedido::Manual => self.orcamento_id.is_none() && self.carrinho_id.is_none(),
        };
        if ok {
            Ok(())
        } else {
            Err(ErroDominio::regra(
                "pedido deve nascer de exatamente uma origem: orçamento, carrinho ou manual",
            ))
        }
    }

    /// Reserva de estoque é exigida a partir de `confirmado` (Fluxo D).
    pub fn exige_reserva(&self) -> bool {
        matches!(
            self.status,
            StatusPedido::Confirmado
                | StatusPedido::EmSeparacao
                | StatusPedido::Faturado
                | StatusPedido::Enviado
                | StatusPedido::Entregue
                | StatusPedido::Concluido
        )
    }
}
