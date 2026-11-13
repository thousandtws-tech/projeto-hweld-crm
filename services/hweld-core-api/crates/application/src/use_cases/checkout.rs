//! Checkout — converte o carrinho do portal em pedido de venda.
//!
//! Fluxo A do modelo: carrinho `aberto` → pedido `aguardando_pagamento`
//! (origem=ecommerce) + itens com snapshots + carrinho `convertido` —
//! tudo numa única transação no repositório.

use std::sync::Arc;

use hweld_domain::crm::contato::Contato;
use hweld_domain::crm::endereco::Endereco;
use hweld_domain::crm::orcamento::calcular_totais;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::vendas::pedido::{ItemPedidoNovo, OrigemPedido, Pedido};

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::RepositorioProdutos;
use crate::ports::crm::{RepositorioContatos, RepositorioEnderecos};
use crate::ports::notificacoes::{CaixaDeEntrada, NovaNotificacao};
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::vendas::{DonoCarrinho, NovoPedido, RepositorioCarrinhos, RepositorioPedidos};

#[derive(Debug, Clone)]
pub struct CheckoutInput {
    pub endereco_faturamento_id: Id<Endereco>,
    pub endereco_entrega_id: Id<Endereco>,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
}

pub struct ServicoCheckout {
    carrinhos: Arc<dyn RepositorioCarrinhos>,
    pedidos: Arc<dyn RepositorioPedidos>,
    contatos: Arc<dyn RepositorioContatos>,
    enderecos: Arc<dyn RepositorioEnderecos>,
    produtos: Arc<dyn RepositorioProdutos>,
    realtime: Arc<dyn NotificadorRealtime>,
    notificacoes: Arc<dyn CaixaDeEntrada>,
}

impl ServicoCheckout {
    pub fn novo(
        carrinhos: Arc<dyn RepositorioCarrinhos>,
        pedidos: Arc<dyn RepositorioPedidos>,
        contatos: Arc<dyn RepositorioContatos>,
        enderecos: Arc<dyn RepositorioEnderecos>,
        produtos: Arc<dyn RepositorioProdutos>,
        realtime: Arc<dyn NotificadorRealtime>,
        notificacoes: Arc<dyn CaixaDeEntrada>,
    ) -> Self {
        Self {
            carrinhos,
            pedidos,
            contatos,
            enderecos,
            produtos,
            realtime,
            notificacoes,
        }
    }

    pub async fn executar(
        &self,
        contato_id: Id<Contato>,
        input: CheckoutInput,
    ) -> Resultado<Pedido> {
        let contato = self
            .contatos
            .buscar_por_id(contato_id)
            .await?
            .filter(|c| c.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_autenticado("contato inválido"))?;

        let carrinho = self
            .carrinhos
            .obter_ou_criar(&DonoCarrinho::Contato {
                contato_id,
                empresa_id: Some(contato.empresa_id),
            })
            .await?;
        if !carrinho.esta_aberto() {
            return Err(ErroApp::conflito("carrinho não está aberto para checkout"));
        }

        let itens = self.carrinhos.itens(carrinho.id).await?;
        if itens.is_empty() {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "carrinho vazio — adicione itens antes do checkout",
            )));
        }

        let enderecos = self
            .enderecos
            .listar_por_empresa(contato.empresa_id, None)
            .await?;
        let pertence = |id: Id<Endereco>| enderecos.iter().any(|e| e.id == id);
        if !pertence(input.endereco_faturamento_id) || !pertence(input.endereco_entrega_id) {
            return Err(ErroApp::proibido(
                "endereço não pertence à empresa do contato",
            ));
        }

        let produto_ids: Vec<Id<hweld_domain::catalogo::produto::Produto>> =
            itens.iter().map(|i| i.produto_id).collect();
        let produtos = self.produtos.buscar_por_ids(&produto_ids).await?;

        // Revalidação no checkout (padrão marketplace): produto desativado ou
        // removido entre o add-to-cart e a conversão não pode entrar no pedido
        // — nem com descrição vazia. Falha com a lista dos itens indisponíveis.
        let indisponiveis: Vec<String> = itens
            .iter()
            .filter_map(|i| match produtos.iter().find(|p| p.id == i.produto_id) {
                Some(p) if p.visivel_no_catalogo() => None,
                Some(p) => Some(p.nome.clone()),
                None => Some(format!("produto {}", i.produto_id.valor())),
            })
            .collect();
        if !indisponiveis.is_empty() {
            return Err(ErroApp::conflito(format!(
                "itens indisponíveis no catálogo: {} — remova-os do carrinho para continuar",
                indisponiveis.join(", ")
            )));
        }

        let itens_pedido: Vec<ItemPedidoNovo> = itens
            .iter()
            .map(|i| {
                let produto = produtos.iter().find(|p| p.id == i.produto_id);
                ItemPedidoNovo {
                    produto_id: i.produto_id,
                    descricao: produto.map(|p| p.nome.clone()).unwrap_or_default(),
                    sku: produto.map(|p| p.sku.clone()).unwrap_or_default(),
                    quantidade: i.quantidade,
                    preco_unitario: i.preco_unitario,
                    desconto: Dinheiro::ZERO,
                }
            })
            .collect();

        let totais = calcular_totais(
            itens_pedido.iter().map(|i| i.total()),
            Dinheiro::ZERO,
            Dinheiro::ZERO,
        );

        let pedido = NovoPedido {
            empresa_id: contato.empresa_id,
            contato_id,
            endereco_faturamento_id: input.endereco_faturamento_id,
            endereco_entrega_id: input.endereco_entrega_id,
            origem: OrigemPedido::Ecommerce,
            orcamento_id: None,
            carrinho_id: Some(carrinho.id),
            vendedor_id: None,
            subtotal: totais.subtotal,
            desconto: totais.desconto,
            frete: totais.frete,
            total: totais.total,
            condicao_pagamento: input.condicao_pagamento,
            observacoes: input.observacoes,
            itens: itens_pedido,
        };

        let pedido = self.pedidos.criar_de_carrinho(pedido, carrinho.id).await?;
        // Realtime: pedido novo do e-commerce + oportunidade automática no funil CRM.
        self.realtime.publicar(EventoRealtime::novo(
            "pedido.criado",
            Audiencia::Empresa(pedido.empresa_id.valor()),
            serde_json::json!({
                "id": pedido.id.valor(),
                "numero": pedido.numero,
                "total": pedido.total,
                "origem": pedido.origem,
            }),
        ));
        self.realtime.publicar(EventoRealtime::novo(
            "oportunidade.estagio",
            Audiencia::Staff,
            serde_json::json!({
                "pedido_id": pedido.id.valor(),
                "para": "negociacao",
            }),
        ));
        // Inbox persistente — sino do backoffice + portal da empresa.
        self.notificacoes
            .notificar_staff(NovaNotificacao {
                tipo: "pedido.criado",
                titulo: format!("Novo pedido {}", pedido.numero),
                mensagem: format!("Pedido do e-commerce — total R$ {}", pedido.total),
                link: Some(format!("/vendas/pedidos/{}", pedido.id.valor())),
            })
            .await;
        self.notificacoes
            .notificar_empresa(
                pedido.empresa_id,
                NovaNotificacao {
                    tipo: "pedido.criado",
                    titulo: format!("Pedido {} registrado", pedido.numero),
                    mensagem: "Recebemos o seu pedido — acompanhe o status aqui.".to_string(),
                    link: Some(format!("/conta/pedidos/{}", pedido.id.valor())),
                },
            )
            .await;
        Ok(pedido)
    }
}
