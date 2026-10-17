use std::collections::HashMap;
use std::sync::Arc;

use hweld_domain::catalogo::preco::preco_efetivo;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::id::Id;
use hweld_domain::vendas::carrinho::{Carrinho, CarrinhoItem, total_carrinho};
use rust_decimal::Decimal;
use serde::Serialize;
use uuid::Uuid;

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::{RepositorioProdutos, RepositorioTabelasPreco};
use crate::ports::vendas::{DonoCarrinho, RepositorioCarrinhos};

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ResumoProdutoCarrinho {
    pub nome: String,
    pub sku: String,
    pub slug: String,
    pub imagem_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CarrinhoItemDetalhe {
    #[serde(flatten)]
    pub item: CarrinhoItem,
    pub produto: Option<ResumoProdutoCarrinho>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CarrinhoDetalhe {
    #[serde(flatten)]
    pub carrinho: Carrinho,
    pub itens: Vec<CarrinhoItemDetalhe>,
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
        let itens_crus = self.carrinhos.itens(carrinho.id).await?;
        let total = total_carrinho(&itens_crus);
        let ids: Vec<Id<Produto>> = itens_crus.iter().map(|i| i.produto_id).collect();
        let produtos_lista = self.produtos.buscar_por_ids(&ids).await.unwrap_or_default();
        let imagens_lista = self
            .produtos
            .listar_imagens_por_produtos(&ids)
            .await
            .unwrap_or_default();

        let mapa_prod: HashMap<Id<Produto>, Produto> =
            produtos_lista.into_iter().map(|p| (p.id, p)).collect();
        let mut mapa_img: HashMap<Id<Produto>, String> = HashMap::new();
        for img in imagens_lista {
            mapa_img.entry(img.produto_id).or_insert(img.url);
        }

        let itens = itens_crus
            .into_iter()
            .map(|item| {
                let prod = mapa_prod
                    .get(&item.produto_id)
                    .map(|p| ResumoProdutoCarrinho {
                        nome: p.nome.clone(),
                        sku: p.sku.clone(),
                        slug: p.slug.clone(),
                        imagem_url: mapa_img.get(&p.id).cloned(),
                    });
                CarrinhoItemDetalhe {
                    item,
                    produto: prod,
                }
            })
            .collect();

        Ok(CarrinhoDetalhe {
            carrinho,
            itens,
            total,
        })
    }

    /// Mescla itens de um carrinho de convidado (`session_id`) no carrinho do contato ao logar.
    pub async fn mesclar_convidado(
        &self,
        session_id: &str,
        dono_contato: &DonoCarrinho,
    ) -> Resultado<()> {
        if session_id.is_empty() {
            return Ok(());
        }
        let dono_guest = DonoCarrinho::Convidado {
            session_id: session_id.to_string(),
        };
        let Ok(c_guest) = self.carrinhos.obter_ou_criar(&dono_guest).await else {
            return Ok(());
        };
        let itens_guest = self.carrinhos.itens(c_guest.id).await.unwrap_or_default();
        if itens_guest.is_empty() {
            return Ok(());
        }
        for i in itens_guest {
            let _ = self
                .adicionar_item(dono_contato, i.produto_id, i.quantidade.valor())
                .await;
            let _ = self.carrinhos.remover_item(c_guest.id, i.produto_id).await;
        }
        Ok(())
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
