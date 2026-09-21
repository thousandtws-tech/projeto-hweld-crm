//! Adaptadores de busca — Elasticsearch (oficial) implementando
//! `MotorBusca` da camada de aplicação.

pub mod elasticsearch;

pub use elasticsearch::BuscaElastic;
