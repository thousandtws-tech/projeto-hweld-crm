//! # hweld-application
//!
//! Camada de aplicação: use cases (serviços), ports (traits de repositório e
//! serviços externos) e o erro de fronteira `ErroApp`.
//!
//! - Depende apenas de `hweld-domain` — nada de actix/sqlx aqui.
//! - Use cases orquestram: validam via smart constructors do domínio, chamam
//!   funções puras (totais, parcelas, precificação) e delegam persistência
//!   atômica aos ports.
//! - Ports são traits `Send + Sync` consumidas via `Arc<dyn …>` — a injeção
//!   acontece no bootstrap do servidor.

pub mod erro;
pub mod ports;
pub mod use_cases;

pub use erro::{ErroApp, Resultado};
