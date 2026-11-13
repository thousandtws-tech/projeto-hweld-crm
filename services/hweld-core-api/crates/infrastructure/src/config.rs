//! Configuração centralizada — todo valor de ambiente entra por aqui,
//! nunca `std::env` espalhado pelo código (regra §19).

/// Segredo JWT validado no boot — fail-fast com mensagem clara.
#[derive(Debug, Clone)]
pub struct ConfigJwt {
    pub secret: String,
    pub access_ttl_seconds: i64,
    pub refresh_ttl_seconds: i64,
}

#[derive(Debug, Clone)]
pub struct ConfigAdmin {
    pub nome: String,
    pub email: String,
    pub senha: String,
}

/// Motor de busca — `url` ausente desativa a feature (modo degradado:
/// endpoints de busca respondem 503, o resto funciona normal).
#[derive(Debug, Clone)]
pub struct ConfigBusca {
    pub url: Option<String>,
    pub indice_produtos: String,
    pub usuario: Option<String>,
    pub senha: Option<String>,
    /// Cria o índice com settings/mappings no boot quando não existir.
    pub ensure_index: bool,
}

/// Motor realtime dedicado (Elixir/Phoenix em `server/motor-realtime`).
/// `token` ausente = motor desligado — eventos são descartados com log.
#[derive(Debug, Clone)]
pub struct ConfigMotor {
    pub url: String,
    pub token: Option<String>,
    pub timeout_ms: u64,
}

/// Telemetria OpenTelemetry → New Relic (ingest OTLP nativo).
/// `license_key` ausente = telemetria desligada — só logs locais.
#[derive(Debug, Clone)]
pub struct ConfigObservabilidade {
    pub license_key: Option<String>,
    pub endpoint: String,
    pub service_name: String,
}

/// Canal service-to-service do `hweld-operations-api` (Java) — auth por
/// segredo compartilhado no header `X-Service-Token`. Ausente = endpoint
/// interno responde 503 (integração desligada, resto do app segue normal).
/// Em desenvolvimento assume o mesmo default do serviço Java.
#[derive(Debug, Clone)]
pub struct ConfigIntegracao {
    pub service_token: Option<String>,
}

/// Object storage S3-compatível (MinIO). `endpoint` ausente = fallback
/// em disco local (`uploads/`) — dev sem infra, mesmo contrato.
#[derive(Debug, Clone)]
pub struct ConfigArmazenamento {
    pub endpoint: String,
    pub bucket: String,
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub ambiente: String,
    pub run_migrations: bool,
    pub seed_admin: bool,
    /// Swagger UI + openapi.json — default off em production
    /// (enumeração de rotas/DTOs não é recurso de API pública).
    pub docs_habilitados: bool,
    pub cors_permissive: bool,
    pub cors_origins: Vec<String>,
    pub database_url: String,
    pub db_max_connections: u32,
    pub jwt: ConfigJwt,
    pub admin: ConfigAdmin,
    pub busca: ConfigBusca,
    pub motor: ConfigMotor,
    pub observabilidade: ConfigObservabilidade,
    pub integracao: ConfigIntegracao,
    /// `None` = storage local em disco; `Some` = MinIO/S3 remoto.
    pub armazenamento: Option<ConfigArmazenamento>,
    /// Segredo de borda (`x-edge-token` injetado pelo Worker Cloudflare).
    /// `Some` = origem exige o header e rejeita tráfego direto; `None`
    /// desliga a guarda (dev local).
    pub edge_token: Option<String>,
}

#[derive(Debug, thiserror::Error)]
#[error("configuração inválida: {0}")]
pub struct ErroConfig(pub String);

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn env_parse<T: std::str::FromStr>(key: &str, padrao: T) -> Result<T, ErroConfig>
where
    T::Err: std::fmt::Display,
{
    match env(key) {
        Some(v) => v
            .parse()
            .map_err(|e: T::Err| ErroConfig(format!("{key}: {e}"))),
        None => Ok(padrao),
    }
}

impl Config {
    /// Carrega do ambiente — falha rápido com erro claro quando falta algo.
    pub fn from_env() -> Result<Self, ErroConfig> {
        let jwt_secret =
            env("JWT_SECRET").ok_or_else(|| ErroConfig("JWT_SECRET ausente".into()))?;
        if jwt_secret.len() < 32 {
            return Err(ErroConfig("JWT_SECRET deve ter ao menos 32 bytes".into()));
        }
        let ambiente = env("ENVIRONMENT").unwrap_or_else(|| "development".into());

        Ok(Self {
            host: env("HOST").unwrap_or_else(|| "0.0.0.0".into()),
            port: env_parse("PORT", 8080u16)?,
            ambiente: ambiente.clone(),
            run_migrations: env_parse("RUN_MIGRATIONS", true)?,
            seed_admin: env_parse("SEED_ADMIN", true)?,
            docs_habilitados: env_parse("API_DOCS_ENABLED", ambiente != "production")?,
            cors_permissive: env_parse("CORS_PERMISSIVE", false)?,
            cors_origins: env("CORS_ORIGINS")
                .map(|v| {
                    v.split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect()
                })
                .unwrap_or_default(),
            database_url: env("DATABASE_URL")
                .ok_or_else(|| ErroConfig("DATABASE_URL ausente".into()))?,
            db_max_connections: env_parse("DB_MAX_CONNECTIONS", 20u32)?,
            jwt: ConfigJwt {
                secret: jwt_secret,
                access_ttl_seconds: env_parse("JWT_ACCESS_TTL_SECONDS", 900i64)?,
                refresh_ttl_seconds: env_parse("JWT_REFRESH_TTL_SECONDS", 1_209_600i64)?,
            },
            admin: ConfigAdmin {
                nome: env("ADMIN_NOME").unwrap_or_else(|| "Administrador".into()),
                email: env("ADMIN_EMAIL").unwrap_or_else(|| "admin@hweld.local".into()),
                senha: env("ADMIN_SENHA").unwrap_or_else(|| "admin".into()),
            },
            busca: ConfigBusca {
                url: env("ELASTICSEARCH_URL"),
                indice_produtos: env("ELASTICSEARCH_INDEX_PRODUTOS")
                    .unwrap_or_else(|| "hweld_produtos".into()),
                usuario: env("ELASTICSEARCH_USERNAME"),
                senha: env("ELASTICSEARCH_PASSWORD"),
                ensure_index: env_parse("ES_ENSURE_INDEX", true)?,
            },
            motor: ConfigMotor {
                url: env("MOTOR_URL").unwrap_or_else(|| "http://localhost:4100".into()),
                token: env("MOTOR_INGEST_TOKEN"),
                timeout_ms: env_parse("MOTOR_TIMEOUT_MS", 500u64)?,
            },
            observabilidade: ConfigObservabilidade {
                license_key: env("NEW_RELIC_LICENSE_KEY"),
                // Endpoint OTLP/HTTP do New Relic — US por padrão; para conta EU
                // usar OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.eu01.nr-data.net
                endpoint: env("OTEL_EXPORTER_OTLP_ENDPOINT")
                    .unwrap_or_else(|| "https://otlp.nr-data.net".into()),
                service_name: env("OTEL_SERVICE_NAME").unwrap_or_else(|| "hweld-api".into()),
            },
            integracao: ConfigIntegracao {
                service_token: env("INTERNAL_SERVICE_TOKEN").or_else(|| {
                    // Default de desenvolvimento igual ao do serviço Java —
                    // em produção a ausência deixa o endpoint desligado (503).
                    (env("ENVIRONMENT").as_deref() != Some("production"))
                        .then(|| "dev-internal-token".to_string())
                }),
            },
            edge_token: env("EDGE_TOKEN"),
            armazenamento: env("MINIO_ENDPOINT").map(|endpoint| ConfigArmazenamento {
                endpoint,
                bucket: env("MINIO_BUCKET").unwrap_or_else(|| "hweld".into()),
                region: env("MINIO_REGION").unwrap_or_else(|| "us-east-1".into()),
                access_key: env("MINIO_ACCESS_KEY").unwrap_or_default(),
                secret_key: env("MINIO_SECRET_KEY").unwrap_or_default(),
            }),
        })
    }

    pub fn eh_producao(&self) -> bool {
        self.ambiente == "production"
    }
}
