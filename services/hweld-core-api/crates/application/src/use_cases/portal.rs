//! Use cases do portal B2B — conta do contato autenticado.
//!
//! Regra de ouro: todo recurso é resolvido a partir de `contato.empresa_id`
//! do token — nunca de um id vindo da URL. Falha de posse retorna 404
//! (não revela que o recurso existe para outra empresa).

use std::sync::Arc;

use chrono::{DateTime, Utc};
use hweld_domain::catalogo::categoria::Categoria;
use hweld_domain::catalogo::tabela_preco::TabelaPreco;
use hweld_domain::crm::contato::Contato;
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::crm::endereco::{Endereco, EnderecoInput, TipoEndereco};
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pedido::{OrigemPedido, Pedido, StatusPedido};
use serde::Serialize;

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::{RepositorioCategorias, RepositorioTabelasPreco};
use crate::ports::crm::{RepositorioContatos, RepositorioEmpresas, RepositorioEnderecos};
use crate::ports::vendas::{FiltroPedidos, RepositorioPedidos};

// ── DTOs sanitizados do portal ──────────────────────────────────────────────
// Nunca expõem: senha_hash, acesso_portal, deleted_at, ids internos de
// orçamento/carrinho/vendedor, nem saldo exato de estoque.

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ContatoPortal {
    pub id: Id<Contato>,
    pub nome: String,
    pub cargo: Option<String>,
    pub email: Option<String>,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
    pub is_principal: bool,
}

impl From<Contato> for ContatoPortal {
    fn from(c: Contato) -> Self {
        Self {
            id: c.id,
            nome: c.nome,
            cargo: c.cargo,
            email: c.email,
            telefone: c.telefone,
            whatsapp: c.whatsapp,
            is_principal: c.is_principal,
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct EmpresaPortal {
    pub id: Id<Empresa>,
    pub razao_social: String,
    pub nome_fantasia: Option<String>,
    pub cnpj: Option<String>,
    pub segmento: Option<String>,
}

impl From<Empresa> for EmpresaPortal {
    fn from(e: Empresa) -> Self {
        Self {
            id: e.id,
            razao_social: e.razao_social,
            nome_fantasia: e.nome_fantasia,
            cnpj: e.cnpj,
            segmento: e.segmento,
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct TabelaPortal {
    pub id: Id<TabelaPreco>,
    pub nome: String,
}

/// `GET /portal/me` — perfil do contato + empresa + tabela de preço vigente.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct MeuPerfilPortal {
    pub contato: ContatoPortal,
    pub empresa: EmpresaPortal,
    pub tabela_preco: Option<TabelaPortal>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct EnderecoPortal {
    pub id: Id<Endereco>,
    pub tipo: TipoEndereco,
    pub logradouro: Option<String>,
    pub numero: Option<String>,
    pub complemento: Option<String>,
    pub bairro: Option<String>,
    pub cidade: String,
    pub uf: String,
    pub cep: String,
    pub principal: bool,
}

impl From<Endereco> for EnderecoPortal {
    fn from(e: Endereco) -> Self {
        Self {
            id: e.id,
            tipo: e.tipo,
            logradouro: e.logradouro,
            numero: e.numero,
            complemento: e.complemento,
            bairro: e.bairro,
            cidade: e.cidade,
            uf: e.uf,
            cep: e.cep,
            principal: e.principal,
        }
    }
}

/// Resumo de pedido na listagem do portal — sem ids de orçamento/carrinho/
/// vendedor nem chaves de endereço.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct PedidoResumoPortal {
    pub id: Id<Pedido>,
    pub numero: String,
    pub status: StatusPedido,
    pub origem: OrigemPedido,
    pub total: Dinheiro,
    pub condicao_pagamento: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<Pedido> for PedidoResumoPortal {
    fn from(p: Pedido) -> Self {
        Self {
            id: p.id,
            numero: p.numero,
            status: p.status,
            origem: p.origem,
            total: p.total,
            condicao_pagamento: p.condicao_pagamento,
            created_at: p.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ItemPedidoPortal {
    pub produto_id: Id<hweld_domain::catalogo::produto::Produto>,
    pub descricao: String,
    pub sku: String,
    pub quantidade: Quantidade,
    pub preco_unitario: Dinheiro,
    pub desconto: Dinheiro,
    pub total: Dinheiro,
}

/// Detalhe do pedido no portal — resumo + totais + itens + endereços.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct PedidoDetalhePortal {
    #[serde(flatten)]
    pub resumo: PedidoResumoPortal,
    pub subtotal: Dinheiro,
    pub desconto: Dinheiro,
    pub frete: Dinheiro,
    pub observacoes: Option<String>,
    pub itens: Vec<ItemPedidoPortal>,
    pub endereco_faturamento: Option<EnderecoPortal>,
    pub endereco_entrega: Option<EnderecoPortal>,
}

// ── Serviço ─────────────────────────────────────────────────────────────────

pub struct ServicoPortal {
    contatos: Arc<dyn RepositorioContatos>,
    empresas: Arc<dyn RepositorioEmpresas>,
    enderecos: Arc<dyn RepositorioEnderecos>,
    pedidos: Arc<dyn RepositorioPedidos>,
    tabelas: Arc<dyn RepositorioTabelasPreco>,
    categorias: Arc<dyn RepositorioCategorias>,
}

impl ServicoPortal {
    pub fn novo(
        contatos: Arc<dyn RepositorioContatos>,
        empresas: Arc<dyn RepositorioEmpresas>,
        enderecos: Arc<dyn RepositorioEnderecos>,
        pedidos: Arc<dyn RepositorioPedidos>,
        tabelas: Arc<dyn RepositorioTabelasPreco>,
        categorias: Arc<dyn RepositorioCategorias>,
    ) -> Self {
        Self {
            contatos,
            empresas,
            enderecos,
            pedidos,
            tabelas,
            categorias,
        }
    }

    /// Contato autenticado ainda válido — token antigo de contato arquivado
    /// ou com acesso revogado morre aqui com 401.
    pub async fn contato(&self, contato_id: Id<Contato>) -> Resultado<Contato> {
        self.contatos
            .buscar_por_id(contato_id)
            .await?
            .filter(|c| c.pode_logar_portal())
            .ok_or_else(|| ErroApp::nao_autenticado("contato inválido"))
    }

    /// Atalho para handlers que só precisam do escopo do tenant.
    pub async fn empresa_do_contato(&self, contato_id: Id<Contato>) -> Resultado<Id<Empresa>> {
        Ok(self.contato(contato_id).await?.empresa_id)
    }

    /// G1 — perfil do contato + empresa + tabela de preço vigente.
    pub async fn me(&self, contato_id: Id<Contato>) -> Resultado<MeuPerfilPortal> {
        let contato = self.contato(contato_id).await?;
        let empresa = self
            .empresas
            .buscar_por_id(contato.empresa_id)
            .await?
            .filter(|e| e.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_autenticado("empresa inválida"))?;
        let tabela_preco = self
            .tabelas
            .tabela_da_empresa(empresa.id)
            .await?
            .map(|(t, _)| TabelaPortal {
                id: t.id,
                nome: t.nome,
            });
        Ok(MeuPerfilPortal {
            contato: contato.into(),
            empresa: empresa.into(),
            tabela_preco,
        })
    }

    /// G2 — endereços da empresa do contato.
    pub async fn enderecos(
        &self,
        contato_id: Id<Contato>,
        tipo: Option<TipoEndereco>,
    ) -> Resultado<Vec<EnderecoPortal>> {
        let empresa_id = self.empresa_do_contato(contato_id).await?;
        Ok(self
            .enderecos
            .listar_por_empresa(empresa_id, tipo)
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    /// Cadastra novo endereço para a empresa do contato autenticado (self-service no checkout/conta).
    pub async fn criar_endereco(
        &self,
        contato_id: Id<Contato>,
        mut input: EnderecoInput,
    ) -> Resultado<EnderecoPortal> {
        let empresa_id = self.empresa_do_contato(contato_id).await?;
        input.empresa_id = empresa_id;
        let validado = input.validar().map_err(ErroApp::Dominio)?;
        let criado = self.enderecos.criar(validado).await?;
        Ok(criado.into())
    }

    /// G3 — pedidos da empresa inteira (decisão de produto: visão B2B por
    /// empresa; `so_meus=true` restringe aos pedidos do próprio contato).
    /// `empresa_id` do filtro é sempre do token — nunca do cliente.
    pub async fn pedidos(
        &self,
        contato_id: Id<Contato>,
        paginacao: Paginacao,
        statuses: Vec<StatusPedido>,
        so_meus: bool,
    ) -> Resultado<Pagina<PedidoResumoPortal>> {
        let contato = self.contato(contato_id).await?;
        let pagina = self
            .pedidos
            .listar(
                paginacao,
                FiltroPedidos {
                    statuses,
                    empresa_id: Some(contato.empresa_id),
                    contato_id: so_meus.then_some(contato.id),
                    origem: None,
                    busca: None,
                },
            )
            .await?;
        Ok(pagina.map(Into::into))
    }

    /// G4 — detalhe com checagem de posse: pedido de outra empresa é 404.
    pub async fn pedido(
        &self,
        contato_id: Id<Contato>,
        pedido_id: Id<Pedido>,
    ) -> Resultado<PedidoDetalhePortal> {
        let contato = self.contato(contato_id).await?;
        let pedido = self
            .pedidos
            .buscar_por_id(pedido_id)
            .await?
            .filter(|p| p.empresa_id == contato.empresa_id)
            .ok_or_else(|| ErroApp::nao_encontrado("pedido", pedido_id))?;
        let itens = self
            .pedidos
            .buscar_itens(pedido.id)
            .await?
            .into_iter()
            .map(|i| ItemPedidoPortal {
                produto_id: i.produto_id,
                descricao: i.descricao,
                sku: i.sku,
                quantidade: i.quantidade,
                preco_unitario: i.preco_unitario,
                desconto: i.desconto,
                total: i.total,
            })
            .collect();
        let faturamento = self
            .enderecos
            .buscar_por_id(pedido.endereco_faturamento_id)
            .await?;
        let entrega = self
            .enderecos
            .buscar_por_id(pedido.endereco_entrega_id)
            .await?;
        Ok(PedidoDetalhePortal {
            resumo: pedido.clone().into(),
            subtotal: pedido.subtotal,
            desconto: pedido.desconto,
            frete: pedido.frete,
            observacoes: pedido.observacoes,
            itens,
            endereco_faturamento: faturamento.map(Into::into),
            endereco_entrega: entrega.map(Into::into),
        })
    }

    /// G6 — categorias ativas, flat; o front monta a árvore.
    pub async fn categorias(&self, contato_id: Id<Contato>) -> Resultado<Vec<Categoria>> {
        self.contato(contato_id).await?;
        self.categorias.listar_todas(true).await
    }
}
