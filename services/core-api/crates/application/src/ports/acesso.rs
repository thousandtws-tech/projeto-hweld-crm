//! Ports de persistência — módulo de acesso.

use async_trait::async_trait;
use hweld_domain::acesso::usuario::{NovoUsuario, Perfil, Usuario};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::Resultado;

#[derive(Debug, Clone, Default)]
pub struct FiltroUsuarios {
    pub perfil: Option<Perfil>,
    pub ativo: Option<bool>,
    pub busca: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AtualizarUsuario {
    pub nome: Option<String>,
    pub email: Option<String>,
    pub perfil: Option<Perfil>,
}

#[async_trait]
pub trait RepositorioUsuarios: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Usuario>) -> Resultado<Option<Usuario>>;
    async fn buscar_por_email(&self, email: &str) -> Resultado<Option<Usuario>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroUsuarios,
    ) -> Resultado<Pagina<Usuario>>;
    async fn criar(&self, novo: NovoUsuario) -> Resultado<Usuario>;
    async fn atualizar(&self, id: Id<Usuario>, dados: AtualizarUsuario) -> Resultado<Usuario>;
    async fn definir_ativo(&self, id: Id<Usuario>, ativo: bool) -> Resultado<()>;
    async fn atualizar_senha(&self, id: Id<Usuario>, senha_hash: &str) -> Resultado<()>;
    async fn total(&self) -> Resultado<i64>;
}
