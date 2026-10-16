//! `hweld-infrastructure` — adaptadores concretos dos ports da aplicação.
//!
//! Implementa persistência PostgreSQL (SQLx), segurança (Argon2id, JWT),
//! gateway fiscal (stub) e trilha de auditoria. Nenhuma regra de negócio
//! vive aqui — só a mecânica de falar com o mundo exterior.

pub mod busca;
pub mod config;
pub mod fiscal;
pub mod observabilidade;
pub mod persistence;
pub mod realtime;
pub mod seguranca;

pub use busca::BuscaElastic;
pub use config::{Config, ErroConfig};
pub use fiscal::GatewayFiscalStub;
pub use observabilidade::{iniciar as iniciar_observabilidade, Observabilidade};
pub use persistence::{conectar, MIGRATOR};
pub use realtime::HttpRealtime;
pub use seguranca::{EmissorJwt, HasherArgon2};
