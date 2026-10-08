//! Registro de rotas — `/api/v1` para o backoffice (staff) e
//! `/api/v1/portal` para o B2B (contatos). Saúde fora do escopo versionado.

use actix_web::web;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::docs::ApiDoc;
use crate::handlers::*;

pub fn configurar(cfg: &mut web::ServiceConfig) {
    // Swagger UI self-hosted — spec gerada do código (nunca diverge das rotas).
    cfg.service(
        SwaggerUi::new("/swagger-ui/{_:.*}").url("/api-docs/openapi.json", ApiDoc::openapi()),
    );

    cfg.service(saude::health).service(saude::ready).service(
        web::scope("/api/v1")
            // Auth — staff e portal com contextos de token distintos.
            .service(auth::login_staff)
            .service(auth::login_portal)
            .service(auth::refresh)
            .service(auth::logout)
            .service(auth::trocar_senha)
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
            .service(catalogo::remover_imagem)
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
            // Portal B2B — mesmo escopo, extrator `AuthPortal` valida o contexto.
            .service(portal::me)
            .service(portal::enderecos)
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
            // Realtime SSE — um stream por contexto de token.
            .service(realtime::stream_staff)
            .service(realtime::stream_portal),
    );
}
