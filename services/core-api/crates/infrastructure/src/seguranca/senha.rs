//! Hashing de senha — Argon2id (parâmetros OWASP recomendados).
//! CPU/memória intensivo de propósito: roda em `spawn_blocking` para não
//! bloquear o executor async (regra §20 — nunca bloquear a thread de I/O).

use argon2::password_hash::{
    rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
};
use argon2::{Algorithm, Argon2, Params, Version};
use async_trait::async_trait;
use hweld_application::ports::seguranca::HasherSenha;
use hweld_application::{ErroApp, Resultado};

/// `password_hash::Error` não implementa `std::error::Error` — embrulho mínimo
/// para caber em `ErroApp::Interno` preservando a mensagem para logs.
#[derive(Debug)]
struct ErroHashing(String);

impl std::fmt::Display for ErroHashing {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ErroHashing {}

fn erro_hash(e: impl std::fmt::Display) -> ErroApp {
    ErroApp::interno("hash_senha", ErroHashing(e.to_string()))
}

/// Argon2id com parâmetros de referência OWASP (m=19MiB, t=2, p=1).
fn argon2id() -> Argon2<'static> {
    let params = Params::new(19 * 1024, 2, 1, None).unwrap_or_default();
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

pub struct HasherArgon2;

impl HasherArgon2 {
    pub fn novo() -> Self {
        Self
    }
}

#[async_trait]
impl HasherSenha for HasherArgon2 {
    async fn hash(&self, senha: &str) -> Resultado<String> {
        let senha = senha.to_string();
        tokio::task::spawn_blocking(move || {
            let salt = SaltString::generate(&mut OsRng);
            argon2id()
                .hash_password(senha.as_bytes(), &salt)
                .map(|h| h.to_string())
                .map_err(erro_hash)
        })
        .await
        .map_err(|e| ErroApp::interno("hash_senha", e))?
    }

    /// Verificação em tempo constante; hash malformado → 500 (dado corrompido),
    /// senha incorreta → `false` (não 401 — a camada de cima decide).
    async fn verificar(&self, senha: &str, hash: &str) -> Resultado<bool> {
        let senha = senha.to_string();
        let hash = hash.to_string();
        tokio::task::spawn_blocking(move || {
            let parsed = PasswordHash::new(&hash).map_err(erro_hash)?;
            Ok(argon2id()
                .verify_password(senha.as_bytes(), &parsed)
                .is_ok())
        })
        .await
        .map_err(|e| ErroApp::interno("hash_senha", e))?
    }
}
