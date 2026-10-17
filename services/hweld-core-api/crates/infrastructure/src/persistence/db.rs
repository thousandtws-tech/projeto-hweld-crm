//! Helpers compartilhados da camada de persistência.

use hweld_application::ErroApp;
use hweld_domain::shared::documento::TipoDocumento;
use sqlx::{Postgres, Transaction};

pub fn erro_db(contexto: &'static str) -> impl FnOnce(sqlx::Error) -> ErroApp {
    move |e| match &e {
        sqlx::Error::Database(db) if db.is_unique_violation() => ErroApp::conflito(format!(
            "registro duplicado ({})",
            db.constraint().unwrap_or("unique")
        )),
        sqlx::Error::Database(db) if db.is_foreign_key_violation() => ErroApp::conflito(format!(
            "referência inválida ou em uso ({})",
            db.constraint().unwrap_or("foreign_key")
        )),
        sqlx::Error::Database(db) if db.is_check_violation() => {
            ErroApp::conflito(format!("regra do banco violada: {}", db.message()))
        }
        _ => ErroApp::interno(contexto, e),
    }
}

pub async fn proximo_numero(
    tx: &mut Transaction<'_, Postgres>,
    tipo: TipoDocumento,
) -> Result<String, ErroApp> {
    let sequencia = match tipo {
        TipoDocumento::Orcamento => "orcamento_numero_seq",
        TipoDocumento::Pedido => "pedido_numero_seq",
        TipoDocumento::OrdemServico => "os_numero_seq",
        TipoDocumento::NotaFiscal => "nf_numero_seq",
    };
    let (seq,): (i64,) = sqlx::query_as(&format!("SELECT nextval('{sequencia}')"))
        .fetch_one(&mut **tx)
        .await
        .map_err(erro_db("sequencia_documento"))?;
    Ok(tipo.formatar(seq))
}
