use std::process::ExitCode;
use std::sync::Arc;

use actix_cors::Cors;
use actix_web::middleware::Logger;
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
use hweld_application::use_cases::fiscal::ServicoNotasFiscais;
use hweld_application::use_cases::notificacoes::ServicoNotificacoes;
use hweld_application::use_cases::orcamentos::ServicoOrcamentos;
use hweld_application::use_cases::ordens::ServicoOrdensServico;
use hweld_application::use_cases::pedidos::ServicoPedidos;
use hweld_application::use_cases::portal::ServicoPortal;
use hweld_application::use_cases::usuarios::ServicoUsuarios;
use hweld_domain::acesso::usuario::{NovoUsuario, Perfil};
use hweld_infrastructure::persistence::{
    RegistradorAuditoriaPg, RepositorioAuditoriaPg, RepositorioCaixasPg, RepositorioCarrinhosPg,
    RepositorioCategoriasPg, RepositorioContatosPg, RepositorioEmpresasPg, RepositorioEnderecosPg,
    RepositorioEstoquePg, RepositorioFormasPagamentoPg, RepositorioInteracoesPg,
    RepositorioNotasFiscaisPg, RepositorioNotificacoesPg, RepositorioOportunidadesPg,
    RepositorioOrcamentosPg, RepositorioOrdensServicoPg, RepositorioPagamentosPg,
    RepositorioPedidosPg, RepositorioProdutosPg, RepositorioTabelasPrecoPg, RepositorioUsuariosPg,
};
use hweld_infrastructure::{
    conectar, BroadcasterRealtime, BuscaElastic, Config, EmissorJwt, GatewayFiscalStub,
    HasherArgon2, MIGRATOR,
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
    init_tracing();

    let config = Config::from_env().map_err(|e| anyhow::anyhow!("{e}"))?;
    tracing::info!(
        host = %config.host,
        port = config.port,
        ambiente = %config.ambiente,
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
    let dados = web::Data::new(estado);
    let dados_pool = web::Data::new(pool);
    let cors_origins = config.cors_origins.clone();
    let cors_permissive = config.cors_permissive;
    let bind = (config.host.clone(), config.port);

    tracing::info!(bind = ?bind, "servidor HTTP subindo");
    HttpServer::new(move || {
        let cors = if cors_permissive {
            Cors::permissive()
        } else {
            let mut c = Cors::default()
                .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE"])
                .allowed_headers(vec![
                    actix_web::http::header::AUTHORIZATION,
                    actix_web::http::header::CONTENT_TYPE,
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
            .wrap(cors)
            .wrap(TracingLogger::default())
            .wrap(Logger::default())
            .configure(rotas::configurar)
    })
    .bind(bind)?
    .run()
    .await?;
    Ok(())
}

fn init_tracing() {
    use tracing_subscriber::EnvFilter;
    let filtro = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,hweld=debug,sqlx=warn,actix_server=info"));
    tracing_subscriber::fmt()
        .with_env_filter(filtro)
        .with_target(true)
        .compact()
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
    let caixas_repo = Arc::new(RepositorioCaixasPg::novo(pool.clone()));
    let auditoria_repo = Arc::new(RepositorioAuditoriaPg::novo(pool.clone()));
    let notificacoes_repo = Arc::new(RepositorioNotificacoesPg::novo(pool.clone()));

    let hasher = Arc::new(HasherArgon2::novo());
    let tokens: Arc<dyn hweld_application::ports::seguranca::EmissorTokens> =
        Arc::new(EmissorJwt::novo(&config.jwt, pool.clone()));
    let gateway_fiscal = Arc::new(GatewayFiscalStub::novo());
    let audit = Arc::new(RegistradorAuditoriaPg::novo(pool.clone()));
    // Barramento realtime — mesmo Arc serve publisher (use cases) e
    // assinantes (handlers SSE).
    let realtime = Arc::new(BroadcasterRealtime::novo());
    // Inbox persistente — fan-out por destinatário + evento `notificacao.nova`.
    let notificacoes = Arc::new(ServicoNotificacoes::novo(
        notificacoes_repo,
        usuarios_repo.clone(),
        contatos_repo.clone(),
        realtime.clone(),
    ));

    AppState {
        tokens: tokens.clone(),
        auth: ServicoAuth::novo(
            usuarios_repo.clone(),
            contatos_repo.clone(),
            hasher.clone(),
            tokens,
        ),
        usuarios: ServicoUsuarios::novo(usuarios_repo, hasher.clone(), audit.clone()),
        empresas: ServicoEmpresas::novo(empresas_repo.clone(), audit.clone()),
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
        ),
        categorias: ServicoCategorias::novo(categorias_repo.clone(), realtime.clone()),
        produtos: ServicoProdutos::novo(
            produtos_repo.clone(),
            categorias_repo.clone(),
            motor_busca.clone(),
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
            enderecos_repo,
            produtos_repo.clone(),
            realtime.clone(),
            notificacoes.clone(),
        ),
        pedidos: ServicoPedidos::novo(
            pedidos_repo.clone(),
            produtos_repo.clone(),
            audit.clone(),
            realtime.clone(),
            notificacoes.clone(),
        ),
        estoque: ServicoEstoque::novo(estoque_repo, produtos_repo.clone(), audit.clone()),
        ordens: ServicoOrdensServico::novo(ordens_repo, produtos_repo.clone()),
        notas_fiscais: ServicoNotasFiscais::novo(
            notas_repo,
            pedidos_repo.clone(),
            gateway_fiscal,
            audit.clone(),
        ),
        pagamentos: ServicoPagamentos::novo(
            pagamentos_repo,
            pedidos_repo,
            formas_repo,
            audit.clone(),
        ),
        caixas: ServicoCaixas::novo(caixas_repo, audit.clone()),
        auditoria: ServicoAuditoria::novo(auditoria_repo),
        realtime,
        notificacoes,
        busca: motor_busca.map(|motor| {
            ServicoBusca::novo(
                motor,
                produtos_repo.clone(),
                categorias_repo,
                tabelas_repo.clone(),
                empresas_repo.clone(),
            )
        }),
    }
}
