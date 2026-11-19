//! Admin CRUD over `usuarios` — restricted to `Perfil::Admin` at the call site.

use std::sync::Arc;

use hweld_domain::acesso::usuario::{NovoUsuario, Perfil, Usuario};
use hweld_domain::auditoria::log::EventoAuditoria;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::{ErroApp, Resultado};
use crate::ports::acesso::{AtualizarUsuario, FiltroUsuarios, RepositorioUsuarios};
use crate::ports::externos::RegistradorAuditoria;
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::seguranca::HasherSenha;

const ENTIDADE: &str = "usuarios";

pub struct ServicoUsuarios {
    usuarios: Arc<dyn RepositorioUsuarios>,
    hasher: Arc<dyn HasherSenha>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoUsuarios {
    pub fn novo(
        usuarios: Arc<dyn RepositorioUsuarios>,
        hasher: Arc<dyn HasherSenha>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            usuarios,
            hasher,
            audit,
            realtime,
        }
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroUsuarios,
    ) -> Resultado<Pagina<Usuario>> {
        self.usuarios.listar(paginacao, filtro).await
    }

    pub async fn buscar(&self, id: Id<Usuario>) -> Resultado<Usuario> {
        self.usuarios
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("usuario", id))
    }

    pub async fn criar(
        &self,
        nome: String,
        email: String,
        senha: &str,
        perfil: Perfil,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Usuario> {
        crate::use_cases::auth::validar_senha(senha)?;
        let senha_hash = self.hasher.hash(senha).await?;
        let novo = NovoUsuario {
            nome,
            email,
            senha_hash,
            perfil,
        }
        .validar()?;
        let usuario = self.usuarios.criar(novo).await?;
        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                ENTIDADE,
                usuario.id.valor(),
                serde_json::json!({ "email": usuario.email, "perfil": usuario.perfil }),
            ))
            .await;
        // Gestão de usuários é interna — só o backoffice reconcilia a lista.
        self.realtime.publicar(EventoRealtime::novo(
            "usuario.criado",
            Audiencia::Staff,
            serde_json::json!({ "id": usuario.id.valor(), "perfil": usuario.perfil }),
        ));
        Ok(usuario)
    }

    pub async fn atualizar(
        &self,
        id: Id<Usuario>,
        dados: AtualizarUsuario,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Usuario> {
        let antes = self.buscar(id).await?;
        let depois = self.usuarios.atualizar(id, dados).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                ENTIDADE,
                id.valor(),
                serde_json::json!({ "nome": antes.nome, "email": antes.email, "perfil": antes.perfil }),
                serde_json::json!({ "nome": depois.nome, "email": depois.email, "perfil": depois.perfil }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "usuario.atualizado",
            Audiencia::Staff,
            serde_json::json!({ "id": depois.id.valor() }),
        ));
        Ok(depois)
    }

    pub async fn definir_ativo(
        &self,
        id: Id<Usuario>,
        ativo: bool,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<()> {
        let antes = self.buscar(id).await?;
        self.usuarios.definir_ativo(id, ativo).await?;
        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                ENTIDADE,
                id.valor(),
                serde_json::json!({ "ativo": antes.ativo }),
                serde_json::json!({ "ativo": ativo }),
            ))
            .await;
        self.realtime.publicar(EventoRealtime::novo(
            "usuario.ativo_alterado",
            Audiencia::Staff,
            serde_json::json!({ "id": id.valor(), "ativo": ativo }),
        ));
        Ok(())
    }
}
