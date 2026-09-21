//! `hweld-api` — camada HTTP (Actix Web) sobre os casos de uso.
//!
//! Responsabilidades desta camada, e só desta:
//! - DTOs de request/response e parsing de query/path/body;
//! - extratores `AuthStaff`/`AuthPortal` (Bearer JWT) + RBAC por `Perfil`;
//! - mapeamento `ErroApp` → HTTP com envelope `{ "erro": { ... } }`;
//! - registro de rotas (`rotas::configurar`).
//!
//! Nenhuma regra de negócio, nenhum SQL, nenhum segredo aqui.

pub mod docs;
pub mod dto;
pub mod erro;
pub mod estado;
pub mod extratores;
pub mod handlers;
pub mod rotas;

pub use estado::AppState;
