//! Primitivos monetários e de quantidade — nunca float para dinheiro.
//!
//! `Dinheiro`  → NUMERIC(14,2)  — admite negativo (ex.: diferença de caixa).
//! `Quantidade`→ NUMERIC(14,3)  — sempre estritamente positiva.

use core::iter::Sum;
use core::ops::{Add, Mul, Sub};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::erro::ErroDominio;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Dinheiro(Decimal);

impl Dinheiro {
    pub const ZERO: Self = Self(Decimal::ZERO);

    /// Construtor total — dinheiro pode ser negativo (ex.: quebra de caixa).
    pub fn novo(valor: Decimal) -> Self {
        Self(valor.round_dp(2))
    }

    /// Construtor para valores que não podem ser negativos (preços, totais).
    pub fn nao_negativo(valor: Decimal, campo: &'static str) -> Result<Self, ErroDominio> {
        if valor.is_sign_negative() {
            return Err(ErroDominio::valor_invalido(campo, "não pode ser negativo"));
        }
        Ok(Self::novo(valor))
    }

    pub fn valor(self) -> Decimal {
        self.0
    }

    pub fn vezes(self, quantidade: Quantidade) -> Self {
        Self(self.0 * quantidade.valor())
    }

    pub fn is_zero(self) -> bool {
        self.0.is_zero()
    }
}

impl Add for Dinheiro {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self::novo(self.0 + rhs.0)
    }
}

impl Sub for Dinheiro {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self::novo(self.0 - rhs.0)
    }
}

impl Mul<Decimal> for Dinheiro {
    type Output = Self;
    fn mul(self, fator: Decimal) -> Self {
        Self::novo(self.0 * fator)
    }
}

/// Agregação funcional: `itens.iter().map(|i| i.total()).sum::<Dinheiro>()`.
impl Sum for Dinheiro {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::ZERO, |acc, d| acc + d)
    }
}

impl From<Dinheiro> for Decimal {
    fn from(d: Dinheiro) -> Decimal {
        d.0
    }
}

impl core::fmt::Display for Dinheiro {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Quantidade fracionável (kg, metro) — invariante: sempre > 0.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Quantidade(Decimal);

impl Quantidade {
    pub fn nova(valor: Decimal) -> Result<Self, ErroDominio> {
        if valor <= Decimal::ZERO {
            return Err(ErroDominio::valor_invalido(
                "quantidade",
                "deve ser maior que zero",
            ));
        }
        Ok(Self(valor.round_dp(3)))
    }

    /// Somente para correções de estoque (`tipo = ajuste`), que admitem sinal.
    pub fn correcao(valor: Decimal) -> Result<Self, ErroDominio> {
        if valor.is_zero() {
            return Err(ErroDominio::valor_invalido(
                "quantidade",
                "ajuste não pode ser zero",
            ));
        }
        Ok(Self(valor.round_dp(3)))
    }

    pub fn valor(self) -> Decimal {
        self.0
    }
}

impl core::fmt::Display for Quantidade {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}", self.0)
    }
}

macro_rules! impl_schema_decimal_str {
    ($tipo:ty) => {
        impl utoipa::__dev::ComposeSchema for $tipo {
            fn compose(
                _: Vec<utoipa::openapi::RefOr<utoipa::openapi::schema::Schema>>,
            ) -> utoipa::openapi::RefOr<utoipa::openapi::schema::Schema> {
                utoipa::openapi::schema::Object::builder()
                    .schema_type(utoipa::openapi::schema::Type::String)
                    .into()
            }
        }

        impl utoipa::ToSchema for $tipo {}
    };
}

impl_schema_decimal_str!(Dinheiro);
impl_schema_decimal_str!(Quantidade);
