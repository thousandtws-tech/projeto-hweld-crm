//! `pagamentos` + `formas_pagamento` — contas a receber / parcelas do pedido.

use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;

use crate::enum_str;
use crate::financeiro::caixa::CaixaMovimentacao;
use crate::shared::dinheiro::Dinheiro;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;

use super::pedido::Pedido;

enum_str! {
    pub enum StatusPagamento {
        Pendente = "pendente",
        Pago = "pago",
        Vencido = "vencido",
        Cancelado = "cancelado",
        Estornado = "estornado",
    }
}

impl StatusPagamento {
    /// Baixa só de parcela em aberto; pago só estorna; cancelado/estornado são terminais.
    pub fn transicionar(self, proximo: Self) -> Result<Self, ErroDominio> {
        use StatusPagamento::*;
        let ok = matches!(
            (self, proximo),
            (Pendente, Pago | Vencido | Cancelado)
                | (Vencido, Pago | Cancelado)
                | (Pago, Estornado)
        );
        if ok {
            Ok(proximo)
        } else {
            Err(ErroDominio::TransicaoInvalida {
                entidade: "pagamento",
                de: self.to_string(),
                para: proximo.to_string(),
            })
        }
    }

    pub fn em_aberto(self) -> bool {
        matches!(self, Self::Pendente | Self::Vencido)
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct FormaPagamento {
    pub id: Id<FormaPagamento>,
    pub nome: String,
    pub ativo: bool,
    pub permite_parcelamento: bool,
    pub max_parcelas: i32,
}

impl FormaPagamento {
    pub fn aceita_parcelas(&self, n: u32) -> bool {
        self.ativo && (n == 1 || (self.permite_parcelamento && n <= self.max_parcelas as u32))
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Pagamento {
    pub id: Id<Pagamento>,
    pub pedido_id: Id<Pedido>,
    pub parcela_num: i32,
    pub valor: Dinheiro,
    pub vencimento: NaiveDate,
    pub pago_em: Option<DateTime<Utc>>,
    pub status: StatusPagamento,
    pub forma_pagamento_id: Option<Id<FormaPagamento>>,
    pub caixa_movimentacao_id: Option<Id<CaixaMovimentacao>>,
    pub observacao: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Pagamento {
    /// Parcela vencida e ainda em aberto — job de monitoramento usa isto.
    pub fn esta_vencido(&self, hoje: NaiveDate) -> bool {
        self.status.em_aberto() && self.vencimento < hoje
    }
}

/// Plano de parcelas calculado de forma pura e total (Fluxo E do modelo).
/// Divide o total em N parcelas; a última absorve a diferença de arredondamento,
/// garantindo `Σ parcelas == total` exatamente.
#[derive(Debug, Clone)]
pub struct ParcelaPlano {
    pub parcela_num: i32,
    pub valor: Dinheiro,
    pub vencimento: NaiveDate,
}

pub fn plano_parcelas(
    total: Dinheiro,
    quantidade: u32,
    primeiro_vencimento: NaiveDate,
    intervalo_dias: i64,
) -> Result<Vec<ParcelaPlano>, ErroDominio> {
    if quantidade == 0 {
        return Err(ErroDominio::regra(
            "plano de parcelas exige ao menos 1 parcela",
        ));
    }
    if total.is_zero() || total < Dinheiro::ZERO {
        return Err(ErroDominio::regra(
            "total do pedido deve ser positivo para parcelar",
        ));
    }

    let base = Dinheiro::novo(total.valor() / rust_decimal::Decimal::new(quantidade as i64, 0));

    let parcelas: Vec<ParcelaPlano> = (0..quantidade)
        .map(|i| {
            let eh_ultima = i == quantidade - 1;
            let valor = if eh_ultima {
                // última absorve a sobra de arredondamento
                let soma_anteriores: Dinheiro = (0..i).map(|_| base).sum();
                total - soma_anteriores
            } else {
                base
            };
            ParcelaPlano {
                parcela_num: (i + 1) as i32,
                valor,
                vencimento: primeiro_vencimento
                    + chrono::Duration::days(intervalo_dias * i64::from(i)),
            }
        })
        .collect();

    Ok(parcelas)
}
