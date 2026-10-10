//! Use cases de orçamentos — CRUD, ciclo de status, conversão em pedido.
//!
//! Conversão (Fluxo B do modelo): orçamento `aprovado` → pedido
//! `origem=orcamento`, numa transação única no repositório (§7.1: no máximo
//! um pedido por orçamento — UNIQUE nas duas FKs).

use std::sync::Arc;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::crm::endereco::TipoEndereco;
use hweld_domain::crm::orcamento::{
    ItemOrcamentoNovo, Orcamento, OrcamentoInput, OrcamentoItem, StatusOrcamento,
};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pedido::{ItemPedidoNovo, OrigemPedido, Pedido};

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::RepositorioProdutos;
use crate::ports::crm::{FiltroOrcamentos, RepositorioEnderecos, RepositorioOrcamentos};
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::vendas::NovoPedido;

pub struct ServicoOrcamentos {
    orcamentos: Arc<dyn RepositorioOrcamentos>,
    enderecos: Arc<dyn RepositorioEnderecos>,
    produtos: Arc<dyn RepositorioProdutos>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoOrcamentos {
    pub fn novo(
        orcamentos: Arc<dyn RepositorioOrcamentos>,
        enderecos: Arc<dyn RepositorioEnderecos>,
        produtos: Arc<dyn RepositorioProdutos>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            orcamentos,
            enderecos,
            produtos,
            realtime,
        }
    }

    pub async fn buscar(&self, id: Id<Orcamento>) -> Resultado<(Orcamento, Vec<OrcamentoItem>)> {
        let orcamento = self
            .orcamentos
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("orcamento", id))?;
        let itens = self.orcamentos.buscar_itens(id).await?;
        Ok((orcamento, itens))
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOrcamentos,
    ) -> Resultado<Pagina<Orcamento>> {
        self.orcamentos.listar(paginacao, filtro).await
    }

    pub async fn criar(&self, input: OrcamentoInput) -> Resultado<Orcamento> {
        let criado = self.orcamentos.criar(input.validar()?).await?;
        self.realtime.publicar(EventoRealtime::novo(
            "orcamento.criado",
            Audiencia::Empresa(criado.empresa_id.valor()),
            serde_json::json!({
                "id": criado.id.valor(),
                "numero": criado.numero,
                "empresa_id": criado.empresa_id.valor(),
                "total": criado.total,
            }),
        ));
        Ok(criado)
    }

    /// Edição de itens só com o orçamento em `rascunho` (§7.6 implícito).
    pub async fn atualizar_itens(
        &self,
        id: Id<Orcamento>,
        itens: Vec<ItemOrcamentoNovo>,
        desconto: hweld_domain::Dinheiro,
        frete: hweld_domain::Dinheiro,
    ) -> Resultado<Orcamento> {
        let (orcamento, _) = self.buscar(id).await?;
        if !orcamento.status.pode_editar_itens() {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(format!(
                "orçamento '{}' não permite edição de itens",
                orcamento.status
            ))));
        }
        if itens.is_empty() {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "orçamento exige ao menos 1 item",
            )));
        }
        self.orcamentos
            .atualizar_itens(id, itens, desconto, frete)
            .await
    }

    /// Avança o status pela máquina de estados do domínio.
    pub async fn transicionar(
        &self,
        id: Id<Orcamento>,
        proximo: StatusOrcamento,
    ) -> Resultado<Orcamento> {
        let (orcamento, _) = self.buscar(id).await?;
        orcamento.status.transicionar(proximo)?;
        let depois = self.orcamentos.atualizar_status(id, proximo).await?;
        self.realtime.publicar(EventoRealtime::novo(
            "orcamento.status_alterado",
            Audiencia::Empresa(depois.empresa_id.valor()),
            serde_json::json!({
                "id": depois.id.valor(),
                "numero": depois.numero,
                "de": orcamento.status,
                "para": depois.status,
            }),
        ));
        Ok(depois)
    }

    /// Fluxo B: orçamento aprovado → pedido. Exige endereço fiscal da empresa
    /// para faturamento; entrega cai no endereço de entrega principal, senão
    /// no fiscal. Snapshots dos itens do orçamento viram itens do pedido.
    pub async fn converter(
        &self,
        id: Id<Orcamento>,
        vendedor_id: Option<Id<Usuario>>,
    ) -> Resultado<Pedido> {
        let (orcamento, itens) = self.buscar(id).await?;

        if !orcamento.pode_converter() {
            return Err(ErroApp::conflito(format!(
                "orçamento {} não pode ser convertido (status: {})",
                orcamento.numero, orcamento.status
            )));
        }
        let Some(contato_id) = orcamento.contato_id else {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "orçamento sem contato não pode virar pedido — vincule um contato",
            )));
        };

        let enderecos = self
            .enderecos
            .listar_por_empresa(orcamento.empresa_id, None)
            .await?;
        let faturamento = enderecos
            .iter()
            .find(|e| e.tipo == TipoEndereco::Fiscal && e.principal)
            .or_else(|| enderecos.iter().find(|e| e.tipo == TipoEndereco::Fiscal))
            .ok_or_else(|| {
                ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                    "empresa sem endereço fiscal — cadastre um antes de converter",
                ))
            })?;
        let entrega = enderecos
            .iter()
            .find(|e| e.tipo == TipoEndereco::Entrega && e.principal)
            .or_else(|| enderecos.iter().find(|e| e.tipo == TipoEndereco::Entrega))
            .unwrap_or(faturamento);

        // SKU do item do pedido é snapshot do cadastro atual (§4.13).
        let produto_ids: Vec<Id<Produto>> = itens.iter().map(|i| i.produto_id).collect();
        let produtos = self.produtos.buscar_por_ids(&produto_ids).await?;

        let pedido = NovoPedido {
            empresa_id: orcamento.empresa_id,
            contato_id,
            endereco_faturamento_id: faturamento.id,
            endereco_entrega_id: entrega.id,
            origem: OrigemPedido::Orcamento,
            orcamento_id: Some(orcamento.id),
            carrinho_id: None,
            vendedor_id: vendedor_id.or(Some(orcamento.vendedor_id)),
            subtotal: orcamento.subtotal,
            desconto: orcamento.desconto,
            frete: orcamento.frete,
            total: orcamento.total,
            condicao_pagamento: orcamento.condicao_pagamento.clone(),
            observacoes: orcamento.observacoes.clone(),
            itens: itens
                .iter()
                .map(|i| {
                    let produto = produtos.iter().find(|p| p.id == i.produto_id);
                    ItemPedidoNovo {
                        produto_id: i.produto_id,
                        descricao: i.descricao.clone(),
                        sku: produto.map(|p| p.sku.clone()).unwrap_or_default(),
                        quantidade: i.quantidade,
                        preco_unitario: i.preco_unitario,
                        desconto: i.desconto,
                    }
                })
                .collect(),
        };

        let convertido = self.orcamentos.converter_em_pedido(id, pedido).await?;
        // Conversão gera pedido — alimenta a lista de pedidos do backoffice
        // e o portal da empresa (mesmo contrato do checkout e-commerce).
        self.realtime.publicar(EventoRealtime::novo(
            "pedido.criado",
            Audiencia::Empresa(convertido.empresa_id.valor()),
            serde_json::json!({
                "id": convertido.id.valor(),
                "numero": convertido.numero,
                "total": convertido.total,
                "origem": convertido.origem,
            }),
        ));
        self.realtime.publicar(EventoRealtime::novo(
            "orcamento.convertido",
            Audiencia::Empresa(convertido.empresa_id.valor()),
            serde_json::json!({
                "id": orcamento.id.valor(),
                "pedido_id": convertido.id.valor(),
            }),
        ));
        Ok(convertido)
    }
}
