//! Registro de rotas — `/api/v1` para o backoffice (staff) e
//! `/api/v1/portal` para o B2B (contatos). Saúde fora do escopo versionado.

use std::sync::OnceLock;

use actix_governor::{
    governor::middleware::StateInformationMiddleware, Governor, GovernorConfig,
    GovernorConfigBuilder, KeyExtractor, SimpleKeyExtractionError,
};
use actix_web::{dev::ServiceRequest, error::JsonPayloadError, web};
use hweld_application::ErroApp;
use hweld_domain::shared::erro::ErroDominio;
use std::net::IpAddr;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::docs::ApiDoc;
use crate::handlers::*;

/// Extrator de chave do rate limit — `PeerIpKeyExtractor` enxergaria só o IP
/// do LB/edge na frente do serviço: ou todos os clientes dividem o mesmo
/// balde, ou cada nó do LB vira um balde e o limite nunca estoura (bug
/// medido em prod: ~90 logins por IP sem nenhum 429). Prefere `x-real-ip` e
/// `cf-connecting-ip` — setados pelo worker Cloudflare no proxy — depois
/// `x-forwarded-for`, e por fim o peer da conexão (dev local sem proxy).
#[derive(Clone, Debug)]
struct RealIpExtractor;

impl KeyExtractor for RealIpExtractor {
    type Key = IpAddr;
    type KeyExtractionError = SimpleKeyExtractionError<&'static str>;

    fn extract(&self, req: &ServiceRequest) -> Result<Self::Key, Self::KeyExtractionError> {
        let headers = req.headers();
        for nome in ["x-real-ip", "cf-connecting-ip"] {
            if let Some(ip) = headers
                .get(nome)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.trim().parse::<IpAddr>().ok())
            {
                return Ok(ip);
            }
        }
        if let Some(ip) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .and_then(|s| s.trim().parse::<IpAddr>().ok())
        {
            return Ok(ip);
        }
        req.peer_addr()
            .map(|a| a.ip())
            .ok_or_else(|| SimpleKeyExtractionError::new("cliente sem IP identificável"))
    }
}

// O App factory do Actix roda uma vez por worker — o limiter precisa ser
// criado fora do factory (Arc interno) senão cada thread teria sua própria
// cota e o rate limit nunca dispararia.
type ConfigLimiteAuth = GovernorConfig<RealIpExtractor, StateInformationMiddleware>;

fn limite_auth() -> Governor<RealIpExtractor, StateInformationMiddleware> {
    static CONFIG: OnceLock<ConfigLimiteAuth> = OnceLock::new();
    Governor::new(CONFIG.get_or_init(|| {
        // Token-bucket por IP: burst 10, recarga ~6s. Login/troca de senha
        // ficam caros demais para força bruta, e a recarga curta não trava
        // refresh de token legítimo nem redes compartilhando IP de saída.
        GovernorConfigBuilder::default()
            .seconds_per_request(6)
            .burst_size(10)
            .use_headers()
            .key_extractor(RealIpExtractor)
            .finish()
            .expect("config de rate limit inválida")
    }))
}

/// Erros de desserialização JSON voltam no mesmo envelope `{erro:{...}}`
/// das falhas de domínio — o default do actix devolvia texto puro.
fn json_cfg() -> web::JsonConfig {
    web::JsonConfig::default().error_handler(|err, _req| {
        let detalhe = match &err {
            JsonPayloadError::Deserialize(e) => format!("{e}"),
            JsonPayloadError::ContentType => "content-type deve ser application/json".into(),
            _ => err.to_string(),
        };
        crate::erro::ErroHttp::from(ErroApp::Dominio(ErroDominio::valor_invalido(
            "payload", detalhe,
        )))
        .into()
    })
}

pub fn configurar(cfg: &mut web::ServiceConfig, docs_habilitados: bool) {
    cfg.app_data(json_cfg());

    // Swagger UI self-hosted — spec gerada do código (nunca diverge das rotas).
    // Fora de prod por padrão: a spec enumera todas as rotas, incluindo internas.
    if docs_habilitados {
        cfg.service(
            SwaggerUi::new("/swagger-ui/{_:.*}").url("/api-docs/openapi.json", ApiDoc::openapi()),
        );
    }

    cfg.service(saude::health).service(saude::ready).service(
        web::scope("/api/v1")
            // Auth — escopo único (prefixos duplicados criam rota morta)
            // com rate limit por IP (anti brute-force, OWASP A07).
            .service(
                web::scope("/auth")
                    .wrap(limite_auth())
                    .service(auth::login_staff)
                    .service(auth::login_portal)
                    .service(auth::refresh)
                    .service(auth::logout)
                    .service(auth::trocar_senha)
                    .service(auth::sessoes)
                    .service(auth::encerrar_sessao)
                    .service(auth::encerrar_outras),
            )
            // Usuários (admin).
            .service(usuarios::listar)
            .service(usuarios::buscar)
            .service(usuarios::criar)
            .service(usuarios::atualizar)
            .service(usuarios::definir_ativo)
            // CRM.
            .service(crm::listar_empresas)
            .service(crm::buscar_empresa)
            .service(crm::criar_empresa)
            .service(crm::atualizar_empresa)
            .service(crm::arquivar_empresa)
            .service(crm::listar_contatos)
            .service(crm::buscar_contato)
            .service(crm::criar_contato)
            .service(crm::atualizar_contato)
            .service(crm::ativar_portal)
            .service(crm::desativar_portal)
            .service(crm::arquivar_contato)
            .service(crm::listar_enderecos)
            .service(crm::criar_endereco)
            .service(crm::atualizar_endereco)
            .service(crm::remover_endereco)
            .service(crm::listar_oportunidades)
            .service(crm::buscar_oportunidade)
            .service(crm::criar_oportunidade)
            .service(crm::atualizar_oportunidade)
            .service(crm::mover_estagio)
            .service(crm::timeline)
            .service(crm::registrar_interacao)
            // Orçamentos.
            .service(orcamentos::listar)
            .service(orcamentos::buscar)
            .service(orcamentos::criar)
            .service(orcamentos::atualizar_itens)
            .service(orcamentos::transicionar)
            .service(orcamentos::converter)
            // Catálogo.
            .service(catalogo::listar_categorias)
            .service(catalogo::criar_categoria)
            .service(catalogo::atualizar_categoria)
            .service(catalogo::excluir_categoria)
            .service(catalogo::listar_produtos)
            .service(catalogo::buscar_produto)
            .service(catalogo::criar_produto)
            .service(catalogo::atualizar_produto)
            .service(catalogo::arquivar_produto)
            .service(catalogo::listar_tabelas)
            .service(catalogo::buscar_tabela)
            .service(catalogo::criar_tabela)
            .service(catalogo::atualizar_tabela)
            .service(catalogo::definir_preco)
            .service(catalogo::remover_item_tabela)
            .service(catalogo::listar_imagens)
            .service(catalogo::adicionar_imagem)
            .service(catalogo::atualizar_imagem)
            .service(catalogo::remover_imagem)
            .service(catalogo::upload_midia)
            .service(catalogo::servir_midia)
            .service(catalogo::obter_cms_staff)
            .service(catalogo::salvar_cms_staff)
            .service(catalogo::obter_cms_publico)
            // Pedidos.
            .service(pedidos::listar)
            .service(pedidos::buscar)
            .service(pedidos::criar_manual)
            .service(pedidos::transicionar)
            // Estoque.
            .service(estoque::saldo)
            .service(estoque::movimentacoes)
            .service(estoque::lancar)
            .service(estoque::abaixo_do_minimo)
            // Ordens de serviço.
            .service(ordens::listar)
            .service(ordens::buscar)
            .service(ordens::criar)
            .service(ordens::consumir_material)
            .service(ordens::transicionar)
            // Fiscal.
            .service(fiscal::listar)
            .service(fiscal::buscar)
            .service(fiscal::emitir)
            .service(fiscal::autorizar)
            .service(fiscal::cancelar)
            .service(fiscal::obter_configuracao)
            .service(fiscal::salvar_configuracao)
            .service(fiscal::upload_certificado)
            .service(fiscal::remover_certificado)
            // Financeiro.
            .service(financeiro::listar_pagamentos)
            .service(financeiro::gerar_parcelas)
            .service(financeiro::baixar)
            .service(financeiro::estornar)
            .service(financeiro::caixa_aberto)
            .service(financeiro::listar_caixas)
            .service(financeiro::movimentacoes_caixa)
            .service(financeiro::abrir)
            .service(financeiro::lancar)
            .service(financeiro::fechar)
            // Canal interno service-to-service (hweld-operations-api) —
            // auth própria por X-Service-Token, sem JWT de usuário.
            .service(interno::eventos_financeiros)
            .service(interno::dados_fiscais)
            // Busca (Elasticsearch) — staff.
            .service(busca::buscar_staff)
            .service(busca::reindexar)
            // Auditoria.
            .service(auditoria::listar)
            // Notificações — inbox do staff (sino com badge).
            .service(notificacoes::listar_staff)
            .service(notificacoes::nao_lidas_staff)
            .service(notificacoes::marcar_lida_staff)
            .service(notificacoes::ler_todas_staff)
            .service(notificacoes::remover_staff)
            .service(notificacoes::limpar_todas_staff)
            // Portal B2B — mesmo escopo, extrator `AuthPortal` valida o contexto.
            .service(portal::me)
            .service(portal::enderecos)
            .service(portal::criar_endereco)
            .service(portal::categorias)
            .service(portal::produto)
            .service(portal::pedidos)
            .service(portal::pedido)
            .service(catalogo::catalogo_portal)
            .service(busca::buscar_portal)
            .service(busca::sugerir_portal)
            .service(carrinho::atual)
            .service(carrinho::adicionar)
            .service(carrinho::atualizar)
            .service(carrinho::remover)
            .service(carrinho::checkout)
            // Notificações do portal — inbox do contato.
            .service(notificacoes::listar_portal)
            .service(notificacoes::nao_lidas_portal)
            .service(notificacoes::marcar_lida_portal)
            .service(notificacoes::ler_todas_portal)
            .service(notificacoes::remover_portal)
            .service(notificacoes::limpar_todas_portal)
            // Telemetria — Web Vitals dos dois front-ends (público, sem auth;
            // beacon anônimo não carrega credenciais).
            .service(telemetria::vitals),
    );
}
