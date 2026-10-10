//! Use cases CRM — empresas, contatos, endereços, oportunidades, interações.

use std::sync::Arc;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::auditoria::log::EventoAuditoria;
use hweld_domain::crm::contato::{Contato, ContatoInput};
use hweld_domain::crm::empresa::{Empresa, EmpresaInput};
use hweld_domain::crm::endereco::{Endereco, EnderecoInput, TipoEndereco};
use hweld_domain::crm::interacao::{Interacao, InteracaoInput};
use hweld_domain::crm::oportunidade::{EstagioOportunidade, Oportunidade, OportunidadeInput};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::{ErroApp, Resultado};
use crate::ports::crm::{
    FiltroEmpresas, FiltroOportunidades, RepositorioContatos, RepositorioEmpresas,
    RepositorioEnderecos, RepositorioInteracoes, RepositorioOportunidades,
};
use crate::ports::externos::RegistradorAuditoria;
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::seguranca::HasherSenha;

// ── Empresas ────────────────────────────────────────────────────────────────

pub struct ServicoEmpresas {
    empresas: Arc<dyn RepositorioEmpresas>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoEmpresas {
    pub fn novo(
        empresas: Arc<dyn RepositorioEmpresas>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            empresas,
            audit,
            realtime,
        }
    }

    pub async fn buscar(&self, id: Id<Empresa>) -> Resultado<Empresa> {
        self.empresas
            .buscar_por_id(id)
            .await?
            .filter(|e| e.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("empresa", id))
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroEmpresas,
    ) -> Resultado<Pagina<Empresa>> {
        self.empresas.listar(paginacao, filtro).await
    }

    pub async fn criar(
        &self,
        input: EmpresaInput,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Empresa> {
        let input = input.validar()?;
        if let Some(cnpj) = &input.cnpj {
            if self.empresas.buscar_por_cnpj(cnpj).await?.is_some() {
                return Err(ErroApp::conflito(format!(
                    "empresa já existe com CNPJ {cnpj}"
                )));
            }
        }
        let empresa = self.empresas.criar(input).await?;
        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                "empresas",
                empresa.id.valor(),
                serde_json::json!({ "razao_social": empresa.razao_social, "cnpj": empresa.cnpj }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "empresa.criada",
            Audiencia::Staff,
            serde_json::json!({ "id": empresa.id.valor(), "razao_social": empresa.razao_social }),
        ));
        Ok(empresa)
    }

    pub async fn atualizar(
        &self,
        id: Id<Empresa>,
        input: EmpresaInput,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Empresa> {
        let antes = self.buscar(id).await?;
        let input = input.validar()?;
        let depois = self.empresas.atualizar(id, input).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "empresas",
                id.valor(),
                serde_json::json!(antes),
                serde_json::json!(depois),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "empresa.atualizada",
            Audiencia::Staff,
            serde_json::json!({ "id": depois.id.valor() }),
        ));
        Ok(depois)
    }

    pub async fn arquivar(&self, id: Id<Empresa>, ator: Option<Id<Usuario>>) -> Resultado<()> {
        let antes = self.buscar(id).await?;
        self.empresas.arquivar(id).await?;
        self.audit
            .registrar(EventoAuditoria::delete(
                ator,
                "empresas",
                id.valor(),
                serde_json::json!(antes),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "empresa.arquivada",
            Audiencia::Staff,
            serde_json::json!({ "id": id.valor() }),
        ));
        Ok(())
    }
}

// ── Contatos ────────────────────────────────────────────────────────────────

pub struct ServicoContatos {
    contatos: Arc<dyn RepositorioContatos>,
    empresas: Arc<dyn RepositorioEmpresas>,
    hasher: Arc<dyn HasherSenha>,
    audit: Arc<dyn RegistradorAuditoria>,
}

impl ServicoContatos {
    pub fn novo(
        contatos: Arc<dyn RepositorioContatos>,
        empresas: Arc<dyn RepositorioEmpresas>,
        hasher: Arc<dyn HasherSenha>,
        audit: Arc<dyn RegistradorAuditoria>,
    ) -> Self {
        Self {
            contatos,
            empresas,
            hasher,
            audit,
        }
    }

    pub async fn buscar(&self, id: Id<Contato>) -> Resultado<Contato> {
        self.contatos
            .buscar_por_id(id)
            .await?
            .filter(|c| c.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("contato", id))
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        empresa_id: Option<Id<Empresa>>,
        busca: Option<String>,
    ) -> Resultado<Pagina<Contato>> {
        self.contatos.listar(paginacao, empresa_id, busca).await
    }

    pub async fn criar(
        &self,
        input: ContatoInput,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Contato> {
        let input = input.validar()?;
        // A empresa deve existir — o contato não pode ficar órfão.
        self.empresas
            .buscar_por_id(input.empresa_id)
            .await?
            .filter(|e| e.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("empresa", input.empresa_id))?;
        // E-mail é identidade de login do portal B2B — único entre ativos.
        if let Some(email) = input.email.as_deref() {
            if self.contatos.buscar_por_email(email).await?.is_some() {
                return Err(ErroApp::conflito("e-mail já cadastrado em outro contato"));
            }
        }
        let contato = self.contatos.criar(input).await?;
        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                "contatos",
                contato.id.valor(),
                serde_json::json!({ "empresa_id": contato.empresa_id, "nome": contato.nome }),
            ))
            .await;
        Ok(contato)
    }

    pub async fn atualizar(
        &self,
        id: Id<Contato>,
        input: ContatoInput,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Contato> {
        let antes = self.buscar(id).await?;
        let input = input.validar()?;
        // Mesma regra do create — troca de e-mail não pode colidir com
        // outro contato ativo (exclui o próprio).
        if let Some(email) = input.email.as_deref() {
            if let Some(existente) = self.contatos.buscar_por_email(email).await? {
                if existente.id != id {
                    return Err(ErroApp::conflito("e-mail já cadastrado em outro contato"));
                }
            }
        }
        let depois = self.contatos.atualizar(id, input).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "contatos",
                id.valor(),
                serde_json::json!(antes),
                serde_json::json!(depois),
            ))
            .await;
        Ok(depois)
    }

    /// Ativa o acesso ao portal: hash da senha inicial + flag.
    pub async fn ativar_portal(
        &self,
        id: Id<Contato>,
        senha: &str,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<()> {
        self.buscar(id).await?;
        let hash = self.hasher.hash(senha).await?;
        self.contatos
            .definir_acesso_portal(id, true, Some(&hash))
            .await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "contatos",
                id.valor(),
                serde_json::json!({ "acesso_portal": false }),
                serde_json::json!({ "acesso_portal": true }),
            ))
            .await;
        Ok(())
    }

    pub async fn desativar_portal(
        &self,
        id: Id<Contato>,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<()> {
        self.buscar(id).await?;
        self.contatos.definir_acesso_portal(id, false, None).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "contatos",
                id.valor(),
                serde_json::json!({ "acesso_portal": true }),
                serde_json::json!({ "acesso_portal": false }),
            ))
            .await;
        Ok(())
    }

    pub async fn arquivar(&self, id: Id<Contato>, ator: Option<Id<Usuario>>) -> Resultado<()> {
        let antes = self.buscar(id).await?;
        self.contatos.arquivar(id).await?;
        self.audit
            .registrar(EventoAuditoria::delete(
                ator,
                "contatos",
                id.valor(),
                serde_json::json!(antes),
            ))
            .await;
        Ok(())
    }
}

// ── Endereços ───────────────────────────────────────────────────────────────

pub struct ServicoEnderecos {
    enderecos: Arc<dyn RepositorioEnderecos>,
    empresas: Arc<dyn RepositorioEmpresas>,
}

impl ServicoEnderecos {
    pub fn novo(
        enderecos: Arc<dyn RepositorioEnderecos>,
        empresas: Arc<dyn RepositorioEmpresas>,
    ) -> Self {
        Self {
            enderecos,
            empresas,
        }
    }

    pub async fn listar(
        &self,
        empresa_id: Id<Empresa>,
        tipo: Option<TipoEndereco>,
    ) -> Resultado<Vec<Endereco>> {
        self.enderecos.listar_por_empresa(empresa_id, tipo).await
    }

    pub async fn criar(&self, input: EnderecoInput) -> Resultado<Endereco> {
        let input = input.validar()?;
        self.empresas
            .buscar_por_id(input.empresa_id)
            .await?
            .filter(|e| e.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("empresa", input.empresa_id))?;
        let endereco = self.enderecos.criar(input).await?;
        if endereco.principal {
            self.enderecos.definir_principal(endereco.id).await?;
        }
        Ok(endereco)
    }

    pub async fn atualizar(&self, id: Id<Endereco>, input: EnderecoInput) -> Resultado<Endereco> {
        let endereco = self.enderecos.atualizar(id, input.validar()?).await?;
        if endereco.principal {
            self.enderecos.definir_principal(id).await?;
        }
        Ok(endereco)
    }

    pub async fn remover(&self, id: Id<Endereco>) -> Resultado<()> {
        self.enderecos.remover(id).await
    }
}

// ── Oportunidades ───────────────────────────────────────────────────────────

pub struct ServicoOportunidades {
    oportunidades: Arc<dyn RepositorioOportunidades>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
    notificacoes: Arc<dyn crate::ports::notificacoes::CaixaDeEntrada>,
}

impl ServicoOportunidades {
    pub fn novo(
        oportunidades: Arc<dyn RepositorioOportunidades>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
        notificacoes: Arc<dyn crate::ports::notificacoes::CaixaDeEntrada>,
    ) -> Self {
        Self {
            oportunidades,
            audit,
            realtime,
            notificacoes,
        }
    }

    pub async fn buscar(&self, id: Id<Oportunidade>) -> Resultado<Oportunidade> {
        self.oportunidades
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("oportunidade", id))
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOportunidades,
    ) -> Resultado<Pagina<Oportunidade>> {
        self.oportunidades.listar(paginacao, filtro).await
    }

    pub async fn criar(
        &self,
        input: OportunidadeInput,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Oportunidade> {
        let oportunidade = self.oportunidades.criar(input.validar()?).await?;
        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                "oportunidades",
                oportunidade.id.valor(),
                serde_json::json!({ "titulo": oportunidade.titulo, "estagio": oportunidade.estagio }),
            ))
            .await;
        Ok(oportunidade)
    }

    pub async fn atualizar(
        &self,
        id: Id<Oportunidade>,
        input: OportunidadeInput,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Oportunidade> {
        let antes = self.buscar(id).await?;
        let depois = self.oportunidades.atualizar(id, input.validar()?).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "oportunidades",
                id.valor(),
                serde_json::json!(antes),
                serde_json::json!(depois),
            ))
            .await;
        Ok(depois)
    }

    pub async fn mover_estagio(
        &self,
        id: Id<Oportunidade>,
        estagio: EstagioOportunidade,
        motivo_perda: Option<String>,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Oportunidade> {
        let atual = self.buscar(id).await?;
        let _ = atual.mover_para(estagio, motivo_perda.clone())?;
        let depois = self
            .oportunidades
            .mover_estagio(id, estagio, motivo_perda.as_deref())
            .await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "oportunidades",
                id.valor(),
                serde_json::json!({ "estagio": atual.estagio }),
                serde_json::json!({ "estagio": depois.estagio }),
            ))
            .await;
        // Kanban do backoffice atualiza ao vivo — evento só para staff
        // (oportunidade não é exposta ao portal).
        self.realtime.publicar(EventoRealtime::novo(
            "oportunidade.estagio",
            Audiencia::Staff,
            serde_json::json!({
                "id": depois.id.valor(),
                "de": atual.estagio,
                "para": depois.estagio,
            }),
        ));
        // Inbox do staff só para desfechos — movimentação intermediária é
        // rotina de quem arrastou o card, não notificação.
        if matches!(
            depois.estagio,
            EstagioOportunidade::Ganha | EstagioOportunidade::Perdida
        ) {
            self.notificacoes
                .notificar_staff(crate::ports::notificacoes::NovaNotificacao {
                    tipo: "oportunidade.estagio",
                    titulo: format!("Oportunidade {}", depois.estagio),
                    mensagem: depois.titulo.clone(),
                    link: Some("/crm/oportunidades".to_string()),
                })
                .await;
        }
        Ok(depois)
    }
}

// ── Interações ──────────────────────────────────────────────────────────────

pub struct ServicoInteracoes {
    interacoes: Arc<dyn RepositorioInteracoes>,
}

impl ServicoInteracoes {
    pub fn novo(interacoes: Arc<dyn RepositorioInteracoes>) -> Self {
        Self { interacoes }
    }

    pub async fn registrar(&self, input: InteracaoInput) -> Resultado<Interacao> {
        self.interacoes.criar(input.validar()?).await
    }

    pub async fn timeline(
        &self,
        paginacao: Paginacao,
        empresa_id: Option<Id<Empresa>>,
        oportunidade_id: Option<Id<hweld_domain::crm::oportunidade::Oportunidade>>,
        contato_id: Option<Id<Contato>>,
    ) -> Resultado<Pagina<Interacao>> {
        self.interacoes
            .listar(paginacao, empresa_id, oportunidade_id, contato_id)
            .await
    }
}
