//! Telemetria OpenTelemetry → New Relic.
//!
//! New Relic ingere OTLP nativamente — não existe agente Rust oficial, então
//! o caminho é: spans `tracing` (os `tracing-actix-web` já emitem um por
//! request) → `tracing-opentelemetry` → OTLP/HTTP → `otlp.nr-data.net`.
//! A chave vai no header `api-key` (formato NR, não `Authorization`).
//!
//! Ativado somente quando `NEW_RELIC_LICENSE_KEY` está presente — sem a chave
//! o processo fica em logs locais (zero overhead, zero dependência de rede).

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use opentelemetry::metrics::Counter;
use opentelemetry::{global, KeyValue};
use opentelemetry_otlp::{MetricExporter, SpanExporter, WithExportConfig, WithHttpConfig};
use opentelemetry_sdk::metrics::{PeriodicReader, SdkMeterProvider};
use opentelemetry_sdk::trace::SdkTracerProvider;
use opentelemetry_sdk::Resource;

use crate::config::ConfigObservabilidade;

/// Intervalo de exportação de métricas para o NR.
const INTERVALO_METRICAS: Duration = Duration::from_secs(15);

/// Guarda os providers — enquanto viver, telemetria flui; no drop, faz
/// flush/shutdown ordenado (último lote não se perde).
pub struct Observabilidade {
    pub tracer_provider: SdkTracerProvider,
    meter_provider: SdkMeterProvider,
}

impl Drop for Observabilidade {
    fn drop(&mut self) {
        if let Err(e) = self.tracer_provider.shutdown() {
            eprintln!("falha no shutdown do tracer provider: {e}");
        }
        if let Err(e) = self.meter_provider.shutdown() {
            eprintln!("falha no shutdown do meter provider: {e}");
        }
    }
}

/// Contadores expostos ao resto da infra — `None` quando telemetria está
/// desligada, então o custo fora do NR é um `if let`.
static METRICAS: OnceLock<Metricas> = OnceLock::new();

pub struct Metricas {
    cache_get: Counter<u64>,
    cache_set: Counter<u64>,
    cache_invalidate: Counter<u64>,
}

impl Metricas {
    /// Resultado: `hit` | `miss` — dimensão para o hit rate no dashboard.
    pub fn cache_get(&self, entidade: &'static str, hit: bool) {
        self.cache_get.add(
            1,
            &[
                KeyValue::new("entidade", entidade),
                KeyValue::new("resultado", if hit { "hit" } else { "miss" }),
            ],
        );
    }

    pub fn cache_set(&self, entidade: &'static str) {
        self.cache_set
            .add(1, &[KeyValue::new("entidade", entidade)]);
    }

    /// Invalidação global — sem entidade (afeta todas).
    pub fn cache_invalidate(&self) {
        self.cache_invalidate.add(1, &[]);
    }
}

pub fn metricas() -> Option<&'static Metricas> {
    METRICAS.get()
}

/// Monta providers OTLP/HTTP apontando para o ingest do New Relic.
/// `None` quando não há license key — modo degradado intencional.
pub fn iniciar(cfg: &ConfigObservabilidade, ambiente: &str) -> Option<Observabilidade> {
    let license_key = cfg.license_key.as_deref()?;

    let headers = HashMap::from([("api-key".to_string(), license_key.to_string())]);
    let endpoint = cfg.endpoint.trim_end_matches('/');

    let resultado = (|| -> anyhow::Result<Observabilidade> {
        let resource = Resource::builder()
            .with_service_name(cfg.service_name.clone())
            .with_attribute(KeyValue::new(
                "deployment.environment.name",
                ambiente.to_string(),
            ))
            .build();

        // Client blocking: os exporters rodam em threads próprias do SDK
        // (batch processor + periodic reader), fora do reactor Tokio.
        let http_client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;

        let span_exporter = SpanExporter::builder()
            .with_http()
            .with_http_client(http_client.clone())
            .with_endpoint(format!("{endpoint}/v1/traces"))
            .with_headers(headers.clone())
            .build()?;
        let tracer_provider = SdkTracerProvider::builder()
            .with_resource(resource.clone())
            .with_batch_exporter(span_exporter)
            .build();

        let metric_exporter = MetricExporter::builder()
            .with_http()
            .with_http_client(http_client)
            .with_endpoint(format!("{endpoint}/v1/metrics"))
            .with_headers(headers)
            .build()?;
        let meter_provider = SdkMeterProvider::builder()
            .with_resource(resource)
            .with_reader(
                PeriodicReader::builder(metric_exporter)
                    .with_interval(INTERVALO_METRICAS)
                    .build(),
            )
            .build();

        Ok(Observabilidade {
            tracer_provider,
            meter_provider,
        })
    })();

    match resultado {
        Ok(obs) => {
            global::set_tracer_provider(obs.tracer_provider.clone());
            global::set_meter_provider(obs.meter_provider.clone());

            let meter = global::meter("hweld-api");
            let metricas = Metricas {
                cache_get: meter.u64_counter("hweld.cache.get").build(),
                cache_set: meter.u64_counter("hweld.cache.set").build(),
                cache_invalidate: meter.u64_counter("hweld.cache.invalidate").build(),
            };
            let _ = METRICAS.set(metricas);
            Some(obs)
        }
        // Ainda não existe subscriber neste ponto do boot — `eprintln` é o
        // canal correto aqui (mesmo padrão do fatal de `main`). Telemetria
        // falha → seguimos sem ela; nunca deve derrubar o serviço.
        Err(e) => {
            eprintln!("aviso: falha ao configurar telemetria New Relic — desligada: {e:#}");
            None
        }
    }
}
