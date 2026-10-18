//! Adapters de object storage — `local` (disco, dev/fallback) e
//! `minio` (S3-compatível via SigV4 sobre reqwest — zero dep extra).

pub mod local;
pub mod minio;

pub use local::ArmazenamentoLocal;
pub use minio::ArmazenamentoMinio;
