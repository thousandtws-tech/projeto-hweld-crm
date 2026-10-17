//! Ports de persistência — módulo CRM.

use async_trait::async_trait;
use chrono::NaiveDate;
use hweld_domain::crm::contato::{Contato, ContatoInput};
use hweld_domain::crm::empresa::{Empresa, EmpresaInput, StatusEmpresa};
use hweld_domain::crm::endereco::{Endereco, EnderecoInput, TipoEndereco};
use hweld_domain::crm::interacao::{Interacao, InteracaoInput};
use hweld_domain::crm::oportunidade::{EstagioOportunidade, Oportunidade, OportunidadeInput};
use hweld_domain::crm::orcamento::{
    ItemOrcamentoNovo, Orcamento, OrcamentoInput, OrcamentoItem, StatusOrcamento,
};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pedido::Pedido;
use uuid::Uuid;

use crate::erro::Resultado;
use crate::ports::vendas::NovoPedido;

#[derive(Debug, Clone, Default)]
pub struct FiltroEmpresas {
    pub status: Option<StatusEmpresa>,
    pub busca: Option<String>,
}

#[async_trait]
pub trait RepositorioEmpresas: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Empresa>) -> Resultado<Option<Empresa>>;
    async fn buscar_por_public_id(&self, public_id: Uuid) -> Resultado<Option<Empresa>>;
    async fn buscar_por_cnpj(&self, cnpj: &str) -> Resultado<Option<Empresa>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroEmpresas,
    ) -> Resultado<Pagina<Empresa>>;
    async fn criar(&self, input: EmpresaInput) -> Resultado<Empresa>;
    async fn atualizar(&self, id: Id<Empresa>, input: EmpresaInput) -> Resultado<Empresa>;
    async fn arquivar(&self, id: Id<Empresa>) -> Resultado<()>;
}

#[async_trait]
pub trait RepositorioContatos: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Contato>) -> Resultado<Option<Contato>>;
    async fn buscar_por_email(&self, email: &str) -> Resultado<Option<Contato>>;
    async fn listar_por_empresa(&self, empresa_id: Id<Empresa>) -> Resultado<Vec<Contato>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        empresa_id: Option<Id<Empresa>>,
        busca: Option<String>,
    ) -> Resultado<Pagina<Contato>>;
    async fn criar(&self, input: ContatoInput) -> Resultado<Contato>;
    async fn atualizar(&self, id: Id<Contato>, input: ContatoInput) -> Resultado<Contato>;
    async fn definir_acesso_portal(
        &self,
        id: Id<Contato>,
        ativo: bool,
        senha_hash: Option<&str>,
    ) -> Resultado<()>;
    async fn arquivar(&self, id: Id<Contato>) -> Resultado<()>;
}

#[async_trait]
pub trait RepositorioEnderecos: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Endereco>) -> Resultado<Option<Endereco>>;
    async fn listar_por_empresa(
        &self,
        empresa_id: Id<Empresa>,
        tipo: Option<TipoEndereco>,
    ) -> Resultado<Vec<Endereco>>;
    async fn criar(&self, input: EnderecoInput) -> Resultado<Endereco>;
    async fn atualizar(&self, id: Id<Endereco>, input: EnderecoInput) -> Resultado<Endereco>;
    async fn remover(&self, id: Id<Endereco>) -> Resultado<()>;
    async fn definir_principal(&self, id: Id<Endereco>) -> Resultado<()>;
}

#[derive(Debug, Clone, Default)]
pub struct FiltroOportunidades {
    pub estagio: Option<EstagioOportunidade>,
    pub empresa_id: Option<Id<Empresa>>,
    pub responsavel_id: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
}

#[async_trait]
pub trait RepositorioOportunidades: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Oportunidade>) -> Resultado<Option<Oportunidade>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOportunidades,
    ) -> Resultado<Pagina<Oportunidade>>;
    async fn criar(&self, input: OportunidadeInput) -> Resultado<Oportunidade>;
    async fn atualizar(
        &self,
        id: Id<Oportunidade>,
        input: OportunidadeInput,
    ) -> Resultado<Oportunidade>;
    async fn mover_estagio(
        &self,
        id: Id<Oportunidade>,
        estagio: EstagioOportunidade,
        motivo_perda: Option<&str>,
    ) -> Resultado<Oportunidade>;
}

#[async_trait]
pub trait RepositorioInteracoes: Send + Sync {
    async fn criar(&self, input: InteracaoInput) -> Resultado<Interacao>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        empresa_id: Option<Id<Empresa>>,
        oportunidade_id: Option<Id<Oportunidade>>,
        contato_id: Option<Id<Contato>>,
    ) -> Resultado<Pagina<Interacao>>;
}

#[derive(Debug, Clone, Default)]
pub struct FiltroOrcamentos {
    pub status: Option<StatusOrcamento>,
    pub empresa_id: Option<Id<Empresa>>,
    pub oportunidade_id: Option<Id<Oportunidade>>,
    pub vendedor_id: Option<Id<hweld_domain::acesso::usuario::Usuario>>,
}

#[async_trait]
pub trait RepositorioOrcamentos: Send + Sync {
    async fn buscar_por_id(&self, id: Id<Orcamento>) -> Resultado<Option<Orcamento>>;
    async fn buscar_por_public_id(&self, public_id: Uuid) -> Resultado<Option<Orcamento>>;
    async fn buscar_itens(&self, orcamento_id: Id<Orcamento>) -> Resultado<Vec<OrcamentoItem>>;
    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOrcamentos,
    ) -> Resultado<Pagina<Orcamento>>;
    async fn criar(&self, input: OrcamentoInput) -> Resultado<Orcamento>;
    async fn atualizar_itens(
        &self,
        id: Id<Orcamento>,
        itens: Vec<ItemOrcamentoNovo>,
        desconto: hweld_domain::Dinheiro,
        frete: hweld_domain::Dinheiro,
    ) -> Resultado<Orcamento>;
    async fn atualizar_status(
        &self,
        id: Id<Orcamento>,
        status: StatusOrcamento,
    ) -> Resultado<Orcamento>;
    async fn expirar_vencidos(&self, hoje: NaiveDate) -> Resultado<Vec<Id<Orcamento>>>;
    async fn converter_em_pedido(
        &self,
        orcamento_id: Id<Orcamento>,
        pedido: NovoPedido,
    ) -> Resultado<Pedido>;
}
