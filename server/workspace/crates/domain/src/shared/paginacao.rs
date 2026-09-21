//! Paginação consistente em todas as listagens — APIs nunca retornam
//! coleções ilimitadas (anti-pattern: "unbounded APIs").

use serde::{Deserialize, Serialize};

use super::erro::ErroDominio;

pub const LIMITE_PADRAO: u32 = 20;
pub const LIMITE_MAXIMO: u32 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Paginacao {
    pub pagina: u32, // 1-based
    pub por_pagina: u32,
}

impl Default for Paginacao {
    fn default() -> Self {
        Self {
            pagina: 1,
            por_pagina: LIMITE_PADRAO,
        }
    }
}

impl Paginacao {
    pub fn nova(pagina: Option<u32>, por_pagina: Option<u32>) -> Result<Self, ErroDominio> {
        let por_pagina = por_pagina.unwrap_or(LIMITE_PADRAO);
        if por_pagina == 0 || por_pagina > LIMITE_MAXIMO {
            return Err(ErroDominio::valor_invalido(
                "por_pagina",
                format!("deve estar entre 1 e {LIMITE_MAXIMO}"),
            ));
        }
        Ok(Self {
            pagina: pagina.unwrap_or(1).max(1),
            por_pagina,
        })
    }

    pub fn offset(self) -> i64 {
        i64::from(self.pagina - 1) * i64::from(self.por_pagina)
    }

    pub fn limite(self) -> i64 {
        i64::from(self.por_pagina)
    }
}

/// Envelope de resposta paginada — o cliente sempre sabe onde está no total.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Pagina<T> {
    pub itens: Vec<T>,
    pub total: i64,
    pub pagina: u32,
    pub por_pagina: u32,
    pub total_paginas: u32,
}

impl<T> Pagina<T> {
    pub fn nova(itens: Vec<T>, total: i64, paginacao: Paginacao) -> Self {
        let total_paginas = if total == 0 {
            0
        } else {
            (total as u64).div_ceil(u64::from(paginacao.por_pagina))
        } as u32;
        Self {
            itens,
            total,
            pagina: paginacao.pagina,
            por_pagina: paginacao.por_pagina,
            total_paginas,
        }
    }

    pub fn map<U>(self, f: impl FnMut(T) -> U) -> Pagina<U> {
        Pagina {
            itens: self.itens.into_iter().map(f).collect(),
            total: self.total,
            pagina: self.pagina,
            por_pagina: self.por_pagina,
            total_paginas: self.total_paginas,
        }
    }
}
