//! `categorias` — árvore de categorias do catálogo (auto-relacionamento).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Categoria {
    pub id: Id<Categoria>,
    pub categoria_pai_id: Option<Id<Categoria>>,
    pub nome: String,
    pub slug: String,
    pub descricao: Option<String>,
    pub imagem_url: Option<String>,
    pub ordem: i32,
    pub ativa: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CategoriaInput {
    pub categoria_pai_id: Option<Id<Categoria>>,
    pub nome: String,
    pub slug: Option<String>, // derivado do nome quando ausente
    pub descricao: Option<String>,
    pub imagem_url: Option<String>,
    pub ordem: i32,
    pub ativa: bool,
}

impl CategoriaInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let nome = v.validar("nome", texto::obrigatorio("nome", &self.nome, 120));
        let slug = match self.slug.as_deref() {
            Some(s) => v.validar("slug", texto::slug("slug", s, 140)),
            None => nome.as_ref().and_then(|n| texto::slug("slug", n, 140).ok()),
        };
        v.finish()?;

        Ok(Self {
            nome: nome.unwrap(),
            slug,
            ..self
        })
    }
}

/// Regra da árvore: nenhum nó pode ser pai de si mesmo nem criar ciclos.
/// Verificação de ciclos completos exige consulta — feita no repositório.
pub fn validar_hierarquia(
    id: Option<Id<Categoria>>,
    pai: Option<Id<Categoria>>,
) -> Result<(), ErroDominio> {
    if let (Some(id), Some(pai)) = (id, pai) {
        if id == pai {
            return Err(ErroDominio::regra("categoria não pode ser pai de si mesma"));
        }
    }
    Ok(())
}
