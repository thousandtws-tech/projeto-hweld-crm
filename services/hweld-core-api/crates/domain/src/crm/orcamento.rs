//! `orcamentos` + `orcamento_itens` — orçamentos comerciais.
//!
//! Regras do modelo: snapshots de descrição/preço nos itens (§2), orçamento
//! `aprovado` converte em no máximo 1 pedido (§7.1) e `convertido` vira
//! somente leitura (§7.6).

use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::acesso::usuario::Usuario;
use crate::catalogo::produto::Produto;
use crate::enum_str;
use crate::shared::dinheiro::{Dinheiro, Quantidade};
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

use super::contato::Contato;
use super::empresa::Empresa;
use super::oportunidade::Oportunidade;

enum_str! {
    pub enum StatusOrcamento {
        Rascunho = "rascunho",
        Enviado = "enviado",
        EmAnalise = "em_analise",
        Aprovado = "aprovado",
        Recusado = "recusado",
        Expirado = "expirado",
        Convertido = "convertido",
    }
}

impl StatusOrcamento {
    pub fn eh_terminal(self) -> bool {
        matches!(self, Self::Recusado | Self::Expirado | Self::Convertido)
    }

    /// Somente aprovado pode converter em pedido (§7.1).
    pub fn pode_converter(self) -> bool {
        matches!(self, Self::Aprovado)
    }

    /// Edição de itens só em rascunho.
    pub fn pode_editar_itens(self) -> bool {
        matches!(self, Self::Rascunho)
    }

    pub fn transicionar(self, proximo: Self) -> Result<Self, ErroDominio> {
        use StatusOrcamento::*;
        let ok = matches!(
            (self, proximo),
            (Rascunho, Enviado)
                | (Enviado, EmAnalise | Expirado)
                | (EmAnalise, Aprovado | Recusado | Expirado)
                | (Aprovado, Convertido | Expirado)
        );
        if ok {
            Ok(proximo)
        } else {
            Err(ErroDominio::TransicaoInvalida {
                entidade: "orcamento",
                de: self.to_string(),
                para: proximo.to_string(),
            })
        }
    }
}

/// Item de orçamento — `descricao`/`preco_unitario` são snapshots imutáveis.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct OrcamentoItem {
    pub id: Id<OrcamentoItem>,
    pub orcamento_id: Id<Orcamento>,
    pub produto_id: Id<Produto>,
    pub descricao: String,
    pub quantidade: Quantidade,
    pub preco_unitario: Dinheiro,
    pub desconto: Dinheiro,
    pub total: Dinheiro,
}

/// Item ainda não persistido — total calculado por função pura.
#[derive(Debug, Clone)]
pub struct ItemOrcamentoNovo {
    pub produto_id: Id<Produto>,
    pub descricao: String,
    pub quantidade: Quantidade,
    pub preco_unitario: Dinheiro,
    pub desconto: Dinheiro,
}

impl ItemOrcamentoNovo {
    /// `total = quantidade × preço − desconto` (nunca negativo).
    pub fn total(&self) -> Dinheiro {
        (self.preco_unitario.vezes(self.quantidade) - self.desconto).max(Dinheiro::ZERO)
    }
}

/// Totais do documento — resultado de fold sobre os itens.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TotaisDocumento {
    pub subtotal: Dinheiro,
    pub desconto: Dinheiro,
    pub frete: Dinheiro,
    pub total: Dinheiro,
}

/// Cálculo puro: `subtotal = Σ totais dos itens`, `total = subtotal − desconto + frete`.
/// Mesma função serve orçamento e pedido — regra de fechamento única.
pub fn calcular_totais<I>(totais_itens: I, desconto: Dinheiro, frete: Dinheiro) -> TotaisDocumento
where
    I: IntoIterator<Item = Dinheiro>,
{
    let subtotal: Dinheiro = totais_itens.into_iter().sum();
    let total = (subtotal - desconto + frete).max(Dinheiro::ZERO);
    TotaisDocumento {
        subtotal,
        desconto,
        frete,
        total,
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Orcamento {
    pub id: Id<Orcamento>,
    /// Identificador externo opaco (URLs) — nunca expõe o id sequencial.
    pub public_id: Uuid,
    pub numero: String,
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub oportunidade_id: Option<Id<Oportunidade>>,
    pub vendedor_id: Id<Usuario>,
    pub status: StatusOrcamento,
    pub emitido_em: DateTime<Utc>,
    pub valido_ate: Option<NaiveDate>,
    pub subtotal: Dinheiro,
    pub desconto: Dinheiro,
    pub frete: Dinheiro,
    pub total: Dinheiro,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
    pub convertido_pedido_id: Option<Id<crate::vendas::pedido::Pedido>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Orcamento {
    /// Expirado automaticamente quando passa da validade (exceto terminais).
    pub fn expirado_por_validade(&self, hoje: NaiveDate) -> bool {
        match (self.status, self.valido_ate) {
            (s, Some(validade)) if !s.eh_terminal() => validade < hoje,
            _ => false,
        }
    }

    pub fn pode_converter(&self) -> bool {
        self.status.pode_converter() && self.convertido_pedido_id.is_none()
    }
}

#[derive(Debug, Clone)]
pub struct OrcamentoInput {
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub oportunidade_id: Option<Id<Oportunidade>>,
    pub vendedor_id: Id<Usuario>,
    pub valido_ate: Option<NaiveDate>,
    pub desconto: Dinheiro,
    pub frete: Dinheiro,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
    pub itens: Vec<ItemOrcamentoNovo>,
}

impl OrcamentoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        v.regra(
            "itens",
            !self.itens.is_empty(),
            "orçamento exige ao menos 1 item",
        );
        v.regra(
            "condicao_pagamento",
            self.condicao_pagamento
                .as_deref()
                .is_none_or(|c| c.len() <= 200),
            "máximo de 200 caracteres",
        );
        let _ = v.validar_opcional(
            "observacoes",
            self.observacoes
                .as_deref()
                .map(|s| texto::obrigatorio("observacoes", s, 5000)),
        );
        v.finish()?;
        Ok(self)
    }
}
