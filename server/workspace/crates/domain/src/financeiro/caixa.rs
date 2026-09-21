//! `caixas` + `caixa_movimentacoes` — Fluxo E do modelo.
//! Lançamentos imutáveis; fechamento confere calculado × informado (§4.17).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::acesso::usuario::Usuario;
use crate::enum_str;
use crate::shared::dinheiro::Dinheiro;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::vendas::pagamento::{FormaPagamento, Pagamento};

enum_str! {
    pub enum StatusCaixa {
        Aberto = "aberto",
        Fechado = "fechado",
    }
}

enum_str! {
    /// Sinal do lançamento: entradas somam, saídas subtraem do saldo do caixa.
    pub enum TipoCaixaMovimentacao {
        Suprimento = "suprimento",
        Sangria = "sangria",
        Venda = "venda",
        Recebimento = "recebimento",
        Despesa = "despesa",
        Estorno = "estorno",
    }
}

impl TipoCaixaMovimentacao {
    /// `true` = entrada de dinheiro; `false` = saída.
    pub fn eh_entrada(self) -> bool {
        matches!(self, Self::Suprimento | Self::Venda | Self::Recebimento)
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Caixa {
    pub id: Id<Caixa>,
    pub aberto_por: Id<Usuario>,
    pub aberto_em: DateTime<Utc>,
    pub valor_abertura: Dinheiro,
    pub fechado_por: Option<Id<Usuario>>,
    pub fechado_em: Option<DateTime<Utc>>,
    pub valor_fechamento_calculado: Option<Dinheiro>,
    pub valor_fechamento_informado: Option<Dinheiro>,
    pub diferenca: Option<Dinheiro>,
    pub status: StatusCaixa,
}

impl Caixa {
    pub fn esta_aberto(&self) -> bool {
        self.status == StatusCaixa::Aberto
    }

    /// Lançamento só existe com caixa aberto (§5).
    pub fn aceita_movimentacao(&self) -> Result<(), ErroDominio> {
        if self.esta_aberto() {
            Ok(())
        } else {
            Err(ErroDominio::regra(
                "lançamento exige caixa aberto — abra um caixa antes de movimentar",
            ))
        }
    }
}

/// Lançamento imutável de caixa (§7.2).
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CaixaMovimentacao {
    pub id: Id<CaixaMovimentacao>,
    pub caixa_id: Id<Caixa>,
    pub tipo: TipoCaixaMovimentacao,
    pub valor: Dinheiro,
    pub forma_pagamento_id: Option<Id<FormaPagamento>>,
    pub pagamento_id: Option<Id<Pagamento>>,
    pub usuario_id: Option<Id<Usuario>>,
    pub descricao: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Saldo calculado do caixa — fold funcional sobre lançamentos.
/// `saldo = abertura + Σ(entradas) − Σ(saídas)`.
pub fn saldo_calculado(
    abertura: Dinheiro,
    movimentacoes: impl IntoIterator<Item = CaixaMovimentacao>,
) -> Dinheiro {
    movimentacoes
        .into_iter()
        .map(|m| {
            if m.tipo.eh_entrada() {
                m.valor
            } else {
                Dinheiro::novo(-m.valor.valor())
            }
        })
        .fold(abertura, |acc, v| acc + v)
}

/// Resultado do fechamento — conferência física × calculada.
#[derive(Debug, Clone, Copy)]
pub struct FechamentoCaixa {
    pub calculado: Dinheiro,
    pub informado: Dinheiro,
    pub diferenca: Dinheiro, // informado − calculado (quebra de caixa)
}

pub fn fechar(
    abertura: Dinheiro,
    informado: Dinheiro,
    movs: Vec<CaixaMovimentacao>,
) -> FechamentoCaixa {
    let calculado = saldo_calculado(abertura, movs);
    FechamentoCaixa {
        calculado,
        informado,
        diferenca: informado - calculado,
    }
}
