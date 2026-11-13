use super::erro::{ErroCampo, ErroDominio};

#[derive(Debug, Default)]
pub struct AcumuladorValidacao {
    erros: Vec<ErroCampo>,
}

impl AcumuladorValidacao {
    pub fn novo() -> Self {
        Self::default()
    }

    /// Valida campo obrigatório; em erro, acumula e devolve `None`.
    pub fn validar<T>(
        &mut self,
        campo: &'static str,
        resultado: Result<T, ErroDominio>,
    ) -> Option<T> {
        match resultado {
            Ok(valor) => Some(valor),
            Err(e) => {
                self.erros.push(ErroCampo::novo(campo, e.to_string()));
                None
            }
        }
    }

    /// Valida campo opcional: `Some` inválido acumula erro e vira `None`.
    pub fn validar_opcional<T>(
        &mut self,
        campo: &'static str,
        resultado: Option<Result<T, ErroDominio>>,
    ) -> Option<T> {
        match resultado {
            Some(Ok(valor)) => Some(valor),
            Some(Err(e)) => {
                self.erros.push(ErroCampo::novo(campo, e.to_string()));
                None
            }
            None => None,
        }
    }

    /// Regra de negócio arbitrária ligada a um campo (ou contexto geral).
    pub fn regra(&mut self, campo: &'static str, ok: bool, mensagem: impl Into<String>) {
        if !ok {
            self.erros.push(ErroCampo::novo(campo, mensagem));
        }
    }

    /// `Ok(())` quando não houve erro — senão `ErroDominio::Validacao` completo.
    pub fn finish(self) -> Result<(), ErroDominio> {
        if self.erros.is_empty() {
            Ok(())
        } else {
            Err(ErroDominio::Validacao(self.erros))
        }
    }
}

/// Helpers de validação textual usados pelos smart constructors.
pub mod texto {
    use crate::shared::erro::ErroDominio;

    pub fn obrigatorio(
        campo: &'static str,
        valor: &str,
        max: usize,
    ) -> Result<String, ErroDominio> {
        let v = valor.trim();
        if v.is_empty() {
            return Err(ErroDominio::valor_invalido(campo, "obrigatório"));
        }
        if v.chars().count() > max {
            return Err(ErroDominio::valor_invalido(
                campo,
                format!("máximo de {max} caracteres"),
            ));
        }
        Ok(v.to_string())
    }

    pub fn opcional(
        valor: Option<&str>,
        campo: &'static str,
        max: usize,
    ) -> Result<Option<String>, ErroDominio> {
        match valor.map(str::trim).filter(|v| !v.is_empty()) {
            None => Ok(None),
            Some(v) if v.chars().count() > max => Err(ErroDominio::valor_invalido(
                campo,
                format!("máximo de {max} caracteres"),
            )),
            Some(v) => Ok(Some(v.to_string())),
        }
    }

    pub fn email(campo: &'static str, valor: &str) -> Result<String, ErroDominio> {
        let v = obrigatorio(campo, valor, 160)?;
        let valido = v.contains('@')
            && v.split('@').all(|p| !p.is_empty())
            && v.rsplit('@').next().is_some_and(|d| d.contains('.'));
        if !valido {
            return Err(ErroDominio::valor_invalido(campo, "e-mail malformado"));
        }
        Ok(v.to_lowercase())
    }

    /// CNPJ: 14 dígitos com dígitos verificadores válidos (algoritmo módulo 11).
    pub fn cnpj(campo: &'static str, valor: &str) -> Result<String, ErroDominio> {
        let digitos: Vec<u8> = valor
            .chars()
            .filter(char::is_ascii_digit)
            .map(|c| c as u8 - b'0')
            .collect();

        if digitos.len() != 14 {
            return Err(ErroDominio::valor_invalido(
                campo,
                "CNPJ deve ter 14 dígitos",
            ));
        }
        if digitos.iter().all(|d| *d == digitos[0]) {
            return Err(ErroDominio::valor_invalido(campo, "CNPJ inválido"));
        }

        let dv = |base: &[u8], pesos: &[u8]| -> u8 {
            let soma: u32 = base
                .iter()
                .zip(pesos.iter())
                .map(|(d, p)| (*d as u32) * (*p as u32))
                .sum();
            match soma % 11 {
                r if r < 2 => 0,
                r => (11 - r) as u8,
            }
        };

        let dv1 = dv(&digitos[..12], &[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        let dv2 = dv(&digitos[..13], &[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

        if dv1 != digitos[12] || dv2 != digitos[13] {
            return Err(ErroDominio::valor_invalido(
                campo,
                "dígitos verificadores inválidos",
            ));
        }
        Ok(digitos.iter().map(u8::to_string).collect())
    }

    /// Slug URL-safe: minúsculas, dígitos e hífens.
    pub fn slug(campo: &'static str, valor: &str, max: usize) -> Result<String, ErroDominio> {
        let v = obrigatorio(campo, valor, max)?;
        let normalizado: String = v
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");
        if normalizado.is_empty() {
            return Err(ErroDominio::valor_invalido(
                campo,
                "slug vazio após normalização",
            ));
        }
        Ok(normalizado)
    }
}
