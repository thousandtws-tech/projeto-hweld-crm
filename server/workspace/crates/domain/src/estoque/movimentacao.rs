//! `estoque_saldos` + `estoque_movimentacoes` — Fluxo D do modelo.
//!
//! Movimentações são a fonte da verdade (imutáveis); `estoque_saldos` é uma
//! projeção derivada — aqui implementada como fold funcional puro, e no
//! Postgres atualizada na mesma transação do movimento (§7.4).

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::acesso::usuario::Usuario;
use crate::catalogo::produto::Produto;
use crate::enum_str;
use crate::operacao::ordem_servico::OrdemServico;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::vendas::pedido::Pedido;

enum_str! {
    /// Direção do movimento dada pelo tipo — quantidade sempre positiva,
    /// exceto `ajuste` que é assinado (correção ±).
    pub enum TipoMovimentacao {
        Entrada = "entrada",
        Saida = "saida",
        Reserva = "reserva",
        LiberacaoReserva = "liberacao_reserva",
        Ajuste = "ajuste",
    }
}

impl TipoMovimentacao {
    /// Delta aplicado a (disponível, reservado) — função pura de transição.
    fn delta(self, qtd: Decimal) -> (Decimal, Decimal) {
        match self {
            Self::Entrada => (qtd, Decimal::ZERO),
            Self::Saida => (-qtd, Decimal::ZERO),
            Self::Reserva => (-qtd, qtd),
            Self::LiberacaoReserva => (qtd, -qtd),
            Self::Ajuste => (qtd, Decimal::ZERO),
        }
    }

    /// `ajuste` é o único tipo que admite quantidade negativa.
    pub fn exige_quantidade_positiva(self) -> bool {
        !matches!(self, Self::Ajuste)
    }
}

/// Saldo materializado — 1:1 com produto. Nunca escrito diretamente (§7.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, utoipa::ToSchema)]
pub struct EstoqueSaldo {
    pub produto_id: Id<Produto>,
    #[schema(value_type = String)]
    pub quantidade_disponivel: Decimal,
    #[schema(value_type = String)]
    pub quantidade_reservada: Decimal,
}

impl EstoqueSaldo {
    pub fn zero(produto_id: Id<Produto>) -> Self {
        Self {
            produto_id,
            quantidade_disponivel: Decimal::ZERO,
            quantidade_reservada: Decimal::ZERO,
        }
    }

    /// Físico em estoque = disponível + reservado.
    pub fn fisico(self) -> Decimal {
        self.quantidade_disponivel + self.quantidade_reservada
    }

    /// Aplica um movimento — transição pura que preserva a invariante
    /// `disponível ≥ 0 ∧ reservado ≥ 0` (falha em vez de corromper).
    pub fn aplicar(self, tipo: TipoMovimentacao, quantidade: Decimal) -> Result<Self, ErroDominio> {
        let (d_disp, d_res) = tipo.delta(quantidade);
        let disp = self.quantidade_disponivel + d_disp;
        let res = self.quantidade_reservada + d_res;

        if disp.is_sign_negative() {
            return Err(ErroDominio::EstoqueInsuficiente {
                produto_id: self.produto_id.valor(),
                disponivel: self.quantidade_disponivel.to_string(),
                solicitado: quantidade.to_string(),
            });
        }
        if res.is_sign_negative() {
            return Err(ErroDominio::regra(format!(
                "reserva insuficiente para liberar {quantidade} do produto {}",
                self.produto_id
            )));
        }

        Ok(Self {
            quantidade_disponivel: disp,
            quantidade_reservada: res,
            ..self
        })
    }

    /// Deriva o saldo a partir do histórico — fold puro sobre movimentações.
    /// Útil para auditoria/verificação da projeção materializada.
    pub fn derivar<'a>(
        produto_id: Id<Produto>,
        movimentacoes: impl IntoIterator<Item = &'a EstoqueMovimentacao>,
    ) -> Result<Self, ErroDominio> {
        movimentacoes
            .into_iter()
            .try_fold(Self::zero(produto_id), |saldo, m| {
                saldo.aplicar(m.tipo, m.quantidade)
            })
    }
}

/// Movimentação imutável — correções se fazem via estorno (§7.2).
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct EstoqueMovimentacao {
    pub id: Id<EstoqueMovimentacao>,
    pub produto_id: Id<Produto>,
    pub tipo: TipoMovimentacao,
    #[schema(value_type = String)]
    pub quantidade: Decimal,
    #[schema(value_type = String)]
    pub saldo_antes: Decimal,
    #[schema(value_type = String)]
    pub saldo_depois: Decimal,
    pub pedido_id: Option<Id<Pedido>>,
    pub ordem_servico_id: Option<Id<OrdemServico>>,
    pub usuario_id: Option<Id<Usuario>>,
    pub motivo: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Comando de movimentação — o que a aplicação pede ao repositório.
#[derive(Debug, Clone)]
pub struct MovimentacaoCmd {
    pub produto_id: Id<Produto>,
    pub tipo: TipoMovimentacao,
    pub quantidade: Decimal,
    pub pedido_id: Option<Id<Pedido>>,
    pub ordem_servico_id: Option<Id<OrdemServico>>,
    pub usuario_id: Option<Id<Usuario>>,
    pub motivo: Option<String>,
}

impl MovimentacaoCmd {
    pub fn validar(&self) -> Result<(), ErroDominio> {
        if self.tipo.exige_quantidade_positiva() && self.quantidade <= Decimal::ZERO {
            return Err(ErroDominio::valor_invalido(
                "quantidade",
                "deve ser positiva neste tipo de movimento",
            ));
        }
        if self.tipo == TipoMovimentacao::Ajuste && self.quantidade.is_zero() {
            return Err(ErroDominio::valor_invalido(
                "quantidade",
                "ajuste não pode ser zero",
            ));
        }
        if self.tipo == TipoMovimentacao::Ajuste
            && self
                .motivo
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .is_empty()
        {
            return Err(ErroDominio::regra(
                "motivo obrigatório em ajuste de estoque",
            ));
        }
        Ok(())
    }
}
