//! Estado compartilhado — a composition root monta `AppState` uma vez e o
//! Actix clona via `web::Data`. Os serviços carregam `Arc` internamente.

use std::sync::Arc;

use hweld_application::ports::seguranca::EmissorTokens;
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

pub struct AppState {
    pub auth: ServicoAuth,
    /// Port de tokens também exposto — os extratores validam o Bearer aqui.
    pub tokens: Arc<dyn EmissorTokens>,
    pub usuarios: ServicoUsuarios,
    pub empresas: ServicoEmpresas,
    pub contatos: ServicoContatos,
    pub enderecos: ServicoEnderecos,
    pub oportunidades: ServicoOportunidades,
    pub interacoes: ServicoInteracoes,
    pub orcamentos: ServicoOrcamentos,
    pub categorias: ServicoCategorias,
    pub produtos: ServicoProdutos,
    pub tabelas_preco: ServicoTabelasPreco,
    pub catalogo_portal: ServicoCatalogoPortal,
    /// Conta do contato B2B — perfil, endereços, categorias e pedidos.
    pub portal: ServicoPortal,
    pub carrinho: ServicoCarrinho,
    pub checkout: ServicoCheckout,
    /// `Arc` porque o serviço de integração reutiliza a mesma instância
    /// (PaymentConfirmed → transição de pedido é a mesma regra do staff).
    pub pedidos: Arc<ServicoPedidos>,
    pub estoque: ServicoEstoque,
    pub ordens: ServicoOrdensServico,
    pub notas_fiscais: ServicoNotasFiscais,
    /// Credenciais da integração SEFAZ (ambiente, CSC, certificado A1).
    pub config_fiscal: ServicoConfigFiscal,
    pub pagamentos: ServicoPagamentos,
    pub caixas: ServicoCaixas,
    pub auditoria: ServicoAuditoria,
    /// `None` quando `ELASTICSEARCH_URL` não está configurada — os
    /// endpoints de busca respondem 503 e o restante segue normal.
    pub busca: Option<ServicoBusca>,
    /// Eventos realtime saem pelo port `NotificadorRealtime` direto ao
    /// motor dedicado (Phoenix) — o Actix não serve mais SSE.

    /// Inbox persistente — sino com badge nos dois frontends.
    /// `Arc` porque os use cases de negócio também o usam como
    /// `CaixaDeEntrada` (fan-out de notificações).
    pub notificacoes: Arc<ServicoNotificacoes>,
    /// Eventos financeiros/fiscais vindos do hweld-operations-api (Java).
    /// `Arc` porque o serviço é reutilizado pelo próprio módulo de integração.
    pub integracao: Arc<ServicoIntegracao>,
    /// Segredo `X-Service-Token` do canal service-to-service — `None`
    /// desliga o endpoint interno (503), nunca libera sem autenticação.
    pub token_integracao: Option<String>,
}
