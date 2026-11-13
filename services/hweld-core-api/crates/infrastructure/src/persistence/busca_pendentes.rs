//! `busca_pendentes` — outbox de sincronização do índice Elasticsearch.
//! O relay faz poll em `vencidos`; falhas agendam retry com backoff
//! quadrático (`tentativas²` minutos) até `morto` na 8ª — linhas mortas
//! ficam visíveis para triagem manual, nunca desaparecem sozinhas.

use async_trait::async_trait;
use hweld_application::ports::busca::{
    OperacaoBusca, PendenciaBusca, RepositorioBuscaPendentes,
};
use hweld_application::Resultado;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::shared::id::Id;
use sqlx::PgPool;

use super::db::erro_db;

const CTX: &str = "busca_pendentes";
const MAX_TENTATIVAS: i32 = 8;

pub struct RepositorioBuscaPendentesPg {
    pool: PgPool,
}

impl RepositorioBuscaPendentesPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioBuscaPendentes for RepositorioBuscaPendentesPg {
    async fn enfileirar(
        &self,
        produto_id: Id<Produto>,
        operacao: OperacaoBusca,
        erro: &str,
    ) -> Resultado<()> {
        sqlx::query(
            "INSERT INTO busca_pendentes (produto_id, operacao, ultimo_erro) \
             VALUES ($1, $2, $3)",
        )
        .bind(produto_id.valor())
        .bind(operacao.como_str())
        .bind(erro)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(())
    }

    async fn vencidos(&self, limite: u32) -> Resultado<Vec<PendenciaBusca>> {
        let linhas = sqlx::query_as::<_, (i64, i64, String, i32)>(
            "SELECT id, produto_id, operacao, tentativas FROM busca_pendentes \
             WHERE morto = FALSE AND proximo_retry <= now() \
             ORDER BY proximo_retry LIMIT $1",
        )
        .bind(limite as i64)
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(linhas
            .into_iter()
            .map(|(id, produto_id, operacao, tentativas)| PendenciaBusca {
                id,
                produto_id: Id::novo(produto_id),
                operacao: OperacaoBusca::de_str(&operacao),
                tentativas,
            })
            .collect())
    }

    async fn concluir(&self, id: i64) -> Resultado<()> {
        sqlx::query("DELETE FROM busca_pendentes WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        Ok(())
    }

    async fn falhar(&self, id: i64, erro: &str) -> Resultado<()> {
        sqlx::query(
            "UPDATE busca_pendentes SET \
                tentativas = tentativas + 1, \
                ultimo_erro = $2, \
                proximo_retry = now() + make_interval(mins => (tentativas + 1) * (tentativas + 1)), \
                morto = (tentativas + 1) >= $3 \
             WHERE id = $1",
        )
        .bind(id)
        .bind(erro)
        .bind(MAX_TENTATIVAS)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(())
    }
}
