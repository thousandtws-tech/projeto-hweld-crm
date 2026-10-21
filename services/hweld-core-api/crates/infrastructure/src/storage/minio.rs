//! Adapter MinIO/S3 — path-style `PUT/GET/DELETE /{bucket}/{key}`
//! assinado com AWS Signature Version 4 sobre `reqwest` (zero dep
//! nova: HMAC-SHA256 manual em cima do `sha2` já do workspace).
//!
//! Somente operações server-side — presigned URLs não são emitidas;
//! a API serve os bytes (URLs públicas estáveis `/api/v1/midia/…`).

use async_trait::async_trait;
use chrono::Utc;
use hweld_application::ports::armazenamento::ArmazenamentoObjetos;
use hweld_application::ErroApp;
use sha2::{Digest, Sha256};

use crate::config::ErroConfig;

/// Config do bucket — montada a partir de `ConfigArmazenamento`.
#[derive(Debug, Clone)]
pub struct ConfigMinio {
    /// Endpoint base sem path — ex.: `https://bucket-production-….up.railway.app`.
    pub endpoint: String,
    pub bucket: String,
    /// MinIO ignora a região — `us-east-1` satisfaz a assinatura.
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
}

pub struct ArmazenamentoMinio {
    client: reqwest::Client,
    cfg: ConfigMinio,
    host: String,
}

const ALGORITMO: &str = "AWS4-HMAC-SHA256";
const SIGNED_HEADERS: &str = "host;x-amz-content-sha256;x-amz-date";

/// Erro de texto simples — `ErroApp::interno` exige `Error` real.
#[derive(Debug)]
struct ErroTexto(String);

impl std::fmt::Display for ErroTexto {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ErroTexto {}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> Vec<u8> {
    const BLOCO: usize = 64;
    let mut k = [0u8; BLOCO];
    if key.len() > BLOCO {
        let h = Sha256::digest(key);
        k[..32].copy_from_slice(&h);
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut pad_i = [0x36u8; BLOCO];
    let mut pad_o = [0x5cu8; BLOCO];
    for i in 0..BLOCO {
        pad_i[i] ^= k[i];
        pad_o[i] ^= k[i];
    }
    let interno = Sha256::digest([pad_i.as_slice(), msg].concat());
    Sha256::digest([pad_o.as_slice(), interno.as_slice()].concat()).to_vec()
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

impl ArmazenamentoMinio {
    pub fn novo(cfg: ConfigMinio) -> Result<Self, ErroConfig> {
        let host = cfg
            .endpoint
            .trim_end_matches('/')
            .rsplit("//")
            .next()
            .unwrap_or_default()
            .split('/')
            .next()
            .unwrap_or_default()
            .to_string();
        if host.is_empty() {
            return Err(ErroConfig("MINIO_ENDPOINT inválido".into()));
        }
        Ok(Self {
            client: reqwest::Client::new(),
            cfg,
            host,
        })
    }

    /// Chaves seguras para path-style — o adapter valida (nunca confiar).
    fn chave_valida(chave: &str) -> bool {
        !chave.is_empty()
            && chave.len() <= 200
            && !chave.contains("..")
            && !chave.starts_with('/')
            && chave
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '/'))
    }

    /// Assinatura SigV4 → (Authorization, x-amz-date, x-amz-content-sha256).
    fn assinar(&self, metodo: &str, chave: &str, payload: &[u8]) -> (String, String, String) {
        let agora = Utc::now();
        let amzdate = agora.format("%Y%m%dT%H%M%SZ").to_string();
        let datestamp = agora.format("%Y%m%d").to_string();
        let payload_hash = sha256_hex(payload);

        let uri = format!("/{}/{}", self.cfg.bucket, chave);
        let canonico = format!(
            "{metodo}\n{uri}\n\nhost:{}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amzdate}\n\n{SIGNED_HEADERS}\n{payload_hash}",
            self.host
        );
        let escopo = format!("{datestamp}/{}/s3/aws4_request", self.cfg.region);
        let to_sign = format!(
            "{ALGORITMO}\n{amzdate}\n{escopo}\n{}",
            sha256_hex(canonico.as_bytes())
        );

        let k_data = hmac_sha256(
            format!("AWS4{}", self.cfg.secret_key).as_bytes(),
            datestamp.as_bytes(),
        );
        let k_regiao = hmac_sha256(&k_data, self.cfg.region.as_bytes());
        let k_servico = hmac_sha256(&k_regiao, b"s3");
        let k_signing = hmac_sha256(&k_servico, b"aws4_request");
        let assinatura = hex::encode(hmac_sha256(&k_signing, to_sign.as_bytes()));

        let auth = format!(
            "{ALGORITMO} Credential={}/{escopo}, SignedHeaders={SIGNED_HEADERS}, Signature={assinatura}",
            self.cfg.access_key
        );
        (auth, amzdate, payload_hash)
    }

    fn url(&self, chave: &str) -> String {
        format!(
            "{}/{}/{}",
            self.cfg.endpoint.trim_end_matches('/'),
            self.cfg.bucket,
            chave
        )
    }

    /// `PUT /{bucket}` — cria o bucket se ausente. Idempotente:
    /// 200 = criado, 409/400 `BucketAlreadyOwnedByYou` = já existe.
    /// Best-effort no boot — falha só loga (o bucket pode já existir).
    pub async fn garantir_bucket(&self) -> Result<(), ErroApp> {
        let uri = format!("/{}", self.cfg.bucket);
        let url = format!("{}{}", self.cfg.endpoint.trim_end_matches('/'), uri);
        let payload_hash = sha256_hex(b"");
        let agora = Utc::now();
        let amzdate = agora.format("%Y%m%dT%H%M%SZ").to_string();
        let datestamp = agora.format("%Y%m%d").to_string();
        let canonico = format!(
            "PUT\n{uri}\n\nhost:{}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amzdate}\n\n{SIGNED_HEADERS}\n{payload_hash}",
            self.host
        );
        let escopo = format!("{datestamp}/{}/s3/aws4_request", self.cfg.region);
        let to_sign = format!(
            "{ALGORITMO}\n{amzdate}\n{escopo}\n{}",
            sha256_hex(canonico.as_bytes())
        );
        let k_data = hmac_sha256(
            format!("AWS4{}", self.cfg.secret_key).as_bytes(),
            datestamp.as_bytes(),
        );
        let k_regiao = hmac_sha256(&k_data, self.cfg.region.as_bytes());
        let k_servico = hmac_sha256(&k_regiao, b"s3");
        let k_signing = hmac_sha256(&k_servico, b"aws4_request");
        let assinatura = hex::encode(hmac_sha256(&k_signing, to_sign.as_bytes()));
        let auth = format!(
            "{ALGORITMO} Credential={}/{escopo}, SignedHeaders={SIGNED_HEADERS}, Signature={assinatura}",
            self.cfg.access_key
        );
        let resp = self
            .client
            .put(&url)
            .header("Authorization", auth)
            .header("x-amz-date", amzdate)
            .header("x-amz-content-sha256", payload_hash)
            .send()
            .await
            .map_err(|e| ErroApp::interno("storage_mkbucket", e))?;
        if resp.status().is_success() {
            tracing::info!(bucket = %self.cfg.bucket, "bucket de mídia criado");
            return Ok(());
        }
        let status = resp.status();
        let corpo = resp.text().await.unwrap_or_default();
        if corpo.contains("BucketAlreadyOwnedByYou") || corpo.contains("BucketAlreadyExists") {
            return Ok(());
        }
        Err(ErroApp::interno(
            "storage_mkbucket",
            ErroTexto(format!(
                "MinIO {status}: {}",
                &corpo[..corpo.len().min(300)]
            )),
        ))
    }
}

#[async_trait]
impl ArmazenamentoObjetos for ArmazenamentoMinio {
    async fn salvar(&self, chave: &str, bytes: &[u8], mime: &str) -> Result<(), ErroApp> {
        if !Self::chave_valida(chave) {
            return Err(ErroApp::interno(
                "storage_chave",
                ErroTexto("chave de objeto inválida".into()),
            ));
        }
        let (auth, amzdate, hash) = self.assinar("PUT", chave, bytes);
        let resp = self
            .client
            .put(self.url(chave))
            .header("Authorization", auth)
            .header("x-amz-date", amzdate)
            .header("x-amz-content-sha256", hash)
            .header("Content-Type", mime)
            .body(bytes.to_vec())
            .send()
            .await
            .map_err(|e| ErroApp::interno("storage_put", e))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let corpo = resp.text().await.unwrap_or_default();
            return Err(ErroApp::interno(
                "storage_put",
                ErroTexto(format!(
                    "MinIO {status}: {}",
                    &corpo[..corpo.len().min(300)]
                )),
            ));
        }
        Ok(())
    }

    async fn ler(&self, chave: &str) -> Result<Vec<u8>, ErroApp> {
        if !Self::chave_valida(chave) {
            return Err(ErroApp::nao_encontrado("midia", chave));
        }
        let (auth, amzdate, hash) = self.assinar("GET", chave, b"");
        let resp = self
            .client
            .get(self.url(chave))
            .header("Authorization", auth)
            .header("x-amz-date", amzdate)
            .header("x-amz-content-sha256", hash)
            .send()
            .await
            .map_err(|e| ErroApp::interno("storage_get", e))?;
        if resp.status().as_u16() == 404 {
            return Err(ErroApp::nao_encontrado("midia", chave));
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let corpo = resp.text().await.unwrap_or_default();
            return Err(ErroApp::interno(
                "storage_get",
                ErroTexto(format!(
                    "MinIO {status}: {}",
                    &corpo[..corpo.len().min(300)]
                )),
            ));
        }
        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| ErroApp::interno("storage_get_body", e))
    }

    async fn remover(&self, chave: &str) -> Result<(), ErroApp> {
        if !Self::chave_valida(chave) {
            return Ok(());
        }
        let (auth, amzdate, hash) = self.assinar("DELETE", chave, b"");
        let resp = self
            .client
            .delete(self.url(chave))
            .header("Authorization", auth)
            .header("x-amz-date", amzdate)
            .header("x-amz-content-sha256", hash)
            .send()
            .await
            .map_err(|e| ErroApp::interno("storage_delete", e))?;
        // 404 = já removido — remover é idempotente.
        if !resp.status().is_success() && resp.status().as_u16() != 404 {
            let status = resp.status();
            let corpo = resp.text().await.unwrap_or_default();
            tracing::warn!(chave, erro = %corpo, "falha ao remover objeto no storage");
            return Err(ErroApp::interno(
                "storage_delete",
                ErroTexto(format!("MinIO {status}")),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn hmac_sha256_vetor_conhecido() {
        // RFC 4231 test case 1: key = 0x0b*20, msg = "Hi There"
        let r = hmac_sha256(&[0x0b; 20], b"Hi There");
        assert_eq!(
            hex::encode(r),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }

    #[test]
    fn assinatura_deterministica_e_formatada() {
        let cfg = ConfigMinio {
            endpoint: "https://minio.example".into(),
            bucket: "hweld".into(),
            region: "us-east-1".into(),
            access_key: "ak".into(),
            secret_key: "sk".into(),
        };
        let s = ArmazenamentoMinio::novo(cfg).unwrap();
        let (auth, amzdate, hash) = s.assinar("PUT", "midia/abc.png", b"png-bytes");
        assert!(auth.starts_with("AWS4-HMAC-SHA256 Credential=ak/"));
        assert!(auth.contains("/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature="));
        assert_eq!(amzdate.len(), 16);
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn chave_rejeita_traversal() {
        assert!(!ArmazenamentoMinio::chave_valida("../x"));
        assert!(!ArmazenamentoMinio::chave_valida("/abs"));
        assert!(ArmazenamentoMinio::chave_valida("midia/a-b_c.png"));
    }

    /// IT real contra MinIO — só roda com credenciais no ambiente:
    /// `cargo test -p hweld-infrastructure minio_it -- --ignored`
    /// envs: MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
    #[tokio::test]
    #[ignore = "precisa de MinIO real + credenciais"]
    async fn minio_it_ciclo_completo() {
        let cfg = ConfigMinio {
            endpoint: std::env::var("MINIO_ENDPOINT").unwrap(),
            bucket: std::env::var("MINIO_BUCKET").unwrap_or_else(|_| "hweld".into()),
            region: std::env::var("MINIO_REGION").unwrap_or_else(|_| "us-east-1".into()),
            access_key: std::env::var("MINIO_ACCESS_KEY").unwrap(),
            secret_key: std::env::var("MINIO_SECRET_KEY").unwrap(),
        };
        let s = ArmazenamentoMinio::novo(cfg).unwrap();

        s.garantir_bucket().await.unwrap();

        let chave = "midia/it-teste.txt";
        let corpo = b"hello-minio";
        s.salvar(chave, corpo, "text/plain").await.unwrap();
        let lido = s.ler(chave).await.unwrap();
        assert_eq!(lido, corpo);
        s.remover(chave).await.unwrap();
        assert!(s.ler(chave).await.is_err());
    }

    /// Migração one-shot do disco local para o bucket: cada arquivo de
    /// `uploads/` vira `midia/{nome}`; `cms_loja.json` vira `cms/loja.json`.
    /// `cargo test -p hweld-infrastructure migra_uploads -- --ignored`
    /// envs: MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
    /// opcional: UPLOADS_DIR (default `../../uploads` relativo ao crate).
    #[tokio::test]
    #[ignore = "migração manual — precisa de MinIO real + diretório uploads/"]
    async fn migra_uploads_locais_para_o_bucket() {
        let cfg = ConfigMinio {
            endpoint: std::env::var("MINIO_ENDPOINT").unwrap(),
            bucket: std::env::var("MINIO_BUCKET").unwrap_or_else(|_| "hweld-uploads".into()),
            region: std::env::var("MINIO_REGION").unwrap_or_else(|_| "us-east-1".into()),
            access_key: std::env::var("MINIO_ACCESS_KEY").unwrap(),
            secret_key: std::env::var("MINIO_SECRET_KEY").unwrap(),
        };
        let s = ArmazenamentoMinio::novo(cfg).unwrap();
        s.garantir_bucket().await.unwrap();

        let dir = std::env::var("UPLOADS_DIR")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| {
                std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../uploads")
            });
        let mut migrados = 0usize;
        for entrada in std::fs::read_dir(&dir).unwrap() {
            let path = entrada.unwrap().path();
            if !path.is_file() {
                continue;
            }
            let nome = path.file_name().unwrap().to_string_lossy().to_string();
            let (chave, mime) = if nome == "cms_loja.json" {
                ("cms/loja.json".to_string(), "application/json")
            } else {
                (format!("midia/{nome}"), mime_por_extensao(&nome))
            };
            let bytes = std::fs::read(&path).unwrap();
            s.salvar(&chave, &bytes, mime).await.unwrap();
            migrados += 1;
        }
        eprintln!("migrados {migrados} arquivos de {}", dir.display());
        assert!(migrados > 0);
    }

    fn mime_por_extensao(nome: &str) -> &'static str {
        match nome.rsplit('.').next().unwrap_or_default() {
            "webp" => "image/webp",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "svg" => "image/svg+xml",
            "json" => "application/json",
            _ => "application/octet-stream",
        }
    }
}
