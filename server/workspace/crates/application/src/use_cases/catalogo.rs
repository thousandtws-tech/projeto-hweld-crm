use std::sync::Arc;

use chrono::{DateTime, Utc};
use hweld_domain::catalogo::categoria::{validar_hierarquia, Categoria, CategoriaInput};
use hweld_domain::catalogo::preco::preco_efetivo;
use hweld_domain::catalogo::produto::{Produto, ProdutoImagem, ProdutoInput};
use hweld_domain::catalogo::tabela_preco::{TabelaPreco, TabelaPrecoInput, TabelaPrecoItem};
use hweld_domain::crm::empresa::Empresa;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::erro::{ErroApp, Resultado};
use crate::ports::busca::MotorBusca;
use crate::ports::catalogo::{
    FiltroProdutos, RepositorioCategorias, RepositorioProdutos, RepositorioTabelasPreco,
};
use crate::ports::crm::RepositorioEmpresas;
use crate::ports::estoque::RepositorioEstoque;
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::use_cases::busca::{desindexar_best_effort, indexar_best_effort};

pub struct ServicoCategorias {
    categorias: Arc<dyn RepositorioCategorias>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoCategorias {
    pub fn novo(
        categorias: Arc<dyn RepositorioCategorias>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            categorias,
            realtime,
        }
    }

    pub async fn listar(&self, somente_ativas: bool) -> Resultado<Vec<Categoria>> {
        self.categorias.listar_todas(somente_ativas).await
    }

    pub async fn criar(&self, input: CategoriaInput) -> Resultado<Categoria> {
        let input = input.validar()?;
        self.garantir_pai(input.categoria_pai_id, None).await?;
        let criada = self.categorias.criar(input).await?;
        // Catálogo é público para todos os contextos — mega-menu e árvore
        // do admin atualizam sem refresh.
        self.realtime.publicar(EventoRealtime::novo(
            "catalogo.categorias",
            Audiencia::Todos,
            serde_json::json!({ "id": criada.id.valor() }),
        ));
        Ok(criada)
    }

    pub async fn atualizar(
        &self,
        id: Id<Categoria>,
        input: CategoriaInput,
    ) -> Resultado<Categoria> {
        let input = input.validar()?;
        self.garantir_pai(input.categoria_pai_id, Some(id)).await?;
        let atualizada = self.categorias.atualizar(id, input).await?;
        self.realtime.publicar(EventoRealtime::novo(
            "catalogo.categorias",
            Audiencia::Todos,
            serde_json::json!({ "id": atualizada.id.valor() }),
        ));
        Ok(atualizada)
    }

    async fn garantir_pai(
        &self,
        pai: Option<Id<Categoria>>,
        proprio: Option<Id<Categoria>>,
    ) -> Resultado<()> {
        let Some(pai) = pai else { return Ok(()) };
        validar_hierarquia(proprio, Some(pai))?;
        self.categorias
            .buscar_por_id(pai)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("categoria", pai))?;
        if let Some(proprio) = proprio {
            if self.categorias.eh_descendente(pai, proprio).await? {
                return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                    "categoria pai não pode ser descendente da própria categoria (ciclo)",
                )));
            }
        }
        Ok(())
    }
}

// ── Produtos ────────────────────────────────────────────────────────────────

pub struct ServicoProdutos {
    produtos: Arc<dyn RepositorioProdutos>,
    categorias: Arc<dyn RepositorioCategorias>,
    /// Motor de busca opcional — sincronização best-effort pós-commit.
    busca: Option<Arc<dyn MotorBusca>>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoProdutos {
    pub fn novo(
        produtos: Arc<dyn RepositorioProdutos>,
        categorias: Arc<dyn RepositorioCategorias>,
        busca: Option<Arc<dyn MotorBusca>>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            produtos,
            categorias,
            busca,
            realtime,
        }
    }

    pub async fn buscar(&self, id: Id<Produto>) -> Resultado<(Produto, Vec<ProdutoImagem>)> {
        let produto = self
            .produtos
            .buscar_por_id(id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", id))?;
        let imagens = self.produtos.listar_imagens(id).await?;
        Ok((produto, imagens))
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroProdutos,
    ) -> Resultado<Pagina<Produto>> {
        self.produtos.listar(paginacao, filtro).await
    }

    pub async fn criar(&self, input: ProdutoInput) -> Resultado<Produto> {
        let input = input.validar()?;
        self.categorias
            .buscar_por_id(input.categoria_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("categoria", input.categoria_id))?;
        if self.produtos.buscar_por_sku(&input.sku).await?.is_some() {
            return Err(ErroApp::conflito(format!(
                "SKU {} já cadastrado",
                input.sku
            )));
        }
        let produto = self.produtos.criar(input).await?;
        indexar_best_effort(&self.busca, &self.categorias, &produto).await;
        self.realtime.publicar(EventoRealtime::novo(
            "catalogo.produtos",
            Audiencia::Todos,
            serde_json::json!({ "id": produto.id.valor() }),
        ));
        Ok(produto)
    }

    pub async fn atualizar(&self, id: Id<Produto>, input: ProdutoInput) -> Resultado<Produto> {
        let input = input.validar()?;
        let atual = self
            .produtos
            .buscar_por_id(id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", id))?;
        if input.sku != atual.sku && self.produtos.buscar_por_sku(&input.sku).await?.is_some() {
            return Err(ErroApp::conflito(format!(
                "SKU {} já cadastrado",
                input.sku
            )));
        }
        let produto = self.produtos.atualizar(id, input).await?;
        indexar_best_effort(&self.busca, &self.categorias, &produto).await;
        self.realtime.publicar(EventoRealtime::novo(
            "catalogo.produtos",
            Audiencia::Todos,
            serde_json::json!({ "id": produto.id.valor() }),
        ));
        Ok(produto)
    }

    pub async fn arquivar(&self, id: Id<Produto>) -> Resultado<()> {
        self.produtos.arquivar(id).await?;
        desindexar_best_effort(&self.busca, id).await;
        self.realtime.publicar(EventoRealtime::novo(
            "catalogo.produtos",
            Audiencia::Todos,
            serde_json::json!({ "id": id.valor() }),
        ));
        Ok(())
    }

    // ── Imagens (admin) ─────────────────────────────────────────────────────

    /// Imagens do produto — falha com 404 se o produto não existir.
    pub async fn imagens(&self, produto_id: Id<Produto>) -> Resultado<Vec<ProdutoImagem>> {
        self.produtos
            .buscar_por_id(produto_id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", produto_id))?;
        self.produtos.listar_imagens(produto_id).await
    }

    /// Registra imagem por URL externa (v1 — sem upload binário).
    /// `principal` é garantido único pelo repositório (transação limpa as demais).
    pub async fn adicionar_imagem(
        &self,
        produto_id: Id<Produto>,
        url: &str,
        alt_text: Option<&str>,
        ordem: Option<i32>,
        principal: bool,
    ) -> Resultado<ProdutoImagem> {
        self.produtos
            .buscar_por_id(produto_id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", produto_id))?;
        let url = url.trim();
        let url_ok =
            url.len() <= 2000 && (url.starts_with("https://") || url.starts_with("http://"));
        if !url_ok {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::valor_invalido(
                "url",
                "URL de imagem deve ser http(s) com até 2000 caracteres",
            )));
        }
        let ordem = match ordem {
            Some(o) => o,
            // Sem ordem explícita: vai para o fim da galeria.
            None => {
                self.produtos
                    .listar_imagens(produto_id)
                    .await?
                    .iter()
                    .map(|i| i.ordem)
                    .max()
                    .unwrap_or(-1)
                    + 1
            }
        };
        self.produtos
            .adicionar_imagem(produto_id, url, alt_text, ordem, principal)
            .await
    }

    /// Remove imagem — 404 se não pertencer ao produto do path (não revela
    /// existência de imagem de outro produto).
    pub async fn remover_imagem(
        &self,
        produto_id: Id<Produto>,
        imagem_id: Id<ProdutoImagem>,
    ) -> Resultado<()> {
        let pertence = self
            .produtos
            .listar_imagens(produto_id)
            .await?
            .iter()
            .any(|i| i.id == imagem_id);
        if !pertence {
            return Err(ErroApp::nao_encontrado("imagem", imagem_id));
        }
        self.produtos.remover_imagem(imagem_id).await
    }
}

// ── Tabelas de preço ────────────────────────────────────────────────────────

pub struct ServicoTabelasPreco {
    tabelas: Arc<dyn RepositorioTabelasPreco>,
    produtos: Arc<dyn RepositorioProdutos>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoTabelasPreco {
    pub fn novo(
        tabelas: Arc<dyn RepositorioTabelasPreco>,
        produtos: Arc<dyn RepositorioProdutos>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            tabelas,
            produtos,
            realtime,
        }
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        ativa: Option<bool>,
    ) -> Resultado<Pagina<TabelaPreco>> {
        self.tabelas.listar(paginacao, ativa).await
    }

    pub async fn buscar(
        &self,
        id: Id<TabelaPreco>,
    ) -> Resultado<(TabelaPreco, Vec<TabelaPrecoItem>)> {
        let tabela = self
            .tabelas
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("tabela_preco", id))?;
        let itens = self.tabelas.listar_itens(id).await?;
        Ok((tabela, itens))
    }

    pub async fn criar(&self, input: TabelaPrecoInput) -> Resultado<TabelaPreco> {
        self.tabelas.criar(input.validar()?).await
    }

    pub async fn atualizar(
        &self,
        id: Id<TabelaPreco>,
        input: TabelaPrecoInput,
    ) -> Resultado<TabelaPreco> {
        self.tabelas.atualizar(id, input.validar()?).await
    }

    /// Preço definido muda o `preco_efetivo` do portal — notifica todo mundo
    /// (o front revalida o catálogo; quem não tem essa tabela ignora).
    pub async fn definir_preco(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
        preco: Dinheiro,
    ) -> Resultado<TabelaPrecoItem> {
        self.produtos
            .buscar_por_id(produto_id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", produto_id))?;
        let item = self
            .tabelas
            .definir_preco(tabela_id, produto_id, preco)
            .await?;
        self.realtime.publicar(EventoRealtime::novo(
            "catalogo.precos",
            Audiencia::Todos,
            serde_json::json!({
                "tabela_id": tabela_id.valor(),
                "produto_id": produto_id.valor(),
            }),
        ));
        Ok(item)
    }

    pub async fn remover_item(
        &self,
        tabela_id: Id<TabelaPreco>,
        produto_id: Id<Produto>,
    ) -> Resultado<()> {
        self.tabelas.remover_item(tabela_id, produto_id).await?;
        self.realtime.publicar(EventoRealtime::novo(
            "catalogo.precos",
            Audiencia::Todos,
            serde_json::json!({
                "tabela_id": tabela_id.valor(),
                "produto_id": produto_id.valor(),
            }),
        ));
        Ok(())
    }
}

// ── Vitrine do portal B2B ───────────────────────────────────────────────────

/// Produto serializado para o portal — nunca expõe `preco_custo`,
/// `estoque_minimo`, `controla_estoque` ou metadados internos (`deleted_at`).
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ProdutoPortal {
    pub id: Id<Produto>,
    pub sku: String,
    pub nome: String,
    pub slug: String,
    pub categoria_id: Id<Categoria>,
    pub marca: Option<String>,
    pub unidade_medida: Option<String>,
    pub descricao_curta: Option<String>,
    pub descricao_tecnica: Option<String>,
    pub ncm: Option<String>,
    pub origem_mercadoria: String,
    #[schema(value_type = String)]
    pub peso_kg: Option<Decimal>,
    #[schema(value_type = String)]
    pub altura_cm: Option<Decimal>,
    #[schema(value_type = String)]
    pub largura_cm: Option<Decimal>,
    #[schema(value_type = String)]
    pub comprimento_cm: Option<Decimal>,
    pub preco_venda: Dinheiro,
    pub destaque: bool,
    pub created_at: DateTime<Utc>,
}

impl From<Produto> for ProdutoPortal {
    fn from(p: Produto) -> Self {
        Self {
            id: p.id,
            sku: p.sku,
            nome: p.nome,
            slug: p.slug,
            categoria_id: p.categoria_id,
            marca: p.marca,
            unidade_medida: p.unidade_medida,
            descricao_curta: p.descricao_curta,
            descricao_tecnica: p.descricao_tecnica,
            ncm: p.ncm,
            origem_mercadoria: p.origem_mercadoria,
            peso_kg: p.peso_kg,
            altura_cm: p.altura_cm,
            largura_cm: p.largura_cm,
            comprimento_cm: p.comprimento_cm,
            preco_venda: p.preco_venda,
            destaque: p.destaque,
            created_at: p.created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ItemCatalogoPortal {
    #[serde(flatten)]
    pub produto: ProdutoPortal,
    pub preco_efetivo: Dinheiro,
}

/// PDP do portal — item precificado + galeria + disponibilidade binária
/// (o saldo exato nunca sai do backoffice).
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ProdutoDetalhePortal {
    #[serde(flatten)]
    pub item: ItemCatalogoPortal,
    pub imagens: Vec<ProdutoImagem>,
    pub disponivel: bool,
}

pub struct ServicoCatalogoPortal {
    produtos: Arc<dyn RepositorioProdutos>,
    tabelas: Arc<dyn RepositorioTabelasPreco>,
    empresas: Arc<dyn RepositorioEmpresas>,
    estoque: Arc<dyn RepositorioEstoque>,
}

impl ServicoCatalogoPortal {
    pub fn novo(
        produtos: Arc<dyn RepositorioProdutos>,
        tabelas: Arc<dyn RepositorioTabelasPreco>,
        empresas: Arc<dyn RepositorioEmpresas>,
        estoque: Arc<dyn RepositorioEstoque>,
    ) -> Self {
        Self {
            produtos,
            tabelas,
            empresas,
            estoque,
        }
    }

    /// Tabela de preço vigente da empresa (None = preço de venda padrão).
    async fn tabela_da_empresa(
        &self,
        empresa_id: Id<Empresa>,
    ) -> Resultado<Option<(TabelaPreco, Vec<TabelaPrecoItem>)>> {
        let empresa = self
            .empresas
            .buscar_por_id(empresa_id)
            .await?
            .filter(|e| e.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("empresa", empresa_id))?;
        match empresa.tabela_preco_id {
            Some(_) => self.tabelas.tabela_da_empresa(empresa_id).await,
            None => Ok(None),
        }
    }

    fn item_com_preco(
        produto: Produto,
        tabela: &Option<(TabelaPreco, Vec<TabelaPrecoItem>)>,
    ) -> ItemCatalogoPortal {
        let item = tabela
            .as_ref()
            .and_then(|(_, itens)| itens.iter().find(|i| i.produto_id == produto.id));
        ItemCatalogoPortal {
            preco_efetivo: preco_efetivo(&produto, tabela.as_ref().map(|(t, _)| t), item),
            produto: produto.into(),
        }
    }

    pub async fn catalogo(
        &self,
        empresa_id: Id<Empresa>,
        paginacao: Paginacao,
        filtro: FiltroProdutos,
    ) -> Resultado<Pagina<ItemCatalogoPortal>> {
        let tabela = self.tabela_da_empresa(empresa_id).await?;
        let pagina = self
            .produtos
            .listar(
                paginacao,
                FiltroProdutos {
                    ativo: Some(true),
                    ..filtro
                },
            )
            .await?;
        let itens = pagina
            .itens
            .into_iter()
            .map(|p| Self::item_com_preco(p, &tabela))
            .collect();

        Ok(Pagina::nova(itens, pagina.total, paginacao))
    }

    /// PDP — aceita `123`, `123-slug` ou `slug` puro (o front usa URLs
    /// amigáveis `/p/{id}-{slug}`; o slug é cosmético e o id decide).
    /// 404 para inexistente, inativo ou deletado — sem distinguir o caso.
    pub async fn produto(
        &self,
        empresa_id: Id<Empresa>,
        referencia: &str,
    ) -> Resultado<ProdutoDetalhePortal> {
        let prefixo = referencia.split('-').next().unwrap_or("");
        let produto = match prefixo.parse::<i64>() {
            Ok(id) => self.produtos.buscar_por_id(Id::novo(id)).await?,
            Err(_) => self.produtos.buscar_por_slug(referencia).await?,
        };
        let produto = produto
            .filter(|p| p.visivel_no_catalogo())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", referencia))?;

        let tabela = self.tabela_da_empresa(empresa_id).await?;
        let imagens = self.produtos.listar_imagens(produto.id).await?;
        let disponivel = if produto.controla_estoque {
            self.estoque.saldo(produto.id).await?.quantidade_disponivel > Decimal::ZERO
        } else {
            true
        };
        let item = Self::item_com_preco(produto, &tabela);
        Ok(ProdutoDetalhePortal {
            item,
            imagens,
            disponivel,
        })
    }
}
