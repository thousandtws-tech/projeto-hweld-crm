//! Use cases de logística — conjunto autoritativo do pedido para o
//! operations-api cotar frete (Melhor Envio): itens com peso/dimensões do
//! cadastro do produto, CEP de entrega e totais para seguro.
//! Canal `/internal/**` — service token, nunca JWT de usuário.

use std::sync::Arc;

use hweld_domain::catalogo::produto::Produto;
use hweld_domain::shared::id::Id;
use hweld_domain::vendas::pedido::Pedido;
use serde::Serialize;

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::RepositorioProdutos;
use crate::ports::crm::RepositorioEnderecos;
use crate::ports::vendas::RepositorioPedidos;

pub struct ServicoLogistica {
    pedidos: Arc<dyn RepositorioPedidos>,
    enderecos: Arc<dyn RepositorioEnderecos>,
    produtos: Arc<dyn RepositorioProdutos>,
}

impl ServicoLogistica {
    pub fn novo(
        pedidos: Arc<dyn RepositorioPedidos>,
        enderecos: Arc<dyn RepositorioEnderecos>,
        produtos: Arc<dyn RepositorioProdutos>,
    ) -> Self {
        Self {
            pedidos,
            enderecos,
            produtos,
        }
    }

    /// Conjunto logístico autoritativo do pedido: itens com dimensões do
    /// produto (peso kg, cm) + CEP de entrega. `endereco_entrega_id` é o
    /// destino — nunca o de faturamento.
    pub async fn dados_logisticos_pedido(
        &self,
        pedido_id: Id<Pedido>,
    ) -> Resultado<DadosLogisticosPedido> {
        let pedido = self
            .pedidos
            .buscar_por_id(pedido_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("pedido", pedido_id))?;
        let itens_pedido = self.pedidos.buscar_itens(pedido_id).await?;
        let endereco = self
            .enderecos
            .buscar_por_id(pedido.endereco_entrega_id)
            .await?;

        let produto_ids: Vec<Id<Produto>> = itens_pedido.iter().map(|i| i.produto_id).collect();
        let produtos = self.produtos.buscar_por_ids(&produto_ids).await?;

        let itens = itens_pedido
            .iter()
            .map(|item| {
                let produto = produtos.iter().find(|p| p.id == item.produto_id);
                ItemLogisticoEmissao {
                    sku: item.sku.clone(),
                    descricao: item.descricao.clone(),
                    quantidade: item.quantidade.valor(),
                    valor_unitario: item.preco_unitario.valor(),
                    peso_kg: produto.and_then(|p| p.peso_kg),
                    altura_cm: produto.and_then(|p| p.altura_cm),
                    largura_cm: produto.and_then(|p| p.largura_cm),
                    comprimento_cm: produto.and_then(|p| p.comprimento_cm),
                }
            })
            .collect();

        Ok(DadosLogisticosPedido {
            pedido: PedidoLogisticoResumo {
                id: pedido.id.valor(),
                numero: pedido.numero.clone(),
                status: pedido.status.to_string(),
                empresa_id: pedido.empresa_id.valor(),
                contato_id: pedido.contato_id.valor(),
                subtotal: pedido.subtotal.valor(),
                frete: pedido.frete.valor(),
                total: pedido.total.valor(),
            },
            itens,
            endereco_entrega: endereco.map(|e| EnderecoLogisticoResumo {
                logradouro: e.logradouro,
                numero: e.numero,
                complemento: e.complemento,
                bairro: e.bairro,
                cidade: e.cidade,
                uf: e.uf,
                cep: e.cep,
            }),
        })
    }
}

/// Resposta do endpoint interno `dados-logisticos` — contrato com o
/// `CoreApiLogisticsDataGateway` do operations-api (nomes snake_case fixos).
#[derive(Debug, Clone, Serialize)]
pub struct DadosLogisticosPedido {
    pub pedido: PedidoLogisticoResumo,
    pub itens: Vec<ItemLogisticoEmissao>,
    pub endereco_entrega: Option<EnderecoLogisticoResumo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PedidoLogisticoResumo {
    pub id: i64,
    pub numero: String,
    pub status: String,
    pub empresa_id: i64,
    pub contato_id: i64,
    pub subtotal: rust_decimal::Decimal,
    pub frete: rust_decimal::Decimal,
    pub total: rust_decimal::Decimal,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemLogisticoEmissao {
    pub sku: String,
    pub descricao: String,
    pub quantidade: rust_decimal::Decimal,
    pub valor_unitario: rust_decimal::Decimal,
    /// kg — `None` quando o produto não cadastrou (cotação bloqueia no
    /// operations-api até completar o cadastro).
    pub peso_kg: Option<rust_decimal::Decimal>,
    /// cm.
    pub altura_cm: Option<rust_decimal::Decimal>,
    pub largura_cm: Option<rust_decimal::Decimal>,
    pub comprimento_cm: Option<rust_decimal::Decimal>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnderecoLogisticoResumo {
    pub logradouro: Option<String>,
    pub numero: Option<String>,
    pub complemento: Option<String>,
    pub bairro: Option<String>,
    pub cidade: String,
    pub uf: String,
    pub cep: String,
}
