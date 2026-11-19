use std::sync::Arc;

use hweld_domain::auditoria::log::LogAuditoria;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::Resultado;
use crate::ports::auditoria::{FiltroAuditoria, RepositorioAuditoria};

pub struct ServicoAuditoria {
    auditoria: Arc<dyn RepositorioAuditoria>,
}

impl ServicoAuditoria {
    pub fn novo(auditoria: Arc<dyn RepositorioAuditoria>) -> Self {
        Self { auditoria }
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroAuditoria,
    ) -> Resultado<Pagina<LogAuditoria>> {
        self.auditoria.listar(paginacao, filtro).await
    }
}
