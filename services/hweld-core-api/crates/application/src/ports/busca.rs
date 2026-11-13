//! Port do motor de busca — abstrai Elasticsearch/qualquer engine de
//! full-text. A aplicação fala em produtos, facetas e sugestões; a
//! infraestrutura traduz para DSL de query.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_domain::catalogo::categoria::Categoria;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Paginacao;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::Serialize;

use hweld_domain::shared::erro::ErroDominio;

use crate::erro::{ErroApp, Resultado};

/// Documento indexado — só o que a busca precisa, desnormalizado.
/// `categoria_nome`/`marca` vão como keyword para facetas; `preco` é
/// `f64` para `range`/`stats` numéricos (o índice não é fonte monetária).
#[derive(Debug, Clone, Serialize)]
pub struct DocumentoProduto {
    pub produto_id: i64,
    pub sku: String,
    pub nome: String,
    pub descricao: Option<String>,
    pub categoria_id: i64,
    pub categoria_nome: Option<String>,
    pub marca: Option<String>,
    pub preco: f64,
    pub ativo: bool,
    pub destaque: bool,
    pub criado_em: DateTime<Utc>,
}

impl DocumentoProduto {
    /// Constrói a partir da entidade — o nome da categoria é resolvido
    /// pelo chamador (evita round-trip por produto no bulk).
    pub fn novo(produto: &Produto, categoria_nome: Option<String>) -> Self {
        Self {
            produto_id: produto.id.valor(),
            sku: produto.sku.clone(),
            nome: produto.nome.clone(),
            descricao: produto
                .descricao_curta
                .clone()
                .or_else(|| produto.descricao_tecnica.clone()),
            categoria_id: produto.categoria_id.valor(),
            categoria_nome,
            marca: produto.marca.clone(),
            preco: produto.preco_venda.valor().to_f64().unwrap_or(0.0),
            ativo: produto.visivel_no_catalogo(),
            destaque: produto.destaque,
            criado_em: produto.created_at,
        }
    }
}

/// Ordenação dos resultados — `Relevancia` usa `_score` do motor
/// desempatado por destaque/recência; as demais são ordens de
/// marketplace aplicadas sobre campos keyword do índice.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum OrdenacaoBusca {
    #[default]
    Relevancia,
    MenorPreco,
    MaiorPreco,
    NomeAZ,
    Recentes,
}

impl std::str::FromStr for OrdenacaoBusca {
    type Err = ErroApp;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "relevancia" => Ok(Self::Relevancia),
            "menor_preco" => Ok(Self::MenorPreco),
            "maior_preco" => Ok(Self::MaiorPreco),
            "nome_az" => Ok(Self::NomeAZ),
            "recentes" => Ok(Self::Recentes),
            _ => Err(ErroApp::Dominio(ErroDominio::ValorInvalido {
                campo: "ordem",
                mensagem: format!("ordenacao desconhecida: '{s}'"),
            })),
        }
    }
}

/// Consulta de busca do catálogo — texto livre + filtros/facetas.
#[derive(Debug, Clone, Default)]
pub struct ConsultaBuscaProdutos {
    /// Texto livre — `None` = listar tudo (match_all) com filtros.
    pub q: Option<String>,
    pub categoria_id: Option<Id<Categoria>>,
    pub marca: Option<String>,
    pub preco_min: Option<Dinheiro>,
    pub preco_max: Option<Dinheiro>,
    pub somente_ativos: bool,
    pub ordenacao: OrdenacaoBusca,
    pub paginacao: Paginacao,
}

/// Hit bruto do índice — a aplicação hidrata com o produto canônico do
/// Postgres (ES é índice secundário, não fonte de verdade).
#[derive(Debug, Clone)]
pub struct HitBusca {
    pub produto_id: Id<Produto>,
    pub score: f64,
}

/// Faceta contável — usada para filtros com contagem em tempo real.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct FacetaContagem {
    /// Valor bruto do bucket (id de categoria ou nome da marca).
    pub valor: String,
    /// Rótulo amigável quando resolvido (nome da categoria).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotulo: Option<String>,
    pub contagem: u64,
}

/// Conjunto de facetas retornado junto com os hits.
#[derive(Debug, Clone, Default, Serialize, utoipa::ToSchema)]
pub struct Facetas {
    pub categorias: Vec<FacetaContagem>,
    pub marcas: Vec<FacetaContagem>,
    /// Faixa de preço observada nos resultados — alimenta slider na UI.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = String)]
    pub preco_min: Option<Decimal>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = String)]
    pub preco_max: Option<Decimal>,
}

/// Resultado bruto do motor — ordem dos hits é a ordem de relevância.
#[derive(Debug, Clone)]
pub struct ResultadoMotor {
    pub hits: Vec<HitBusca>,
    pub total: i64,
    pub facetas: Facetas,
    /// "Você quis dizer?" — termo corrigido pelo suggester do motor,
    /// `Some` só quando difere do texto consultado.
    pub correcao: Option<String>,
}

/// Sugestão de autocomplete — leve, para dropdowns de "digite e ache".
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct SugestaoProduto {
    pub produto_id: i64,
    pub nome: String,
    pub sku: String,
}

/// Contrato do motor de busca — implementado pelo adapter Elasticsearch.
/// Indexação é best-effort: falhas são logadas, nunca quebram o CRUD
/// (ES é projeção; `reindexar` reconstrói).
#[async_trait]
pub trait MotorBusca: Send + Sync {
    async fn buscar_produtos(&self, consulta: &ConsultaBuscaProdutos) -> Resultado<ResultadoMotor>;

    async fn sugerir_produtos(&self, prefixo: &str, limite: u32)
        -> Resultado<Vec<SugestaoProduto>>;

    async fn indexar_produto(&self, doc: &DocumentoProduto) -> Resultado<()>;

    /// Bulk — retorna quantos docs foram indexados com sucesso.
    async fn indexar_produtos(&self, docs: &[DocumentoProduto]) -> Resultado<u64>;

    /// Remove do índice — 404 (já ausente) é sucesso.
    async fn remover_produto(&self, produto_id: Id<Produto>) -> Resultado<()>;

    /// Destrói e recria o índice — chamado antes de uma reindexação
    /// completa para eliminar documentos de produtos removidos.
    /// (Em produção, o padrão é blue-green com alias; aqui o rebuild é
    /// direto e aceita uma janela curta de indisponibilidade.)
    async fn recriar_indice(&self) -> Resultado<()>;
}

/// Operação de índice pendente — enfileirada quando o best-effort falha.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperacaoBusca {
    Indexar,
    Remover,
}

impl OperacaoBusca {
    pub fn como_str(self) -> &'static str {
        match self {
            Self::Indexar => "indexar",
            Self::Remover => "remover",
        }
    }

    pub fn de_str(s: &str) -> Self {
        match s {
            "remover" => Self::Remover,
            _ => Self::Indexar,
        }
    }
}

/// Linha da outbox de busca aguardando reprocessamento pelo relay.
#[derive(Debug, Clone)]
pub struct PendenciaBusca {
    pub id: i64,
    pub produto_id: Id<Produto>,
    pub operacao: OperacaoBusca,
    pub tentativas: i32,
}

/// Outbox de sincronização do índice de busca — falhas do motor viram
/// linhas que um relay reprocessa com backoff quadrático até `morto`
/// (8 tentativas). Garante que um ES instável não perde atualizações
/// silenciosamente entre `reindexar` completos.
#[async_trait]
pub trait RepositorioBuscaPendentes: Send + Sync {
    /// Enfileira a operação para retry (chamado no caminho de falha do
    /// best-effort — nunca falha o caso de uso se o próprio insert falhar,
    /// o chamador apenas loga).
    async fn enfileirar(
        &self,
        produto_id: Id<Produto>,
        operacao: OperacaoBusca,
        erro: &str,
    ) -> Resultado<()>;

    /// Pendências vencidas (`proximo_retry <= now`, não mortas), da mais
    /// antiga para a mais nova.
    async fn vencidos(&self, limite: u32) -> Resultado<Vec<PendenciaBusca>>;

    /// Reprocessamento bem-sucedido — remove a linha.
    async fn concluir(&self, id: i64) -> Resultado<()>;

    /// Falha no reprocessamento — incrementa tentativas, agenda o próximo
    /// retry com backoff quadrático e marca `morto` na 8ª.
    async fn falhar(&self, id: i64, erro: &str) -> Resultado<()>;
}
