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
use hweld_application::use_cases::fiscal::ServicoNotasFiscais;
use hweld_application::use_cases::orcamentos::ServicoOrcamentos;
use hweld_application::use_cases::ordens::ServicoOrdensServico;
use hweld_application::use_cases::pedidos::ServicoPedidos;
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
    pub carrinho: ServicoCarrinho,
    pub checkout: ServicoCheckout,
    pub pedidos: ServicoPedidos,
    pub estoque: ServicoEstoque,
    pub ordens: ServicoOrdensServico,
    pub notas_fiscais: ServicoNotasFiscais,
    pub pagamentos: ServicoPagamentos,
    pub caixas: ServicoCaixas,
    pub auditoria: ServicoAuditoria,
    /// `None` quando `ELASTICSEARCH_URL` não está configurada — os
    /// endpoints de busca respondem 503 e o restante segue normal.
    pub busca: Option<ServicoBusca>,
}
