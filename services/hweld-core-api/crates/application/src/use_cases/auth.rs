use std::sync::Arc;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::crm::contato::{Contato, ContatoInput};
use hweld_domain::crm::empresa::EmpresaInput;
use hweld_domain::shared::id::Id;
use tracing::instrument;

use hweld_domain::acesso::sessao::{Dispositivo, SessaoAutenticada};
use hweld_domain::shared::erro::ErroDominio;

use crate::erro::{ErroApp, Resultado};
use crate::ports::acesso::RepositorioUsuarios;
use crate::ports::crm::{RepositorioContatos, RepositorioEmpresas};
use crate::ports::seguranca::{
    ContextoSessao, EmissorTokens, HasherSenha, ParTokens, RepositorioSessoes, SujeitoToken,
    TipoSujeito,
};

const HASH_DUMMY: &str = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$abcdefghijklmnopqrstuvwxyz0123456789abcd";

pub struct ServicoAuth {
    usuarios: Arc<dyn RepositorioUsuarios>,
    contatos: Arc<dyn RepositorioContatos>,
    empresas: Arc<dyn RepositorioEmpresas>,
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
        empresas: Arc<dyn RepositorioEmpresas>,
        hasher: Arc<dyn HasherSenha>,
        tokens: Arc<dyn EmissorTokens>,
        sessoes: Arc<dyn RepositorioSessoes>,
    ) -> Self {
        Self {
            usuarios,
            contatos,
            empresas,
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

    #[instrument(skip(self, senha), fields(email = %email))]
    pub async fn cadastro_portal(
        &self,
        nome: &str,
        email: &str,
        senha: &str,
        empresa: EmpresaInput,
        telefone: Option<String>,
        ctx: &ContextoSessao,
    ) -> Resultado<SessaoPortal> {
        let email = email.trim().to_lowercase();
        validar_senha(senha)?;
        // Hash antes da checagem de duplicidade: o Argon2 (~100ms) é o
        // custo dominante e passa a pesar nos dois caminhos — sem isso,
        // "e-mail já cadastrado" voltava em ~ms e o tempo de resposta
        // denunciava a existência da conta mesmo com a mensagem genérica.
        let hash = self.hasher.hash(senha).await?;
        if self.contatos.buscar_por_email(&email).await?.is_some() {
            return Err(ErroApp::conflito("e-mail já cadastrado"));
        }

        let empresa = self.empresas.criar(empresa.validar()?).await?;
        let contato = self
            .contatos
            .criar(
                ContatoInput {
                    empresa_id: empresa.id,
                    nome: nome.trim().to_string(),
                    cargo: None,
                    email: Some(email.clone()),
                    telefone,
                    whatsapp: None,
                    is_principal: true,
                    acesso_portal: true,
                    observacoes: None,
                }
                .validar()?,
            )
            .await?;

        self.contatos
            .definir_acesso_portal(contato.id, true, Some(&hash))
            .await?;

        let tokens = self
            .tokens
            .emitir_par(
                SujeitoToken {
                    tipo: TipoSujeito::Portal,
                    id: contato.id.valor(),
                    perfil: None,
                },
                ctx,
            )
            .await?;
        Ok(SessaoPortal { tokens, contato })
    }

    pub async fn refresh(&self, refresh_token: &str, ctx: &ContextoSessao) -> Resultado<ParTokens> {
        self.tokens.rotacionar(refresh_token, ctx).await
    }

    pub async fn logout(&self, refresh_token: &str) -> Resultado<()> {
        self.tokens.revogar(refresh_token).await
    }

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
        // Sem este check, a troca aceitava qualquer nova senha — inclusive
        // vazia (o hash Argon2 de "" não é vazio e passaria no validar()).
        validar_senha(nova_senha)?;
        let novo_hash = self.hasher.hash(nova_senha).await?;
        self.usuarios.atualizar_senha(usuario_id, &novo_hash).await
    }
}

/// Política de senha (OWASP): mínimo 10 caracteres com letra E dígito.
/// `len()` conta bytes — senhas com acento pontuam mais, o que só aperta
/// a régua; seguro para o mínimo. Usada em cadastro portal, troca de
/// senha staff e criação de usuário no backoffice.
pub(crate) fn validar_senha(senha: &str) -> Resultado<()> {
    let forte = senha.len() >= 10
        && senha.chars().any(|c| c.is_ascii_alphabetic())
        && senha.chars().any(|c| c.is_ascii_digit());
    if !forte {
        return Err(ErroApp::Dominio(ErroDominio::valor_invalido(
            "senha",
            "mínimo de 10 caracteres com letra e número",
        )));
    }
    Ok(())
}
