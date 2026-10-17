//! `ordens_servico` + `os_itens` + `os_historicos` — Fluxo C do modelo.
//! `os_historicos` é trilha imutável de transições (§7.2).

use chrono::{DateTime, NaiveDate, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::acesso::usuario::Usuario;
use crate::catalogo::produto::Produto;
use crate::crm::contato::Contato;
use crate::crm::empresa::Empresa;
use crate::enum_str;
use crate::shared::dinheiro::{Dinheiro, Quantidade};
use crate::shared::erro::ErroDominio;
use crate::shared::id::Id;
use crate::shared::validacao::{texto, AcumuladorValidacao};
use crate::vendas::pedido::Pedido;

enum_str! {
    pub enum StatusOs {
        Aberta = "aberta",
        EmAndamento = "em_andamento",
        AguardandoMaterial = "aguardando_material",
        Concluida = "concluida",
        Cancelada = "cancelada",
    }
}

impl StatusOs {
    pub fn eh_terminal(self) -> bool {
        matches!(self, Self::Concluida | Self::Cancelada)
    }

    /// Itens/materiais só podem ser adicionados com OS ainda aberta.
    pub fn aceita_itens(self) -> bool {
        matches!(
            self,
            Self::Aberta | Self::EmAndamento | Self::AguardandoMaterial
        )
    }

    pub fn transicionar(self, proximo: Self) -> Result<Self, ErroDominio> {
        use StatusOs::*;
        let ok = matches!(
            (self, proximo),
            (Aberta, EmAndamento | AguardandoMaterial | Cancelada)
                | (EmAndamento, AguardandoMaterial | Concluida | Cancelada)
                | (AguardandoMaterial, EmAndamento | Cancelada)
        );
        if ok {
            Ok(proximo)
        } else {
            Err(ErroDominio::TransicaoInvalida {
                entidade: "ordem_servico",
                de: self.to_string(),
                para: proximo.to_string(),
            })
        }
    }
}

enum_str! {
    pub enum PrioridadeOs {
        Baixa = "baixa",
        Normal = "normal",
        Alta = "alta",
        Urgente = "urgente",
    }
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct OrdemServico {
    pub id: Id<OrdemServico>,
    /// Identificador externo opaco (URLs) — nunca expõe o id sequencial.
    pub public_id: Uuid,
    pub numero: String,
    pub pedido_id: Option<Id<Pedido>>,
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub responsavel_id: Option<Id<Usuario>>,
    pub descricao: Option<String>,
    pub status: StatusOs,
    pub prioridade: PrioridadeOs,
    pub aberta_em: DateTime<Utc>,
    pub prevista_em: Option<NaiveDate>,
    pub concluida_em: Option<DateTime<Utc>>,
    pub valor_mao_obra: Option<Dinheiro>,
    pub valor_total: Option<Dinheiro>,
    pub observacoes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Material/insumo consumido — gera baixa de estoque tipo `saida` (Fluxo C).
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct OsItem {
    pub id: Id<OsItem>,
    pub os_id: Id<OrdemServico>,
    pub produto_id: Id<Produto>,
    pub quantidade: Quantidade,
    pub preco_unitario: Dinheiro,
    pub total: Dinheiro,
}

/// Registro imutável de transição de status.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct OsHistorico {
    pub id: Id<OsHistorico>,
    pub os_id: Id<OrdemServico>,
    pub status_anterior: Option<String>,
    pub status_novo: String,
    pub usuario_id: Option<Id<Usuario>>,
    pub observacao: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Total de materiais consumidos — fold funcional.
pub fn total_materiais<'a>(itens: impl IntoIterator<Item = &'a OsItem>) -> Dinheiro {
    itens.into_iter().map(|i| i.total).sum()
}

/// `valor_total = mão de obra + materiais` — cálculo puro.
pub fn valor_total_os(mao_obra: Dinheiro, itens: &[OsItem]) -> Dinheiro {
    mao_obra + total_materiais(itens.iter())
}

#[derive(Debug, Clone)]
pub struct OrdemServicoInput {
    pub pedido_id: Option<Id<Pedido>>,
    pub empresa_id: Id<Empresa>,
    pub contato_id: Option<Id<Contato>>,
    pub responsavel_id: Option<Id<Usuario>>,
    pub descricao: Option<String>,
    pub prioridade: PrioridadeOs,
    pub prevista_em: Option<NaiveDate>,
    pub valor_mao_obra: Option<Dinheiro>,
    pub observacoes: Option<String>,
}

impl OrdemServicoInput {
    pub fn validar(self) -> Result<Self, ErroDominio> {
        let mut v = AcumuladorValidacao::novo();
        let descricao = v.validar_opcional(
            "descricao",
            self.descricao
                .as_deref()
                .map(|s| texto::obrigatorio("descricao", s, 5000)),
        );
        let _ = descricao;
        v.finish()?;
        Ok(self)
    }
}
