//! Casos de uso de autenticação — staff (usuarios) e portal B2B (contatos).

use std::sync::Arc;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::crm::contato::Contato;
use hweld_domain::shared::id::Id;
use tracing::instrument;

use hweld_domain::acesso::sessao::{Dispositivo, SessaoAutenticada};

use crate::erro::{ErroApp, Resultado};
use crate::ports::acesso::RepositorioUsuarios;
use crate::ports::crm::RepositorioContatos;
use crate::ports::seguranca::{
    ContextoSessao, EmissorTokens, HasherSenha, ParTokens, RepositorioSessoes, SujeitoToken,
    TipoSujeito,
};

const HASH_DUMMY: &str = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$abcdefghijklmnopqrstuvwxyz0123456789abcd";

pub struct ServicoAuth {
    usuarios: Arc<dyn RepositorioUsuarios>,
    contatos: Arc<dyn RepositorioContatos>,
    hasher: Arc<dyn HasherSenha>,
    tokens: Arc<dyn EmissorTokens>,
    sessoes: Arc<dyn RepositorioSessoes>,
}

pub struct SessaoPortal {
    pub tokens: ParTokens,
    pub contato: Contato,
}

impl ServicoAuth {
    pub fn novo(
        usuarios: Arc<dyn RepositorioUsuarios>,
        contatos: Arc<dyn RepositorioContatos>,
        hasher: Arc<dyn HasherSenha>,
        tokens: Arc<dyn EmissorTokens>,
        sessoes: Arc<dyn RepositorioSessoes>,
    ) -> Self {
        Self {
            usuarios,
            contatos,
            hasher,
            tokens,
            sessoes,
        }
    }

    #[instrument(skip(self, senha), fields( email = %email))]
    pub async fn login_staff(
        &self,
        email: &str,
        senha: &str,
        ctx: &ContextoSessao,
    ) -> Resultado<ParTokens> {
        let usuario = self.usuarios.buscar_por_email(email).await?;

        let (hash, ativo, sujeito) = match &usuario {
            Some(u) => (
                u.senha_hash.clone(),
                u.ativo,
                Some(SujeitoToken {
                    tipo: TipoSujeito::Staff,
                    id: u.id.valor(),
                    perfil: Some(u.perfil),
                }),
            ),
            None => (HASH_DUMMY.to_string(), false, None),
        };

        let ok = self.hasher.verificar(senha, &hash).await?;
        match (ok, ativo, sujeito) {
            (true, true, Some(s)) => self.tokens.emitir_par(s, ctx).await,
            _ => Err(ErroApp::nao_autenticado("credenciais inválidas")),
        }
    }

    #[instrument(skip(self, senha), fields(email = %email))]
    pub async fn login_portal(
        &self,
        email: &str,
        senha: &str,
        ctx: &ContextoSessao,
    ) -> Resultado<SessaoPortal> {
        let contato = self.contatos.buscar_por_email(email).await?;

        let hash = contato
            .as_ref()
            .and_then(|c| c.senha_hash.clone())
            .unwrap_or_else(|| HASH_DUMMY.to_string());

        let ok = self.hasher.verificar(senha, &hash).await?;
        let contato = contato.filter(|c| ok && c.pode_logar_portal());

        match contato {
            Some(c) => {
                let tokens = self
                    .tokens
                    .emitir_par(
                        SujeitoToken {
                            tipo: TipoSujeito::Portal,
                            id: c.id.valor(),
                            perfil: None,
                        },
                        ctx,
                    )
                    .await?;
                Ok(SessaoPortal { tokens, contato: c })
            }
            None => Err(ErroApp::nao_autenticado("credenciais inválidas")),
        }
    }

    pub async fn refresh(&self, refresh_token: &str, ctx: &ContextoSessao) -> Resultado<ParTokens> {
        self.tokens.rotacionar(refresh_token, ctx).await
    }

    pub async fn logout(&self, refresh_token: &str) -> Resultado<()> {
        self.tokens.revogar(refresh_token).await
    }

    /// "Suas sessões" — sessões ativas do usuário, com dispositivo resolvido.
    pub async fn sessoes_staff(&self, sujeito: &SujeitoToken) -> Resultado<Vec<SessaoAutenticada>> {
        let linhas = self
            .sessoes
            .listar_ativas(TipoSujeito::Staff, sujeito.id)
            .await?;
        Ok(linhas
            .into_iter()
            .map(|s| SessaoAutenticada {
                id: s.sessao_id,
                dispositivo: Dispositivo::de_user_agent(s.user_agent.as_deref()),
                ip: s.ip,
                criado_em: s.criado_em,
                ultimo_acesso_em: s.ultimo_acesso_em,
            })
            .collect())
    }

    /// Encerra uma sessão específica do próprio usuário (somente dono).
    /// Retorna 404 para sessão de terceiros — não revela existência.
    pub async fn encerrar_sessao_staff(
        &self,
        sujeito: &SujeitoToken,
        sessao_id: uuid::Uuid,
    ) -> Resultado<()> {
        let n = self
            .sessoes
            .revogar_sessao(TipoSujeito::Staff, sujeito.id, sessao_id)
            .await?;
        if n == 0 {
            return Err(ErroApp::nao_encontrado("sessão", sessao_id));
        }
        Ok(())
    }

    /// Encerra todas as outras sessões exceto `exceto` (a atual).
    pub async fn encerrar_outras_sessoes(
        &self,
        sujeito: &SujeitoToken,
        exceto: Option<uuid::Uuid>,
    ) -> Resultado<u64> {
        self.sessoes
            .revogar_outras(TipoSujeito::Staff, sujeito.id, exceto)
            .await
    }

    pub async fn trocar_senha_staff(
        &self,
        usuario_id: Id<Usuario>,
        senha_atual: &str,
        nova_senha: &str,
    ) -> Resultado<()> {
        let usuario = self
            .usuarios
            .buscar_por_id(usuario_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("usuario", usuario_id))?;

        if !self
            .hasher
            .verificar(senha_atual, &usuario.senha_hash)
            .await?
        {
            return Err(ErroApp::nao_autenticado("senha atual incorreta"));
        }
        let novo_hash = self.hasher.hash(nova_senha).await?;
        self.usuarios.atualizar_senha(usuario_id, &novo_hash).await
    }
}
