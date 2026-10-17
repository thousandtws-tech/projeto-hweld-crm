//! `eventos_integracao` — inbox de deduplicação do canal Java → Rust.
//! A inserção com `ON CONFLICT DO NOTHING` é a barreira atômica: duas
//! entregas concorrentes do mesmo `event_id` resultam em uma única
//! linha afetada, e só o vencedor processa o evento.

use async_trait::async_trait;
use hweld_application::Resultado;
use hweld_application::ports::integracao::RepositorioEventosIntegracao;
use sqlx::PgPool;
use uuid::Uuid;

use super::db::erro_db;

const CTX: &str = "eventos_integracao";

pub struct RepositorioEventosIntegracaoPg {
    pool: PgPool,
}

impl RepositorioEventosIntegracaoPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioEventosIntegracao for RepositorioEventosIntegracaoPg {
    async fn registrar_se_novo(
        &self,
        event_id: Uuid,
        tipo: &str,
        aggregate_id: &str,
        resultado: &str,
    ) -> Resultado<bool> {
        let r = sqlx::query(
            "INSERT INTO eventos_integracao (event_id, tipo, aggregate_id, resultado) \
             VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING",
        )
        .bind(event_id)
        .bind(tipo)
        .bind(aggregate_id)
        .bind(resultado)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(r.rows_affected() > 0)
    }

    async fn marcar_resultado(&self, event_id: Uuid, resultado: &str) -> Resultado<()> {
        sqlx::query("UPDATE eventos_integracao SET resultado = $2 WHERE event_id = $1")
            .bind(event_id)
            .bind(resultado)
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        Ok(())
    }
}
