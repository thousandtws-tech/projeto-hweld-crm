//! DTOs de request — a fronteira HTTP recebe primitivos (`i64`, `Decimal`,
//! strings) e converte para os tipos ricos do domínio (`Id<T>`, `Dinheiro`,
//! `Quantidade`) com validação, nunca contornando `::nova`/`.validar()`.

use chrono::{DateTime, NaiveDate, Utc};
use hweld_application::ports::busca::ConsultaBuscaProdutos;
use hweld_application::use_cases::checkout::CheckoutInput;
use hweld_application::ErroApp;
use hweld_domain::acesso::usuario::Perfil;
use hweld_domain::catalogo::categoria::{Categoria, CategoriaInput};
use hweld_domain::catalogo::produto::ProdutoInput;
use hweld_domain::catalogo::tabela_preco::TabelaPrecoInput;
use hweld_domain::crm::contato::ContatoInput;
use hweld_domain::crm::empresa::{Empresa, EmpresaInput, StatusEmpresa};
use hweld_domain::crm::endereco::{EnderecoInput, TipoEndereco};
use hweld_domain::crm::interacao::{InteracaoInput, TipoInteracao};
use hweld_domain::crm::oportunidade::{EstagioOportunidade, OportunidadeInput, OrigemOportunidade};
use hweld_domain::crm::orcamento::{ItemOrcamentoNovo, OrcamentoInput, StatusOrcamento};
use hweld_domain::estoque::movimentacao::TipoMovimentacao;
use hweld_domain::financeiro::caixa::TipoCaixaMovimentacao;
use hweld_domain::operacao::ordem_servico::{OrdemServicoInput, PrioridadeOs, StatusOs};
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::Paginacao;
use hweld_domain::vendas::pedido::{ItemPedidoNovo, OrigemPedido, StatusPedido};
use rust_decimal::Decimal;
use serde::Deserialize;

// ── Paginação ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryPaginacao {
    #[serde(default, deserialize_with = "de_opt_u32")]
    pub pagina: Option<u32>,
    #[serde(default, deserialize_with = "de_opt_u32")]
    pub por_pagina: Option<u32>,
}

// Query strings via `serde(flatten)` chegam como `String` — aceita "3" ou 3.
fn de_opt_u32<'de, D>(d: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Num {
        N(u32),
        S(String),
    }
    match Option::<Num>::deserialize(d)? {
        None => Ok(None),
        Some(Num::N(n)) => Ok(Some(n)),
        Some(Num::S(s)) if s.trim().is_empty() => Ok(None),
        Some(Num::S(s)) => s
            .trim()
            .parse::<u32>()
            .map(Some)
            .map_err(serde::de::Error::custom),
    }
}

impl QueryPaginacao {
    pub fn paginacao(&self) -> Result<Paginacao, ErroApp> {
        Paginacao::nova(self.pagina, self.por_pagina).map_err(ErroApp::Dominio)
    }
}

// ── Auth ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct LoginReq {
    pub email: String,
    pub senha: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct RefreshReq {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct TrocarSenhaReq {
    pub senha_atual: String,
    pub nova_senha: String,
}

// ── Usuários ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CriarUsuarioReq {
    pub nome: String,
    pub email: String,
    pub senha: String,
    pub perfil: Perfil,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct AtualizarUsuarioReq {
    pub nome: Option<String>,
    pub email: Option<String>,
    pub perfil: Option<Perfil>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct AtivoReq {
    pub ativo: bool,
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryUsuarios {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub perfil: Option<Perfil>,
    pub ativo: Option<bool>,
    pub busca: Option<String>,
}

// ── CRM ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryEmpresas {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub status: Option<StatusEmpresa>,
    pub busca: Option<String>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct EmpresaReq {
    pub razao_social: String,
    pub nome_fantasia: Option<String>,
    pub cnpj: Option<String>,
    pub inscricao_estadual: Option<String>,
    pub segmento: Option<String>,
    pub telefone: Option<String>,
    pub email: Option<String>,
    pub site: Option<String>,
    pub status: StatusEmpresa,
    pub tabela_preco_id: Option<i64>,
    pub observacoes: Option<String>,
}

impl EmpresaReq {
    pub fn input(self) -> EmpresaInput {
        EmpresaInput {
            razao_social: self.razao_social,
            nome_fantasia: self.nome_fantasia,
            cnpj: self.cnpj,
            inscricao_estadual: self.inscricao_estadual,
            segmento: self.segmento,
            telefone: self.telefone,
            email: self.email,
            site: self.site,
            status: self.status,
            tabela_preco_id: self.tabela_preco_id.map(Id::novo),
            observacoes: self.observacoes,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryContatos {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub empresa_id: Option<i64>,
    pub busca: Option<String>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ContatoReq {
    pub empresa_id: i64,
    pub nome: String,
    pub cargo: Option<String>,
    pub email: Option<String>,
    pub telefone: Option<String>,
    pub whatsapp: Option<String>,
    pub is_principal: bool,
    pub acesso_portal: bool,
    pub observacoes: Option<String>,
}

impl ContatoReq {
    pub fn input(self) -> ContatoInput {
        ContatoInput {
            empresa_id: Id::novo(self.empresa_id),
            nome: self.nome,
            cargo: self.cargo,
            email: self.email,
            telefone: self.telefone,
            whatsapp: self.whatsapp,
            is_principal: self.is_principal,
            acesso_portal: self.acesso_portal,
            observacoes: self.observacoes,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct AtivarPortalReq {
    pub senha: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct EnderecoReq {
    pub empresa_id: i64,
    pub tipo: TipoEndereco,
    pub logradouro: Option<String>,
    pub numero: Option<String>,
    pub complemento: Option<String>,
    pub bairro: Option<String>,
    pub cidade: String,
    pub uf: String,
    pub cep: String,
    pub pais: Option<String>,
    pub principal: bool,
}

impl EnderecoReq {
    pub fn input(self) -> EnderecoInput {
        EnderecoInput {
            empresa_id: Id::novo(self.empresa_id),
            tipo: self.tipo,
            logradouro: self.logradouro,
            numero: self.numero,
            complemento: self.complemento,
            bairro: self.bairro,
            cidade: self.cidade,
            uf: self.uf,
            cep: self.cep,
            pais: self.pais,
            principal: self.principal,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryEnderecos {
    pub tipo: Option<TipoEndereco>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryOportunidades {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub estagio: Option<EstagioOportunidade>,
    pub empresa_id: Option<i64>,
    pub responsavel_id: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct OportunidadeReq {
    pub empresa_id: i64,
    pub contato_id: Option<i64>,
    pub responsavel_id: i64,
    pub titulo: String,
    pub descricao: Option<String>,
    pub origem: Option<OrigemOportunidade>,
    #[schema(value_type = String)]
    pub valor_estimado: Option<Decimal>,
    pub data_prevista_fechamento: Option<NaiveDate>,
}

impl OportunidadeReq {
    pub fn input(self) -> OportunidadeInput {
        OportunidadeInput {
            empresa_id: Id::novo(self.empresa_id),
            contato_id: self.contato_id.map(Id::novo),
            responsavel_id: Id::novo(self.responsavel_id),
            titulo: self.titulo,
            descricao: self.descricao,
            origem: self.origem,
            valor_estimado: self.valor_estimado,
            data_prevista_fechamento: self.data_prevista_fechamento,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct MoverEstagioReq {
    pub estagio: EstagioOportunidade,
    pub motivo_perda: Option<String>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct InteracaoReq {
    pub empresa_id: i64,
    pub contato_id: Option<i64>,
    pub oportunidade_id: Option<i64>,
    pub tipo: TipoInteracao,
    pub assunto: Option<String>,
    pub descricao: Option<String>,
    pub ocorrido_em: Option<DateTime<Utc>>,
    pub proxima_acao: Option<String>,
    pub proxima_acao_em: Option<DateTime<Utc>>,
}

impl InteracaoReq {
    pub fn input(self, usuario_id: i64) -> InteracaoInput {
        InteracaoInput {
            empresa_id: Id::novo(self.empresa_id),
            contato_id: self.contato_id.map(Id::novo),
            oportunidade_id: self.oportunidade_id.map(Id::novo),
            usuario_id: Some(Id::novo(usuario_id)),
            tipo: self.tipo,
            assunto: self.assunto,
            descricao: self.descricao,
            ocorrido_em: self.ocorrido_em.unwrap_or_else(Utc::now),
            proxima_acao: self.proxima_acao,
            proxima_acao_em: self.proxima_acao_em,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryInteracoes {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub empresa_id: Option<i64>,
    pub oportunidade_id: Option<i64>,
    pub contato_id: Option<i64>,
}

// ── Orçamentos ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryOrcamentos {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub status: Option<StatusOrcamento>,
    pub empresa_id: Option<i64>,
    pub oportunidade_id: Option<i64>,
    pub vendedor_id: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ItemOrcamentoReq {
    pub produto_id: i64,
    pub descricao: String,
    #[schema(value_type = String)]
    pub quantidade: Decimal,
    #[schema(value_type = String)]
    pub preco_unitario: Decimal,
    #[schema(value_type = String)]
    pub desconto: Decimal,
}

impl ItemOrcamentoReq {
    pub fn item(self) -> Result<ItemOrcamentoNovo, ErroApp> {
        Ok(ItemOrcamentoNovo {
            produto_id: Id::novo(self.produto_id),
            descricao: self.descricao,
            quantidade: Quantidade::nova(self.quantidade).map_err(ErroApp::Dominio)?,
            preco_unitario: Dinheiro::nao_negativo(self.preco_unitario, "preco_unitario")
                .map_err(ErroApp::Dominio)?,
            desconto: Dinheiro::nao_negativo(self.desconto, "desconto")
                .map_err(ErroApp::Dominio)?,
        })
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct OrcamentoReq {
    pub empresa_id: i64,
    pub contato_id: Option<i64>,
    pub oportunidade_id: Option<i64>,
    pub vendedor_id: i64,
    pub valido_ate: Option<NaiveDate>,
    #[schema(value_type = String)]
    pub desconto: Decimal,
    #[schema(value_type = String)]
    pub frete: Decimal,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
    pub itens: Vec<ItemOrcamentoReq>,
}

impl OrcamentoReq {
    pub fn input(self) -> Result<OrcamentoInput, ErroApp> {
        Ok(OrcamentoInput {
            empresa_id: Id::novo(self.empresa_id),
            contato_id: self.contato_id.map(Id::novo),
            oportunidade_id: self.oportunidade_id.map(Id::novo),
            vendedor_id: Id::novo(self.vendedor_id),
            valido_ate: self.valido_ate,
            desconto: Dinheiro::nao_negativo(self.desconto, "desconto")
                .map_err(ErroApp::Dominio)?,
            frete: Dinheiro::nao_negativo(self.frete, "frete").map_err(ErroApp::Dominio)?,
            condicao_pagamento: self.condicao_pagamento,
            observacoes: self.observacoes,
            itens: self
                .itens
                .into_iter()
                .map(ItemOrcamentoReq::item)
                .collect::<Result<_, _>>()?,
        })
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ItensOrcamentoReq {
    pub itens: Vec<ItemOrcamentoReq>,
    #[schema(value_type = String)]
    pub desconto: Decimal,
    #[schema(value_type = String)]
    pub frete: Decimal,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct StatusOrcamentoReq {
    pub status: StatusOrcamento,
}

// ── Catálogo ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryProdutos {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub categoria_id: Option<i64>,
    pub busca: Option<String>,
    pub ativo: Option<bool>,
    pub destaque: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryCategorias {
    pub somente_ativas: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CategoriaReq {
    pub categoria_pai_id: Option<i64>,
    pub nome: String,
    pub slug: Option<String>,
    pub descricao: Option<String>,
    pub imagem_url: Option<String>,
    pub ordem: i32,
    pub ativa: bool,
}

impl CategoriaReq {
    pub fn input(self) -> CategoriaInput {
        CategoriaInput {
            categoria_pai_id: self.categoria_pai_id.map(Id::novo),
            nome: self.nome,
            slug: self.slug,
            descricao: self.descricao,
            imagem_url: self.imagem_url,
            ordem: self.ordem,
            ativa: self.ativa,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ProdutoReq {
    pub sku: String,
    pub nome: String,
    pub slug: Option<String>,
    pub categoria_id: i64,
    pub marca: Option<String>,
    pub unidade_medida: Option<String>,
    pub descricao_curta: Option<String>,
    pub descricao_tecnica: Option<String>,
    pub ncm: Option<String>,
    pub origem_mercadoria: Option<String>,
    #[schema(value_type = String)]
    pub peso_kg: Option<Decimal>,
    #[schema(value_type = String)]
    pub altura_cm: Option<Decimal>,
    #[schema(value_type = String)]
    pub largura_cm: Option<Decimal>,
    #[schema(value_type = String)]
    pub comprimento_cm: Option<Decimal>,
    #[schema(value_type = String)]
    pub preco_custo: Option<Decimal>,
    #[schema(value_type = String)]
    pub preco_venda: Decimal,
    #[schema(value_type = String)]
    pub estoque_minimo: Option<Decimal>,
    pub controla_estoque: bool,
    pub ativo: bool,
    pub destaque: bool,
}

impl ProdutoReq {
    pub fn input(self) -> ProdutoInput {
        ProdutoInput {
            sku: self.sku,
            nome: self.nome,
            slug: self.slug,
            categoria_id: Id::novo(self.categoria_id),
            marca: self.marca,
            unidade_medida: self.unidade_medida,
            descricao_curta: self.descricao_curta,
            descricao_tecnica: self.descricao_tecnica,
            ncm: self.ncm,
            origem_mercadoria: self.origem_mercadoria,
            peso_kg: self.peso_kg,
            altura_cm: self.altura_cm,
            largura_cm: self.largura_cm,
            comprimento_cm: self.comprimento_cm,
            preco_custo: self.preco_custo,
            preco_venda: self.preco_venda,
            estoque_minimo: self.estoque_minimo,
            controla_estoque: self.controla_estoque,
            ativo: self.ativo,
            destaque: self.destaque,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryTabelas {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub ativa: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct TabelaPrecoReq {
    pub nome: String,
    pub descricao: Option<String>,
    pub ativa: bool,
}

impl TabelaPrecoReq {
    pub fn input(self) -> TabelaPrecoInput {
        TabelaPrecoInput {
            nome: self.nome,
            descricao: self.descricao,
            ativa: self.ativa,
        }
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct PrecoItemReq {
    pub produto_id: i64,
    #[schema(value_type = String)]
    pub preco: Decimal,
}

// ── Carrinho / Checkout ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ItemCarrinhoReq {
    pub produto_id: i64,
    #[schema(value_type = String)]
    pub quantidade: Decimal,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CheckoutReq {
    pub endereco_faturamento_id: i64,
    pub endereco_entrega_id: i64,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
}

impl CheckoutReq {
    pub fn input(self) -> CheckoutInput {
        CheckoutInput {
            endereco_faturamento_id: Id::novo(self.endereco_faturamento_id),
            endereco_entrega_id: Id::novo(self.endereco_entrega_id),
            condicao_pagamento: self.condicao_pagamento,
            observacoes: self.observacoes,
        }
    }
}

// ── Pedidos ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryPedidos {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub status: Option<StatusPedido>,
    pub empresa_id: Option<i64>,
    pub contato_id: Option<i64>,
    pub origem: Option<OrigemPedido>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ItemPedidoReq {
    pub produto_id: i64,
    pub descricao: String,
    pub sku: String,
    #[schema(value_type = String)]
    pub quantidade: Decimal,
    #[schema(value_type = String)]
    pub preco_unitario: Decimal,
    #[schema(value_type = String)]
    pub desconto: Decimal,
}

impl ItemPedidoReq {
    pub fn item(self) -> Result<ItemPedidoNovo, ErroApp> {
        Ok(ItemPedidoNovo {
            produto_id: Id::novo(self.produto_id),
            descricao: self.descricao,
            sku: self.sku,
            quantidade: Quantidade::nova(self.quantidade).map_err(ErroApp::Dominio)?,
            preco_unitario: Dinheiro::nao_negativo(self.preco_unitario, "preco_unitario")
                .map_err(ErroApp::Dominio)?,
            desconto: Dinheiro::nao_negativo(self.desconto, "desconto")
                .map_err(ErroApp::Dominio)?,
        })
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct PedidoManualReq {
    pub empresa_id: i64,
    pub contato_id: i64,
    pub endereco_faturamento_id: i64,
    pub endereco_entrega_id: i64,
    pub condicao_pagamento: Option<String>,
    pub observacoes: Option<String>,
    pub itens: Vec<ItemPedidoReq>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct StatusPedidoReq {
    pub status: StatusPedido,
}

// ── Portal B2B ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryPortalPedidos {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub status: Option<StatusPedido>,
    /// `true` = só pedidos do próprio contato (padrão: empresa inteira).
    pub so_meus: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ImagemProdutoReq {
    pub url: String,
    pub alt_text: Option<String>,
    pub ordem: Option<i32>,
    pub is_principal: Option<bool>,
}

// ── Estoque ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct MovimentacaoReq {
    pub produto_id: i64,
    pub tipo: TipoMovimentacao,
    #[schema(value_type = String)]
    pub quantidade: Decimal,
    pub motivo: Option<String>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryMovimentacoes {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub produto_id: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryAbaixoMinimo {
    pub limite: Option<u32>,
}

// ── Ordens de serviço ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryOrdens {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub status: Option<StatusOs>,
    pub empresa_id: Option<i64>,
    pub pedido_id: Option<i64>,
    pub responsavel_id: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct OrdemServicoReq {
    pub pedido_id: Option<i64>,
    pub empresa_id: i64,
    pub contato_id: Option<i64>,
    pub responsavel_id: Option<i64>,
    pub descricao: Option<String>,
    pub prioridade: PrioridadeOs,
    pub prevista_em: Option<NaiveDate>,
    #[schema(value_type = String)]
    pub valor_mao_obra: Option<Decimal>,
    pub observacoes: Option<String>,
}

impl OrdemServicoReq {
    pub fn input(self) -> Result<OrdemServicoInput, ErroApp> {
        Ok(OrdemServicoInput {
            pedido_id: self.pedido_id.map(Id::novo),
            empresa_id: Id::novo(self.empresa_id),
            contato_id: self.contato_id.map(Id::novo),
            responsavel_id: self.responsavel_id.map(Id::novo),
            descricao: self.descricao,
            prioridade: self.prioridade,
            prevista_em: self.prevista_em,
            valor_mao_obra: self
                .valor_mao_obra
                .map(|v| Dinheiro::nao_negativo(v, "valor_mao_obra"))
                .transpose()
                .map_err(ErroApp::Dominio)?,
            observacoes: self.observacoes,
        })
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ItemOsReq {
    pub produto_id: i64,
    #[schema(value_type = String)]
    pub quantidade: Decimal,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct StatusOsReq {
    pub status: StatusOs,
    pub observacao: Option<String>,
}

// ── Fiscal ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryNotasFiscais {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub status: Option<hweld_domain::fiscal::nota_fiscal::StatusNotaFiscal>,
    pub empresa_id: Option<i64>,
    pub pedido_id: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct EmitirNfReq {
    pub pedido_id: i64,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CancelarNfReq {
    pub motivo: String,
}

// ── Financeiro ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryPagamentos {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub pedido_id: Option<i64>,
    pub status: Option<hweld_domain::vendas::pagamento::StatusPagamento>,
    pub vencidos_em: Option<NaiveDate>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ParcelasReq {
    pub pedido_id: i64,
    pub quantidade: u32,
    pub primeiro_vencimento: NaiveDate,
    pub intervalo_dias: Option<i64>,
    pub forma_pagamento_id: Option<i64>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct BaixarPagamentoReq {
    pub forma_pagamento_id: i64,
    pub observacao: Option<String>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct EstornarPagamentoReq {
    pub motivo: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct AbrirCaixaReq {
    #[schema(value_type = String)]
    pub valor_abertura: Decimal,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct LancarCaixaReq {
    pub tipo: TipoCaixaMovimentacao,
    #[schema(value_type = String)]
    pub valor: Decimal,
    pub forma_pagamento_id: Option<i64>,
    pub descricao: Option<String>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct FecharCaixaReq {
    #[schema(value_type = String)]
    pub valor_informado: Decimal,
}

// ── Auditoria ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryAuditoria {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    pub entidade: Option<String>,
    pub entidade_id: Option<i64>,
    pub usuario_id: Option<i64>,
}

// ── Busca ───────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QueryBusca {
    #[serde(flatten)]
    pub pag: QueryPaginacao,
    /// Texto livre — fuzzy + relevância.
    pub q: Option<String>,
    pub categoria_id: Option<i64>,
    pub marca: Option<String>,
    #[schema(value_type = String)]
    pub preco_min: Option<Decimal>,
    #[schema(value_type = String)]
    pub preco_max: Option<Decimal>,
}

impl QueryBusca {
    pub fn consulta(&self) -> hweld_application::Resultado<ConsultaBuscaProdutos> {
        Ok(ConsultaBuscaProdutos {
            q: self.q.clone(),
            categoria_id: self.categoria_id.map(Id::novo),
            marca: self.marca.clone(),
            preco_min: self
                .preco_min
                .map(|v| Dinheiro::nao_negativo(v, "preco_min"))
                .transpose()
                .map_err(ErroApp::Dominio)?,
            preco_max: self
                .preco_max
                .map(|v| Dinheiro::nao_negativo(v, "preco_max"))
                .transpose()
                .map_err(ErroApp::Dominio)?,
            somente_ativos: false,
            paginacao: self.pag.paginacao()?,
        })
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema, utoipa::IntoParams)]
pub struct QuerySugestoes {
    /// Prefixo digitado — mínimo de 2 caracteres responde no serviço.
    pub q: String,
    pub limite: Option<u32>,
}

// Reuso: `Empresa`/`Categoria` importados acima para os tipos dos filtros.
#[allow(dead_code)]
fn _tipos(_: Option<Id<Empresa>>, _: Option<Id<Categoria>>) {}
