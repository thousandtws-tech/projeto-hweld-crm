use std::sync::Arc;

use hweld_domain::catalogo::preco::preco_efetivo;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::id::Id;
use hweld_domain::vendas::carrinho::{total_carrinho, Carrinho, CarrinhoItem};
use rust_decimal::Decimal;
use serde::Serialize;
use uuid::Uuid;

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::{RepositorioProdutos, RepositorioTabelasPreco};
use crate::ports::vendas::{DonoCarrinho, RepositorioCarrinhos};

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CarrinhoDetalhe {
    #[serde(flatten)]
    pub carrinho: Carrinho,
    pub itens: Vec<CarrinhoItem>,
    pub total: Dinheiro,
}

pub struct ServicoCarrinho {
    carrinhos: Arc<dyn RepositorioCarrinhos>,
    produtos: Arc<dyn RepositorioProdutos>,
    tabelas: Arc<dyn RepositorioTabelasPreco>,
}

impl ServicoCarrinho {
    pub fn novo(
        carrinhos: Arc<dyn RepositorioCarrinhos>,
        produtos: Arc<dyn RepositorioProdutos>,
        tabelas: Arc<dyn RepositorioTabelasPreco>,
    ) -> Self {
        Self {
            carrinhos,
            produtos,
            tabelas,
        }
    }

    async fn hidratar(&self, carrinho: Carrinho) -> Resultado<CarrinhoDetalhe> {
        let itens = self.carrinhos.itens(carrinho.id).await?;
        let total = total_carrinho(&itens);
        Ok(CarrinhoDetalhe {
            carrinho,
            itens,
            total,
        })
    }

    pub async fn atual(&self, dono: &DonoCarrinho) -> Resultado<CarrinhoDetalhe> {
        let carrinho = self.carrinhos.obter_ou_criar(dono).await?;
        self.hidratar(carrinho).await
    }

    pub async fn por_uuid(&self, uuid: Uuid) -> Resultado<CarrinhoDetalhe> {
        let carrinho = self
            .carrinhos
            .buscar_por_uuid(uuid)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("carrinho", uuid))?;
        self.hidratar(carrinho).await
    }

    pub async fn adicionar_item(
        &self,
        dono: &DonoCarrinho,
        produto_id: Id<Produto>,
        quantidade: Decimal,
    ) -> Resultado<CarrinhoDetalhe> {
        let qtd = Quantidade::nova(quantidade).map_err(ErroApp::Dominio)?;
        let produto = self
            .produtos
            .buscar_por_id(produto_id)
            .await?
            .filter(|p| p.visivel_no_catalogo())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", produto_id))?;

        let carrinho = self.carrinhos.obter_ou_criar(dono).await?;
        if !carrinho.esta_aberto() {
            return Err(ErroApp::conflito(
                "carrinho já foi convertido ou abandonado",
            ));
        }

        let preco = self.preco_do_contexto(dono, &produto).await?;
        self.carrinhos
            .adicionar_item(carrinho.id, produto_id, qtd.valor(), preco)
            .await?;
        self.hidratar(carrinho).await
    }

    pub async fn atualizar_item(
        &self,
        dono: &DonoCarrinho,
        produto_id: Id<Produto>,
        quantidade: Decimal,
    ) -> Resultado<CarrinhoDetalhe> {
        let qtd = Quantidade::nova(quantidade).map_err(ErroApp::Dominio)?;
        let carrinho = self.carrinhos.obter_ou_criar(dono).await?;
        self.carrinhos
            .atualizar_item(carrinho.id, produto_id, qtd.valor())
            .await?;
        self.hidratar(carrinho).await
    }

    pub async fn remover_item(
        &self,
        dono: &DonoCarrinho,
        produto_id: Id<Produto>,
    ) -> Resultado<CarrinhoDetalhe> {
        let carrinho = self.carrinhos.obter_ou_criar(dono).await?;
        self.carrinhos.remover_item(carrinho.id, produto_id).await?;
        self.hidratar(carrinho).await
    }

    async fn preco_do_contexto(
        &self,
        dono: &DonoCarrinho,
        produto: &Produto,
    ) -> Resultado<Dinheiro> {
        let empresa_id = match dono {
            DonoCarrinho::Contato { empresa_id, .. } => *empresa_id,
            DonoCarrinho::Convidado { .. } => None,
        };
        let Some(empresa_id) = empresa_id else {
            return Ok(produto.preco_venda);
        };
        let tabela = self.tabelas.tabela_da_empresa(empresa_id).await?;
        let item = tabela
            .as_ref()
            .and_then(|(_, itens)| itens.iter().find(|i| i.produto_id == produto.id));
        Ok(preco_efetivo(
            produto,
            tabela.as_ref().map(|(t, _)| t),
            item,
        ))
    }
}
