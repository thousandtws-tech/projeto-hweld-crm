//! `produtos` + `produto_imagens` — catálogo (produtos, insumos, suprimentos).

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use uuid::Uuid;

use crate::shared::dinheiro::Dinheiro;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

use super::categoria::Categoria;

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Produto {
    pub id: Id<Produto>,
    /// Identificador externo opaco (URLs) — nunca expõe o id sequencial.
    pub public_id: Uuid,
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
    pub preco_custo: Option<Dinheiro>,
    pub preco_venda: Dinheiro,
    #[schema(value_type = String)]
    pub estoque_minimo: Option<Decimal>,
    pub controla_estoque: bool,
    pub ativo: bool,
    pub destaque: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Produto {
    /// Visível na vitrine do portal B2B.
    pub fn visivel_no_catalogo(&self) -> bool {
        self.ativo && self.deleted_at.is_none()
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ProdutoImagem {
    pub id: Id<ProdutoImagem>,
    pub produto_id: Id<Produto>,
    pub url: String,
    pub alt_text: Option<String>,
    pub ordem: i32,
    pub is_principal: bool,
}

#[derive(Debug, Clone)]
pub struct ProdutoInput {
    pub sku: String,
    pub nome: String,
    pub slug: Option<String>,
    pub categoria_id: Id<Categoria>,
    pub marca: Option<String>,
    pub unidade_medida: Option<String>,
    pub descricao_curta: Option<String>,
    pub descricao_tecnica: Option<String>,
    pub ncm: Option<String>,
    pub origem_mercadoria: Option<String>,
    pub peso_kg: Option<Decimal>,
    pub altura_cm: Option<Decimal>,
    pub largura_cm: Option<Decimal>,
    pub comprimento_cm: Option<Decimal>,
    pub preco_custo: Option<Decimal>,
    pub preco_venda: Decimal,
    pub estoque_minimo: Option<Decimal>,
    pub controla_estoque: bool,
    pub ativo: bool,
    pub destaque: bool,
}

impl ProdutoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let sku = v.validar("sku", texto::obrigatorio("sku", &self.sku, 60));
        let nome = v.validar("nome", texto::obrigatorio("nome", &self.nome, 200));
        let slug = match self.slug.as_deref() {
            Some(s) => v.validar("slug", texto::slug("slug", s, 220)),
            None => nome.as_ref().and_then(|n| texto::slug("slug", n, 220).ok()),
        };
        // Campos VARCHAR com teto no banco — falha aqui é 400, não 500.
        let descricao_curta = v.validar(
            "descricao_curta",
            texto::opcional(self.descricao_curta.as_deref(), "descricao_curta", 500),
        );
        let marca = v.validar(
            "marca",
            texto::opcional(self.marca.as_deref(), "marca", 80),
        );
        let unidade_medida = v.validar(
            "unidade_medida",
            texto::opcional(self.unidade_medida.as_deref(), "unidade_medida", 6),
        );
        let preco = v.validar(
            "preco_venda",
            Dinheiro::nao_negativo(self.preco_venda, "preco_venda"),
        );
        let custo = v.validar_opcional(
            "preco_custo",
            self.preco_custo
                .map(|c| Dinheiro::nao_negativo(c, "preco_custo")),
        );
        if let (Some(c), Some(p)) = (self.preco_custo, Some(self.preco_venda)) {
            v.regra("preco_venda", p >= c, "preço de venda abaixo do custo");
        }
        if let Some(ncm) = self.ncm.as_deref() {
            v.regra(
                "ncm",
                ncm.chars().filter(char::is_ascii_digit).count() == 8,
                "NCM deve ter 8 dígitos",
            );
        }
        v.finish()?;

        let _ = (preco, custo); // valores validados aplicados abaixo
        Ok(Self {
            sku: sku.unwrap().to_uppercase(),
            nome: nome.unwrap(),
            slug,
            descricao_curta: descricao_curta.flatten(),
            marca: marca.flatten(),
            unidade_medida: unidade_medida.flatten(),
            origem_mercadoria: self.origem_mercadoria.or_else(|| Some("0".into())),
            ..self
        })
    }
}
