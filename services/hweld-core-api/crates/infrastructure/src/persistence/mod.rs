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

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

use crate::config::Config;

/// Pool com limites explícitos — nunca conexões ilimitadas (regra §20).
///
/// - `min_connections` mantém conexões quentes: o primeiro request após
///   idle não paga handshake+auth do Postgres (~20–60ms em Railway).
/// - `acquire_timeout`/`idle_timeout`/`max_lifetime` boundam fila e
///   reciclagem — o default do sqlx é ~30s/∞, tempo demais para request.
/// - `after_connect` aplica `statement_timeout` e mata transações ociosas:
///   uma query degenerada ou cliente morto não segura conexão nem lock
///   indefinidamente (proteção de P99/pool exausto).
pub async fn conectar(config: &Config) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(config.db_max_connections)
        .min_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .idle_timeout(std::time::Duration::from_secs(600))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::Executor::execute(
                    conn,
                    "SET statement_timeout = '10s'; \
                     SET idle_in_transaction_session_timeout = '30s'; \
                     SET application_name = 'hweld-core-api'",
                )
                .await?;
                Ok(())
            })
        })
        .connect(&config.database_url)
        .await
}

/// Migrações embutidas no binário — `sqlx::migrate!` valida checksums.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../migrations");
