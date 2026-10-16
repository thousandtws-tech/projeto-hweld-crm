//! Ports de persistência — módulo auditoria (consulta da trilha).

use async_trait::async_trait;
use hweld_domain::auditoria::log::LogAuditoria;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::Resultado;

#[derive(Debug, Clone, Default)]
pub struct FiltroAuditoria {
    pub entidade: Option<String>,
    pub entidade_id: Option<i64>,
    pub usuario_id: Option<i64>,
}

#[async_trait]
pub trait RepositorioAuditoria: Send + Sync {
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroAuditoria,
    ) -> Resultado<Pagina<LogAuditoria>>;
}
