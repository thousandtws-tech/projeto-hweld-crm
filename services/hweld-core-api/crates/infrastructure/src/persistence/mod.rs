//! Adaptadores de persistência PostgreSQL (SQLx) — implementam os ports
//! da camada de aplicação. Escritas multi-tabela acontecem em transação
//! aqui dentro, mantendo as invariantes do modelo (§7).

pub mod auditoria;
pub mod cache;
pub mod catalogo;
pub mod crm;
pub mod db;
pub mod estoque;
pub mod financeiro;
pub mod fiscal;
pub mod integracao;
pub mod notificacoes;
pub mod operacao;
pub mod usuarios;
pub mod vendas;

pub use auditoria::{RegistradorAuditoriaPg, RepositorioAuditoriaPg};
pub use catalogo::{RepositorioCategoriasPg, RepositorioProdutosPg, RepositorioTabelasPrecoPg};
pub use crm::{
    RepositorioContatosPg, RepositorioEmpresasPg, RepositorioEnderecosPg, RepositorioInteracoesPg,
    RepositorioOportunidadesPg, RepositorioOrcamentosPg,
};
pub use estoque::RepositorioEstoquePg;
pub use financeiro::RepositorioCaixasPg;
pub use fiscal::{RepositorioConfigFiscalPg, RepositorioNotasFiscaisPg};
pub use integracao::RepositorioEventosIntegracaoPg;
pub use notificacoes::RepositorioNotificacoesPg;
pub use operacao::RepositorioOrdensServicoPg;
pub use usuarios::RepositorioUsuariosPg;
pub use vendas::{
    RepositorioCarrinhosPg, RepositorioFormasPagamentoPg, RepositorioPagamentosPg,
    RepositorioPedidosPg,
};

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

use crate::config::Config;

/// Pool com limites explícitos — nunca conexões ilimitadas (regra §20).
pub async fn conectar(config: &Config) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(config.db_max_connections)
        .connect(&config.database_url)
        .await
}

/// Migrações embutidas no binário — `sqlx::migrate!` valida checksums.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");
