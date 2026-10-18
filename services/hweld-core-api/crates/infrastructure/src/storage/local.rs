//! Storage em disco — fallback de desenvolvimento quando `MINIO_*`
//! não está configurado. Mesma semântica do adapter remoto.

use std::path::PathBuf;

use async_trait::async_trait;
use hweld_application::ports::armazenamento::ArmazenamentoObjetos;
use hweld_application::ErroApp;

pub struct ArmazenamentoLocal {
    dir: PathBuf,
}

impl ArmazenamentoLocal {
    /// `dir` relativo ao cwd do processo (`uploads/` por padrão).
    pub fn novo(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn caminho(&self, chave: &str) -> Result<PathBuf, ErroApp> {
        // Chave é o nome do arquivo gerado por nós (uuid.ext) — mas a
        // defesa contra traversal fica no adapter (nunca confiar).
        let segura = !chave.is_empty()
            && chave.len() <= 80
            && !chave.contains("..")
            && !chave.contains('/')
            && !chave.contains('\\')
            && chave
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');
        if !segura {
            return Err(ErroApp::nao_encontrado("midia", chave));
        }
        Ok(self.dir.join(chave))
    }
}

#[async_trait]
impl ArmazenamentoObjetos for ArmazenamentoLocal {
    async fn salvar(&self, chave: &str, bytes: &[u8], _mime: &str) -> Result<(), ErroApp> {
        let caminho = self.caminho(chave)?;
        tokio::fs::create_dir_all(&self.dir)
            .await
            .map_err(|e| ErroApp::interno("storage_dir", e))?;
        tokio::fs::write(&caminho, bytes)
            .await
            .map_err(|e| ErroApp::interno("storage_write", e))
    }

    async fn ler(&self, chave: &str) -> Result<Vec<u8>, ErroApp> {
        let caminho = self.caminho(chave)?;
        tokio::fs::read(&caminho)
            .await
            .map_err(|_| ErroApp::nao_encontrado("midia", chave))
    }

    async fn remover(&self, chave: &str) -> Result<(), ErroApp> {
        let caminho = self.caminho(chave)?;
        match tokio::fs::remove_file(&caminho).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => {
                tracing::warn!(chave, erro = %e, "falha ao descartar arquivo de mídia");
                Ok(())
            }
        }
    }
}
