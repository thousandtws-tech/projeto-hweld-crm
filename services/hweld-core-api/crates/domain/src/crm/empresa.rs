//! `empresas` — clientes e prospects B2B (espinha dorsal do CRM).

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::catalogo::tabela_preco::TabelaPreco;
use crate::enum_str;
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};

enum_str! {
    pub enum StatusEmpresa {
        Prospecto = "prospecto",
        Ativo = "ativo",
        Inativo = "inativo",
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Empresa {
    pub id: Id<Empresa>,
    /// Identificador externo opaco (URLs, integrações) — nunca expõe o id sequencial.
    pub public_id: Uuid,
    pub razao_social: String,
    pub nome_fantasia: Option<String>,
    pub cnpj: Option<String>,
    pub inscricao_estadual: Option<String>,
    pub segmento: Option<String>,
    pub telefone: Option<String>,
    pub email: Option<String>,
    pub site: Option<String>,
    pub status: StatusEmpresa,
    pub tabela_preco_id: Option<Id<TabelaPreco>>,
    pub observacoes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Empresa {
    pub fn esta_ativa(&self) -> bool {
        self.deleted_at.is_none() && self.status == StatusEmpresa::Ativo
    }
}

/// Entrada validada de criação/atualização de empresa.
#[derive(Debug, Clone)]
pub struct EmpresaInput {
    pub razao_social: String,
    pub nome_fantasia: Option<String>,
    pub cnpj: Option<String>,
    pub inscricao_estadual: Option<String>,
    pub segmento: Option<String>,
    pub telefone: Option<String>,
    pub email: Option<String>,
    pub site: Option<String>,
    pub status: StatusEmpresa,
    pub tabela_preco_id: Option<Id<TabelaPreco>>,
    pub observacoes: Option<String>,
}

impl EmpresaInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let razao = v.validar(
            "razao_social",
            texto::obrigatorio("razao_social", &self.razao_social, 200),
        );
        let fantasia = v.validar_opcional(
            "nome_fantasia",
            self.nome_fantasia
                .as_deref()
                .map(|s| texto::obrigatorio("nome_fantasia", s, 200)),
        );
        let cnpj = v.validar_opcional("cnpj", self.cnpj.as_deref().map(|s| texto::cnpj("cnpj", s)));
        let email = v.validar_opcional(
            "email",
            self.email.as_deref().map(|s| texto::email("email", s)),
        );
        let telefone = v.validar_opcional(
            "telefone",
            self.telefone
                .as_deref()
                .map(|s| texto::obrigatorio("telefone", s, 20)),
        );
        let ie = v.validar_opcional(
            "inscricao_estadual",
            self.inscricao_estadual
                .as_deref()
                .map(|s| texto::obrigatorio("inscricao_estadual", s, 20)),
        );
        let segmento = v.validar_opcional(
            "segmento",
            self.segmento
                .as_deref()
                .map(|s| texto::obrigatorio("segmento", s, 80)),
        );
        let site = v.validar_opcional(
            "site",
            self.site
                .as_deref()
                .map(|s| texto::obrigatorio("site", s, 200)),
        );
        v.finish()?;

        Ok(Self {
            razao_social: razao.unwrap(),
            nome_fantasia: fantasia,
            cnpj,
            inscricao_estadual: ie,
            segmento,
            telefone,
            email,
            site,
            status: self.status,
            tabela_preco_id: self.tabela_preco_id,
            observacoes: self.observacoes,
        })
    }
}
