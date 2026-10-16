//! Documento OpenAPI agregado — `ApiDoc` junta todos os `#[utoipa::path]` dos
//! handlers e os schemas públicos do contrato. A fonte de verdade é o código:
//! a spec é gerada em compile-time e nunca diverge das rotas reais.

use hweld_application::ports::busca::{FacetaContagem, Facetas, SugestaoProduto};
use hweld_application::use_cases::busca::{BuscaPaginada, ItemBuscaPortal, ItemBuscaStaff};
use hweld_application::use_cases::carrinho::CarrinhoDetalhe;
use hweld_application::use_cases::catalogo::{
    ItemCatalogoPortal, ProdutoDetalhePortal, ProdutoPortal,
};
use hweld_application::use_cases::portal::{
    ContatoPortal, EmpresaPortal, EnderecoPortal, ItemPedidoPortal, MeuPerfilPortal,
    PedidoDetalhePortal, PedidoResumoPortal, TabelaPortal,
};
use hweld_domain::acesso::usuario::{Perfil, Usuario};
use hweld_domain::auditoria::log::{AcaoAuditoria, LogAuditoria};
use hweld_domain::catalogo::categoria::Categoria;
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem};
use hweld_domain::catalogo::tabela_preco::{TabelaPreco, TabelaPrecoItem};
use hweld_domain::crm::contato::Contato;
use hweld_domain::crm::empresa::{Empresa, StatusEmpresa};
use hweld_domain::crm::endereco::{Endereco, TipoEndereco};
use hweld_domain::crm::interacao::{Interacao, TipoInteracao};
use hweld_domain::crm::oportunidade::{EstagioOportunidade, Oportunidade, OrigemOportunidade};
use hweld_domain::crm::orcamento::{Orcamento, OrcamentoItem, StatusOrcamento};
use hweld_domain::estoque::movimentacao::{EstoqueMovimentacao, EstoqueSaldo, TipoMovimentacao};
use hweld_domain::financeiro::caixa::{
    Caixa, CaixaMovimentacao, StatusCaixa, TipoCaixaMovimentacao,
};
use hweld_domain::fiscal::configuracao::{AmbienteSefaz, StatusIntegracaoFiscal};
use hweld_domain::fiscal::nota_fiscal::{
    NotaFiscal, NotaFiscalItem, StatusNotaFiscal, TipoNotaFiscal,
};
use hweld_domain::notificacao::Notificacao;
use hweld_domain::operacao::ordem_servico::{
    OrdemServico, OsHistorico, OsItem, PrioridadeOs, StatusOs,
};
use hweld_domain::shared::paginacao::Pagina;
use hweld_domain::vendas::carrinho::{Carrinho, CarrinhoItem, StatusCarrinho};
use hweld_domain::vendas::pagamento::{FormaPagamento, Pagamento, StatusPagamento};
use hweld_domain::vendas::pedido::{OrigemPedido, Pedido, PedidoItem, StatusPedido};
use utoipa::OpenApi;

use crate::dto::*;
use crate::handlers::*;

/// Esquema de segurança JWT — o mesmo header `Authorization: Bearer <token>`
/// serve aos dois contextos (staff e portal); a descrição de cada operação
/// indica qual contexto de token é exigido.
struct SegurancaBearer;

impl utoipa::Modify for SegurancaBearer {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                utoipa::openapi::security::SecurityScheme::Http(
                    utoipa::openapi::security::HttpBuilder::new()
                        .scheme(utoipa::openapi::security::HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .build(),
                ),
            );
        }
    }
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "HWeld API",
        version = "0.1.0",
        description = "API REST da plataforma HWeld — e-commerce B2B, CRM, catálogo, \
                       vendas, estoque, ordens de serviço, fiscal e financeiro.\n\n\
                       **Autenticação**: JWT Bearer com dois contextos — *staff*\
                       (usuários internos, `POST /auth/login`) e *portal*\
                       (contatos B2B, `POST /portal/auth/login`). Endpoints marcados\
                       como portal exigem token de contato; os demais, token staff.",
        contact(name = "HWeld", email = "dev@hweld.local"),
        license(name = "Proprietário"),
    ),
    servers((url = "/", description = "servidor atual")),
    tags(
        (name = "Saúde", description = "liveness e readiness"),
        (name = "Auth", description = "login staff/portal, refresh, logout, senha"),
        (name = "Usuários", description = "administração de usuários internos (admin)"),
        (name = "CRM", description = "empresas, contatos, endereços, oportunidades e interações"),
        (name = "Orçamentos", description = "cotações e conversão em pedido"),
        (name = "Catálogo", description = "categorias, produtos e tabelas de preço"),
        (name = "Pedidos", description = "pedidos staff e manuais"),
        (name = "Estoque", description = "saldos, movimentações e alertas de mínimo"),
        (name = "Ordens de Serviço", description = "OS com trilha de status e consumo de material"),
        (name = "Fiscal", description = "notas fiscais — emissão, autorização e cancelamento"),
        (name = "Financeiro", description = "pagamentos, parcelas e sessões de caixa"),
        (name = "Busca", description = "busca full-text Elasticsearch (staff) e reindexação"),
        (name = "Portal B2B", description = "catálogo precificado, busca, carrinho e checkout do contato"),
        (name = "Realtime", description = "SSE — eventos de domínio por contexto (staff/portal)"),
        (name = "Notificações", description = "inbox persistente do sino (staff e portal)"),
        (name = "Auditoria", description = "consulta do log append-only (admin)"),
    ),
    paths(
        // Saúde
        saude::health, saude::ready,
        // Autenticação
        auth::login_staff, auth::login_portal, auth::refresh,
        auth::logout, auth::trocar_senha,
        auth::sessoes, auth::encerrar_sessao, auth::encerrar_outras,
        // Usuários
        usuarios::listar, usuarios::buscar, usuarios::criar, usuarios::atualizar,
        usuarios::definir_ativo,
        // CRM
        crm::listar_empresas, crm::buscar_empresa, crm::criar_empresa, crm::atualizar_empresa,
        crm::arquivar_empresa, crm::listar_contatos, crm::buscar_contato, crm::criar_contato,
        crm::atualizar_contato, crm::ativar_portal, crm::desativar_portal, crm::arquivar_contato,
        crm::listar_enderecos, crm::criar_endereco, crm::atualizar_endereco, crm::remover_endereco,
        crm::listar_oportunidades, crm::buscar_oportunidade, crm::criar_oportunidade,
        crm::atualizar_oportunidade, crm::mover_estagio, crm::timeline, crm::registrar_interacao,
        // Orçamentos
        orcamentos::listar, orcamentos::buscar, orcamentos::criar, orcamentos::atualizar_itens,
        orcamentos::transicionar, orcamentos::converter,
        // Catálogo
        catalogo::listar_categorias, catalogo::criar_categoria, catalogo::atualizar_categoria,
        catalogo::listar_produtos, catalogo::buscar_produto, catalogo::criar_produto,
        catalogo::atualizar_produto, catalogo::arquivar_produto, catalogo::listar_tabelas,
        catalogo::buscar_tabela, catalogo::criar_tabela, catalogo::atualizar_tabela,
        catalogo::definir_preco, catalogo::remover_item_tabela, catalogo::catalogo_portal,
        catalogo::listar_imagens, catalogo::adicionar_imagem, catalogo::atualizar_imagem,
        catalogo::remover_imagem, catalogo::upload_midia, catalogo::servir_midia,
        // Pedidos
        pedidos::listar, pedidos::buscar, pedidos::criar_manual, pedidos::transicionar,
        // Estoque
        estoque::saldo, estoque::movimentacoes, estoque::lancar, estoque::abaixo_do_minimo,
        // Ordens de serviço
        ordens::listar, ordens::buscar, ordens::criar, ordens::consumir_material,
        ordens::transicionar,
        // Fiscal
        fiscal::listar, fiscal::buscar, fiscal::emitir, fiscal::autorizar, fiscal::cancelar,
        fiscal::obter_configuracao, fiscal::salvar_configuracao,
        fiscal::upload_certificado, fiscal::remover_certificado,
        // Financeiro
        financeiro::listar_pagamentos, financeiro::gerar_parcelas, financeiro::baixar,
        financeiro::estornar, financeiro::caixa_aberto, financeiro::listar_caixas,
        financeiro::movimentacoes_caixa, financeiro::abrir, financeiro::lancar,
        financeiro::fechar,
        // Busca
        busca::buscar_staff, busca::reindexar, busca::buscar_portal, busca::sugerir_portal,
        // Auditoria
        auditoria::listar,
        // Portal B2B — conta, catálogo e checkout
        portal::me, portal::enderecos, portal::categorias, portal::produto,
        portal::pedidos, portal::pedido,
        carrinho::atual, carrinho::adicionar, carrinho::atualizar, carrinho::remover,
        carrinho::checkout,
        // Realtime — SSE/WebSocket saíram para o motor dedicado (Phoenix);
        // os endpoints /events/* e /socket não são servidos por esta API.
        // Notificações — sino nos dois contextos
        notificacoes::listar_staff, notificacoes::nao_lidas_staff,
        notificacoes::marcar_lida_staff, notificacoes::ler_todas_staff,
        notificacoes::listar_portal, notificacoes::nao_lidas_portal,
        notificacoes::marcar_lida_portal, notificacoes::ler_todas_portal,
    ),
    components(
        schemas(
            // ── DTOs de request ─────────────────────────────────────────
            LoginReq, RefreshReq, TrocarSenhaReq, CriarUsuarioReq, AtualizarUsuarioReq,
            AtivoReq, EmpresaReq, ContatoReq, AtivarPortalReq, EnderecoReq,
            OportunidadeReq, MoverEstagioReq, InteracaoReq, OrcamentoReq,
            ItensOrcamentoReq, ItemOrcamentoReq, StatusOrcamentoReq, CategoriaReq,
            ProdutoReq, TabelaPrecoReq, PrecoItemReq, PedidoManualReq, ItemPedidoReq,
            StatusPedidoReq, MovimentacaoReq, OrdemServicoReq, ItemOsReq, StatusOsReq,
            EmitirNfReq, CancelarNfReq, ConfigFiscalReq, ParcelasReq, BaixarPagamentoReq,
            EstornarPagamentoReq, AbrirCaixaReq, LancarCaixaReq, FecharCaixaReq,
            ItemCarrinhoReq, CheckoutReq, ImagemProdutoReq, AtualizarImagemProdutoReq,
            // ── Entidades de domínio ────────────────────────────────────
            Usuario, Empresa, Contato, Endereco, Oportunidade, Interacao, Orcamento,
            OrcamentoItem, Categoria, Produto, ProdutoImagem,
            TabelaPreco, TabelaPrecoItem, Pedido, PedidoItem, EstoqueSaldo,
            EstoqueMovimentacao, OrdemServico, OsItem, OsHistorico, NotaFiscal,
            NotaFiscalItem, Pagamento, FormaPagamento, Caixa,
            CaixaMovimentacao, Carrinho, CarrinhoItem, LogAuditoria, Notificacao,
            notificacoes::NaoLidasResposta,
            // ── Enums (valores serializados reais) ──────────────────────
            Perfil, StatusEmpresa, TipoEndereco, TipoInteracao, OrigemOportunidade,
            EstagioOportunidade, StatusOrcamento, TipoMovimentacao, StatusCaixa,
            TipoCaixaMovimentacao, TipoNotaFiscal, StatusNotaFiscal, StatusOs,
            PrioridadeOs, StatusCarrinho, StatusPagamento, OrigemPedido, StatusPedido,
            AcaoAuditoria, AmbienteSefaz, StatusIntegracaoFiscal,
            // ── Tipos de aplicação ──────────────────────────────────────
            CarrinhoDetalhe, ItemCatalogoPortal, ItemBuscaStaff, ItemBuscaPortal,
            FacetaContagem, Facetas, SugestaoProduto,
            // ── Envelopes paginados concretos ───────────────────────────
            Pagina<Usuario>, Pagina<Empresa>, Pagina<Contato>, Pagina<Oportunidade>,
            Pagina<Interacao>, Pagina<Orcamento>, Pagina<Produto>, Pagina<TabelaPreco>,
            Pagina<Pedido>, Pagina<EstoqueMovimentacao>, Pagina<OrdemServico>,
            Pagina<NotaFiscal>, Pagina<Pagamento>, Pagina<Caixa>, Pagina<LogAuditoria>,
            Pagina<ItemCatalogoPortal>, Pagina<PedidoResumoPortal>,
            BuscaPaginada<ItemBuscaStaff>, BuscaPaginada<ItemBuscaPortal>,
            // ── Respostas locais dos handlers ───────────────────────────
            auth::TokensResp, auth::PortalLoginResp, auth::ContatoResp, auth::SessaoResp,
            saude::Saude,
            ConfigFiscalResp,
            busca::ReindexResultado, catalogo::ProdutoDetalhe, catalogo::TabelaDetalhe,
            catalogo::UploadMidiaResp,
            estoque::SaldoAbaixoMinimo, fiscal::NotaDetalhe, orcamentos::OrcamentoDetalhe,
            ordens::OsDetalhe, pedidos::PedidoDetalhe,
            // ── Portal B2B ──────────────────────────────────────────────
            ProdutoPortal, ProdutoDetalhePortal, ContatoPortal, EmpresaPortal,
            TabelaPortal, EnderecoPortal, PedidoResumoPortal, ItemPedidoPortal,
            PedidoDetalhePortal, MeuPerfilPortal,
        )
    ),
    modifiers(&SegurancaBearer)
)]
pub struct ApiDoc;
