//! Port de object storage — blobs endereçados por chave (ex.:
//! `midia/{uuid}.png`, `fiscal/{doc}.xml`). A aplicação não conhece
//! o backend: MinIO/S3 em produção, disco local em dev.
//!
//! URLs públicas continuam estáveis (`/api/v1/midia/{arquivo}`) — o
//! storage decide de onde servir os bytes.

use async_trait::async_trait;

use crate::ErroApp;

/// Operações mínimas de object storage — put/get/delete por chave.
#[async_trait]
pub trait ArmazenamentoObjetos: Send + Sync {
    /// Persiste `bytes` em `chave` com o MIME dado (metadata S3 `Content-Type`).
    async fn salvar(&self, chave: &str, bytes: &[u8], mime: &str) -> Result<(), ErroApp>;

    /// Lê o objeto inteiro. `nao_encontrado` quando a chave não existe.
    async fn ler(&self, chave: &str) -> Result<Vec<u8>, ErroApp>;

    /// Remove o objeto — ausência da chave não é erro (idempotente).
    async fn remover(&self, chave: &str) -> Result<(), ErroApp>;
}
