use std::process::ExitCode;
use std::sync::Arc;

use actix_cors::Cors;
use actix_web::middleware::{Compress, DefaultHeaders};
use actix_web::{web, App, HttpServer};
use hweld_api::rotas;
use hweld_api::AppState;
use hweld_application::use_cases::auditoria::ServicoAuditoria;
use hweld_application::use_cases::auth::ServicoAuth;
use hweld_application::use_cases::busca::ServicoBusca;
use hweld_application::use_cases::carrinho::ServicoCarrinho;
use hweld_application::use_cases::catalogo::{
    ServicoCatalogoPortal, ServicoCategorias, ServicoProdutos, ServicoTabelasPreco,
};
use hweld_application::use_cases::checkout::ServicoCheckout;
use hweld_application::use_cases::crm::{
    ServicoContatos, ServicoEmpresas, ServicoEnderecos, ServicoInteracoes, ServicoOportunidades,
};
use hweld_application::use_cases::estoque::ServicoEstoque;
use hweld_application::use_cases::financeiro::{ServicoCaixas, ServicoPagamentos};
use hweld_application::use_cases::fiscal::{ServicoConfigFiscal, ServicoNotasFiscais};
use hweld_application::use_cases::integracao::ServicoIntegracao;
use hweld_application::use_cases::notificacoes::ServicoNotificacoes;
use hweld_application::use_cases::orcamentos::ServicoOrcamentos;
use hweld_application::use_cases::ordens::ServicoOrdensServico;
use hweld_application::use_cases::pedidos::ServicoPedidos;
use hweld_application::use_cases::portal::ServicoPortal;
use hweld_application::use_cases::usuarios::ServicoUsuarios;
use hweld_domain::acesso::usuario::{NovoUsuario, Perfil};
use hweld_infrastructure::persistence::{
    RegistradorAuditoriaPg, RepositorioAuditoriaPg, RepositorioBuscaPendentesPg,
    RepositorioCaixasPg, RepositorioCarrinhosPg,
    RepositorioCategoriasPg, RepositorioConfigFiscalPg, RepositorioContatosPg,
    RepositorioEmpresasPg, RepositorioEnderecosPg, RepositorioEstoquePg,
    RepositorioEventosIntegracaoPg, RepositorioFormasPagamentoPg, RepositorioInteracoesPg,
    RepositorioNotasFiscaisPg, RepositorioNotificacoesPg, RepositorioOportunidadesPg,
    RepositorioOrcamentosPg, RepositorioOrdensServicoPg, RepositorioPagamentosPg,
    RepositorioPedidosPg, RepositorioProdutosPg, RepositorioTabelasPrecoPg, RepositorioUsuariosPg,
};
use hweld_infrastructure::{
    conectar, iniciar_observabilidade, BuscaElastic, Config, EmissorJwt, GatewayFiscalStub,
    HasherArgon2, HttpOps, HttpRealtime, Observabilidade, MIGRATOR,
};
use sqlx::PgPool;
use tracing_actix_web::TracingLogger;

#[actix_web::main]
async fn main() -> ExitCode {
    match executar().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("falha fatal no boot: {e:#}");
            ExitCode::FAILURE
        }
    }
}

async fn executar() -> anyhow::Result<()> {
    match dotenvy::dotenv() {
        Ok(path) => println!(".env carregado: {}", path.display()),
        Err(e) => println!("aviso: não foi possível carregar .env: {e}"),
    }
    let config = Config::from_env().map_err(|e| anyhow::anyhow!("{e}"))?;
    // Telemetria antes do subscriber: a camada OTel precisa do provider ativo.
    // `observabilidade` deve viver até o fim de `executar` — o Drop faz o
    // shutdown ordenado (flush do último batch) ao encerrar o processo.
    let observabilidade = iniciar_observabilidade(&config.observabilidade, &config.ambiente);
    init_tracing(observabilidade.as_ref());

    tracing::info!(
        host = %config.host,
        port = config.port,
        ambiente = %config.ambiente,
        telemetria = observabilidade.is_some(),
        "configuração carregada"
    );

    let pool = conectar(&config).await?;
    if config.run_migrations {
        tracing::info!("aplicando migrations");
        MIGRATOR.run(&pool).await?;
    }
    if config.seed_admin {
        seed_admin(&pool, &config).await?;
    }

    let motor_busca = montar_busca(&config).await;
    let estado = montar_estado(&pool, &config, motor_busca);
    // Relay da outbox de busca — retenta indexações/remoções falhas com
    // backoff (30s por ciclo); só existe quando o motor está configurado.
    if let Some(busca) = estado.busca.clone() {
        tokio::spawn(async move {
            let mut intervalo = tokio::time::interval(std::time::Duration::from_secs(30));
            loop {
                intervalo.tick().await;
                if let Err(e) = busca.reprocessar_pendentes(50).await {
                    tracing::warn!(erro = %e, "relay busca: ciclo falhou");
                }
            }
        });
    }
    let dados = web::Data::new(estado);
    let dados_pool = web::Data::new(pool);
    let cors_origins = config.cors_origins.clone();
    let cors_permissive = config.cors_permissive;
    let docs_habilitados = config.docs_habilitados;
    let edge_token = config.edge_token.clone();
    if config.eh_producao() && edge_token.is_none() {
        tracing::error!(
            "EDGE_TOKEN ausente em produção — origem exposta a tráfego direto \
             (`*.up.railway.app`). Configurar o segredo compartilhado com o Worker."
        );
    }
    let bind = (config.host.clone(), config.port);

    tracing::info!(bind = ?bind, "servidor HTTP subindo");
    let servidor = HttpServer::new(move || {
        let cors = if cors_permissive {
            Cors::permissive()
        } else {
            let mut c = Cors::default()
                .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE"])
                .allowed_headers(vec![
                    actix_web::http::header::AUTHORIZATION,
                    actix_web::http::header::CONTENT_TYPE,
                    actix_web::http::header::HeaderName::from_static("x-session-id"),
                ])
                .max_age(3600);
            for origem in &cors_origins {
                c = c.allowed_origin(origem);
            }
            c
        };
        App::new()
            .app_data(dados.clone())
            .app_data(dados_pool.clone())
            .app_data(web::PayloadConfig::new(10 * 1024 * 1024))
            .wrap(cors)
            // Headers de segurança (OWASP Secure Headers) — CSP liberal o
            // suficiente para o Swagger UI self-hosted continuar operando.
            .wrap(
                DefaultHeaders::new()
                    .add(("X-Content-Type-Options", "nosniff"))
                    .add(("X-Frame-Options", "DENY"))
                    .add(("Referrer-Policy", "strict-origin-when-cross-origin"))
                    .add((
                        "Permissions-Policy",
                        "camera=(), microphone=(), geolocation=()",
                    ))
                    .add((
                        "Content-Security-Policy",
                        "default-src 'self'; script-src 'self' 'unsafe-inline'; \
                         style-src 'self' 'unsafe-inline'; img-src 'self' data:; \
                         frame-ancestors 'none'",
                    )),
            )
            // Logger estruturado (tracing) — o Logger::default() foi removido:
            // ambos geravam uma linha por request (log duplicado, ~2 escritas
            // de IO no caminho quente). Compress reduz o payload das listas.
            // CacheHttp registrado ANTES do Compress = interno a ele: o ETag é
            // calculado sobre o corpo ainda não comprimido (estável por URL,
            // independente do Accept-Encoding do cliente).
            .wrap(hweld_api::cache_http::CacheHttp)
            .wrap(Compress::default())
            // EdgeGuard registrado após o Compress e antes do TracingLogger:
            // executa cedo (rejeita sem custo de compressão) mas ainda sob o
            // logger — requests negados ficam auditáveis no tracing.
            .wrap(hweld_api::edge_guard::EdgeGuard::new(edge_token.clone()))
            .wrap(TracingLogger::default())
            .configure(move |cfg| rotas::configurar(cfg, docs_habilitados))
    });
    // Keep-alive longo para reuse de conexão edge→origem (Railway proxy →
    // app): o default (~5s) derruba a conexão entre requests de uma mesma
    // navegação, pagando handshake TCP/TLS a cada chamada.
    let servidor = servidor
        .keep_alive(std::time::Duration::from_secs(75))
        .client_request_timeout(std::time::Duration::from_secs(15));
    let mut server = servidor.bind(bind)?;
    // Em host IPv4-only ("0.0.0.0"), "localhost" resolve ::1 primeiro e o
    // connect espera o timeout do fallback (~200ms no Windows). Escutar ::1
    // remove esse custo de todo cliente que usa o nome.
    if config.host == "0.0.0.0" {
        match std::net::TcpListener::bind(("::1", config.port)) {
            Ok(v6) => server = server.listen(v6)?,
            Err(e) => {
                tracing::warn!(
                    "IPv6 loopback indisponível ({e}) — clientes em 'localhost' pagam o fallback IPv6→IPv4"
                )
            }
        }
    }
    server.run().await?;
    Ok(())
}

fn init_tracing(observabilidade: Option<&Observabilidade>) {
    use opentelemetry::trace::TracerProvider;
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;
    use tracing_subscriber::{fmt, EnvFilter, Layer};

    let filtro = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,hweld=debug,sqlx=warn,actix_server=info"));

    // Camada OTLP opcional — `Option<L: Layer>` já implementa `Layer`, então
    // desligada custa zero.
    let otel_layer = observabilidade.map(|obs| {
        tracing_opentelemetry::layer()
            .with_tracer(obs.tracer_provider.tracer("hweld-api"))
            .boxed()
    });

    tracing_subscriber::registry()
        .with(filtro)
        .with(fmt::layer().with_target(true).compact())
        .with(otel_layer)
        .init();
}

async fn seed_admin(pool: &PgPool, config: &Config) -> anyhow::Result<()> {
    use hweld_application::ports::acesso::RepositorioUsuarios;
    use hweld_application::ports::seguranca::HasherSenha;

    let usuarios = RepositorioUsuariosPg::novo(pool.clone());
    if usuarios
        .buscar_por_email(&config.admin.email)
        .await?
        .is_some()
    {
        return Ok(());
    }
    let hasher = HasherArgon2::novo();
    let senha_hash = hasher.hash(&config.admin.senha).await?;
    let novo = NovoUsuario {
        nome: config.admin.nome.clone(),
        email: config.admin.email.clone(),
        senha_hash,
        perfil: Perfil::Admin,
    }
    .validar()?;
    let admin = usuarios.criar(novo).await?;
    tracing::warn!(
        email = %admin.email,
        "admin inicial semeado — troque a senha no primeiro acesso"
    );
    Ok(())
}

async fn montar_busca(
    config: &Config,
) -> Option<Arc<dyn hweld_application::ports::busca::MotorBusca>> {
    config.busca.url.as_ref()?;
    let client = match BuscaElastic::novo(&config.busca) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(erro = %e, "cliente Elasticsearch inválido — busca desligada");
            return None;
        }
    };
    if config.busca.ensure_index {
        if let Err(e) = client.garantir_indice().await {
            tracing::error!(
                erro = %e,
                indice = %config.busca.indice_produtos,
                "falha ao garantir índice ES — reindexe quando o cluster subir"
            );
        } else {
            tracing::info!(indice = %config.busca.indice_produtos, "índice Elasticsearch garantido");
        }
    }
    Some(Arc::new(client))
}

/// Composition root — única função que conhece todas as implementações.
fn montar_estado(
    pool: &PgPool,
    config: &Config,
    motor_busca: Option<Arc<dyn hweld_application::ports::busca::MotorBusca>>,
) -> AppState {
    // Adaptadores de infraestrutura.
    let usuarios_repo = Arc::new(RepositorioUsuariosPg::novo(pool.clone()));
    let empresas_repo = Arc::new(RepositorioEmpresasPg::novo(pool.clone()));
    let contatos_repo = Arc::new(RepositorioContatosPg::novo(pool.clone()));
    let enderecos_repo = Arc::new(RepositorioEnderecosPg::novo(pool.clone()));
    let oportunidades_repo = Arc::new(RepositorioOportunidadesPg::novo(pool.clone()));
    let interacoes_repo = Arc::new(RepositorioInteracoesPg::novo(pool.clone()));
    let orcamentos_repo = Arc::new(RepositorioOrcamentosPg::novo(pool.clone()));
    let categorias_repo = Arc::new(RepositorioCategoriasPg::novo(pool.clone()));
    let produtos_repo = Arc::new(RepositorioProdutosPg::novo(pool.clone()));
    let tabelas_repo = Arc::new(RepositorioTabelasPrecoPg::novo(pool.clone()));
    let carrinhos_repo = Arc::new(RepositorioCarrinhosPg::novo(pool.clone()));
    let pedidos_repo = Arc::new(RepositorioPedidosPg::novo(pool.clone()));
    let pagamentos_repo = Arc::new(RepositorioPagamentosPg::novo(pool.clone()));
    let formas_repo = Arc::new(RepositorioFormasPagamentoPg::novo(pool.clone()));
    let estoque_repo = Arc::new(RepositorioEstoquePg::novo(pool.clone()));
    let ordens_repo = Arc::new(RepositorioOrdensServicoPg::novo(pool.clone()));
    let notas_repo = Arc::new(RepositorioNotasFiscaisPg::novo(pool.clone()));
    let config_fiscal_repo = Arc::new(RepositorioConfigFiscalPg::novo(pool.clone()));
    let caixas_repo = Arc::new(RepositorioCaixasPg::novo(pool.clone()));
    let auditoria_repo = Arc::new(RepositorioAuditoriaPg::novo(pool.clone()));
    let notificacoes_repo = Arc::new(RepositorioNotificacoesPg::novo(pool.clone()));
    let eventos_integracao_repo = Arc::new(RepositorioEventosIntegracaoPg::novo(pool.clone()));
    let busca_pendentes_repo = Arc::new(RepositorioBuscaPendentesPg::novo(pool.clone()));

    let hasher = Arc::new(HasherArgon2::novo());
    // Mesma implementação serve os dois ports — é dona da tabela refresh_tokens.
    let emissor = Arc::new(EmissorJwt::novo(&config.jwt, pool.clone()));
    let tokens: Arc<dyn hweld_application::ports::seguranca::EmissorTokens> = emissor.clone();
    let sessoes: Arc<dyn hweld_application::ports::seguranca::RepositorioSessoes> = emissor;
    let gateway_fiscal = Arc::new(GatewayFiscalStub::novo());
    let audit = Arc::new(RegistradorAuditoriaPg::novo(pool.clone()));
    // Motor realtime dedicado (Phoenix) — publicação HTTP fire-and-forget.
    let realtime = Arc::new(HttpRealtime::novo(&config.motor));
    // Operations-api (Java) — publicação outbound fire-and-forget
    // (OrderCreated etc. → /api/v1/internal/events com X-Service-Token).
    let ops = Arc::new(HttpOps::novo(&config.integracao));
    let notificacoes = Arc::new(ServicoNotificacoes::novo(
        notificacoes_repo,
        usuarios_repo.clone(),
        contatos_repo.clone(),
        realtime.clone(),
    ));

    // Uma instância só — o endpoint interno reutiliza o mesmo use case
    // que os handlers de staff (transição de pedido idêntica).
    let pedidos_svc = Arc::new(ServicoPedidos::novo(
        pedidos_repo.clone(),
        produtos_repo.clone(),
        audit.clone(),
        realtime.clone(),
        notificacoes.clone(),
        ops.clone(),
    ));

    AppState {
        tokens: tokens.clone(),
        auth: ServicoAuth::novo(
            usuarios_repo.clone(),
            contatos_repo.clone(),
            hasher.clone(),
            tokens,
            sessoes,
        ),
        usuarios: ServicoUsuarios::novo(
            usuarios_repo,
            hasher.clone(),
            audit.clone(),
            realtime.clone(),
        ),
        empresas: ServicoEmpresas::novo(empresas_repo.clone(), audit.clone(), realtime.clone()),
        contatos: ServicoContatos::novo(
            contatos_repo.clone(),
            empresas_repo.clone(),
            hasher,
            audit.clone(),
        ),
        enderecos: ServicoEnderecos::novo(enderecos_repo.clone(), empresas_repo.clone()),
        oportunidades: ServicoOportunidades::novo(
            oportunidades_repo,
            audit.clone(),
            realtime.clone(),
            notificacoes.clone(),
        ),
        interacoes: ServicoInteracoes::novo(interacoes_repo),
        orcamentos: ServicoOrcamentos::novo(
            orcamentos_repo,
            enderecos_repo.clone(),
            produtos_repo.clone(),
            realtime.clone(),
            ops.clone(),
        ),
        categorias: ServicoCategorias::novo(categorias_repo.clone(), realtime.clone()),
        produtos: ServicoProdutos::novo(
            produtos_repo.clone(),
            categorias_repo.clone(),
            motor_busca.clone(),
            busca_pendentes_repo.clone(),
            realtime.clone(),
        ),
        tabelas_preco: ServicoTabelasPreco::novo(
            tabelas_repo.clone(),
            produtos_repo.clone(),
            realtime.clone(),
        ),
        catalogo_portal: ServicoCatalogoPortal::novo(
            produtos_repo.clone(),
            tabelas_repo.clone(),
            empresas_repo.clone(),
            estoque_repo.clone(),
        ),
        portal: ServicoPortal::novo(
            contatos_repo.clone(),
            empresas_repo.clone(),
            enderecos_repo.clone(),
            pedidos_repo.clone(),
            tabelas_repo.clone(),
            categorias_repo.clone(),
        ),
        carrinho: ServicoCarrinho::novo(
            carrinhos_repo.clone(),
            produtos_repo.clone(),
            tabelas_repo.clone(),
        ),
        checkout: ServicoCheckout::novo(
            carrinhos_repo,
            pedidos_repo.clone(),
            contatos_repo,
            enderecos_repo.clone(),
            produtos_repo.clone(),
            realtime.clone(),
            notificacoes.clone(),
            ops.clone(),
        ),
        pedidos: pedidos_svc.clone(),
        integracao: Arc::new(ServicoIntegracao::novo(
            eventos_integracao_repo,
            pedidos_svc,
            pedidos_repo.clone(),
            notas_repo.clone(),
            notificacoes.clone(),
            realtime.clone(),
        )),
        token_integracao: config.integracao.service_token.clone(),
        estoque: ServicoEstoque::novo(
            estoque_repo,
            produtos_repo.clone(),
            audit.clone(),
            realtime.clone(),
        ),
        ordens: ServicoOrdensServico::novo(ordens_repo, produtos_repo.clone(), realtime.clone()),
        notas_fiscais: ServicoNotasFiscais::novo(
            notas_repo,
            pedidos_repo.clone(),
            empresas_repo.clone(),
            enderecos_repo.clone(),
            produtos_repo.clone(),
            gateway_fiscal,
            audit.clone(),
            realtime.clone(),
        ),
        config_fiscal: ServicoConfigFiscal::novo(
            config_fiscal_repo,
            audit.clone(),
            realtime.clone(),
        ),
        pagamentos: ServicoPagamentos::novo(
            pagamentos_repo,
            pedidos_repo,
            formas_repo,
            audit.clone(),
            realtime.clone(),
        ),
        caixas: ServicoCaixas::novo(caixas_repo, audit.clone(), realtime.clone()),
        auditoria: ServicoAuditoria::novo(auditoria_repo),
        notificacoes,
        armazenamento: montar_armazenamento(config),
        busca: motor_busca.map(|motor| {
            Arc::new(ServicoBusca::novo(
                motor,
                produtos_repo.clone(),
                categorias_repo,
                tabelas_repo.clone(),
                empresas_repo.clone(),
                busca_pendentes_repo.clone(),
            ))
        }),
    }
}

/// Object storage — MinIO/S3 quando `MINIO_ENDPOINT` está configurado;
/// disco local (`uploads/`) como fallback de desenvolvimento.
fn montar_armazenamento(
    config: &Config,
) -> Arc<dyn hweld_application::ports::armazenamento::ArmazenamentoObjetos> {
    match &config.armazenamento {
        Some(cfg) => {
            tracing::info!(bucket = %cfg.bucket, endpoint = %cfg.endpoint, "armazenamento: MinIO/S3 remoto");
            let minio = Arc::new(
                hweld_infrastructure::storage::ArmazenamentoMinio::novo(
                    hweld_infrastructure::storage::minio::ConfigMinio {
                        endpoint: cfg.endpoint.clone(),
                        bucket: cfg.bucket.clone(),
                        region: cfg.region.clone(),
                        access_key: cfg.access_key.clone(),
                        secret_key: cfg.secret_key.clone(),
                    },
                )
                .expect("MINIO_ENDPOINT inválido"),
            );
            // Bootstrap: cria o bucket se ausente — falha só loga.
            let minio_boot = minio.clone();
            tokio::spawn(async move {
                if let Err(e) = minio_boot.garantir_bucket().await {
                    tracing::warn!(erro = %e, "storage: garantir bucket falhou (pode já existir)");
                }
            });
            minio
        }
        None => {
            tracing::info!("armazenamento: disco local uploads/ (MINIO_ENDPOINT ausente)");
            Arc::new(hweld_infrastructure::storage::ArmazenamentoLocal::novo(
                "uploads",
            ))
        }
    }
}
