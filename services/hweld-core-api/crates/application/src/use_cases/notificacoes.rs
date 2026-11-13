//! Inbox de notificações — alimenta o sino dos dois frontends.
//!
//! Dois papéis:
//! - **Leitura** (`listar`, `nao_lidas`, `marcar_*`): thin sobre o repo,
//!   escopo sempre pelo `DestinoNotificacao` resolvido do token no handler.
//! - **Escrita** (`notificar_staff`, `notificar_empresa`): fan-out por
//!   destinatário (uma linha por usuário/contato — `lida_em` é individual)
//!   + evento `notificacao.nova` no barramento realtime.
//!
//! Notificação é best-effort por destinatário: falha numa linha não pode
//! derrubar a mutação de negócio que a originou (o pedido já foi criado).

use std::sync::Arc;

use tracing::{instrument, warn};

use hweld_domain::crm::empresa::Empresa;
use hweld_domain::notificacao::{DestinoNotificacao, Notificacao, NotificacaoInput};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};

use crate::erro::Resultado;
use crate::ports::acesso::{FiltroUsuarios, RepositorioUsuarios};
use crate::ports::crm::RepositorioContatos;
use crate::ports::notificacoes::{CaixaDeEntrada, NovaNotificacao, RepositorioNotificacoes};
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};

pub struct ServicoNotificacoes {
    notificacoes: Arc<dyn RepositorioNotificacoes>,
    usuarios: Arc<dyn RepositorioUsuarios>,
    contatos: Arc<dyn RepositorioContatos>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoNotificacoes {
    pub fn novo(
        notificacoes: Arc<dyn RepositorioNotificacoes>,
        usuarios: Arc<dyn RepositorioUsuarios>,
        contatos: Arc<dyn RepositorioContatos>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            notificacoes,
            usuarios,
            contatos,
            realtime,
        }
    }

    // ── Leitura (escopo já resolvido pelo handler) ───────────────────────────

    pub async fn listar(
        &self,
        destino: DestinoNotificacao,
        paginacao: Paginacao,
    ) -> Resultado<Pagina<Notificacao>> {
        self.notificacoes.listar(destino, paginacao).await
    }

    /// Badge do sino — count autoritativo do servidor.
    pub async fn nao_lidas(&self, destino: DestinoNotificacao) -> Resultado<i64> {
        self.notificacoes.nao_lidas(destino).await
    }

    pub async fn marcar_lida(
        &self,
        id: Id<Notificacao>,
        destino: DestinoNotificacao,
    ) -> Resultado<()> {
        self.notificacoes.marcar_lida(id, destino).await
    }

    pub async fn marcar_todas(&self, destino: DestinoNotificacao) -> Resultado<u64> {
        self.notificacoes.marcar_todas_lidas(destino).await
    }

    pub async fn remover(&self, id: Id<Notificacao>, destino: DestinoNotificacao) -> Resultado<()> {
        self.notificacoes.remover(id, destino).await
    }

    pub async fn remover_todas(&self, destino: DestinoNotificacao) -> Resultado<u64> {
        self.notificacoes.remover_todas(destino).await
    }

    // ── Escrita (fan-out) ────────────────────────────────────────────────────

    /// Persiste uma linha — falha individual é logada e não propaga.
    async fn persistir(&self, destino: DestinoNotificacao, n: &NovaNotificacao) -> bool {
        let input = NotificacaoInput {
            destino,
            tipo: n.tipo.to_string(),
            titulo: n.titulo.clone(),
            mensagem: n.mensagem.clone(),
            link: n.link.clone(),
        };
        match input.validar() {
            Err(e) => {
                warn!(erro = %e, "notificacao: conteudo invalido");
                false
            }
            Ok(input) => match self.notificacoes.criar(input).await {
                Ok(_) => true,
                Err(e) => {
                    warn!(erro = %e, "notificacao: falha ao persistir");
                    false
                }
            },
        }
    }

    /// Sinaliza o barramento — o cliente revalida badge e lista via REST.
    fn emitir(&self, audiencia: Audiencia, n: &NovaNotificacao) {
        self.realtime.publicar(EventoRealtime::novo(
            "notificacao.nova",
            audiencia,
            serde_json::json!({
                "tipo": n.tipo,
                "titulo": n.titulo,
                "mensagem": n.mensagem,
                "link": n.link,
            }),
        ));
    }
}

#[async_trait::async_trait]
impl CaixaDeEntrada for ServicoNotificacoes {
    /// Notifica todos os usuários staff ativos (ex.: pedido novo do portal).
    #[instrument(skip(self, n), fields(tipo = n.tipo))]
    async fn notificar_staff(&self, n: NovaNotificacao) {
        let mut pagina = 1u32;
        let mut entregues = 0u32;
        loop {
            let Ok(p) = self
                .usuarios
                .listar(
                    Paginacao::nova(Some(pagina), Some(100)).unwrap_or_default(),
                    FiltroUsuarios {
                        ativo: Some(true),
                        ..Default::default()
                    },
                )
                .await
            else {
                warn!("notificacao: falha ao listar usuarios staff");
                break;
            };
            let fim = pagina >= p.total_paginas.max(1);
            for u in p.itens {
                let ok = self.persistir(DestinoNotificacao::Staff(u.id), &n).await;
                entregues += u32::from(ok);
            }
            if fim {
                break;
            }
            pagina += 1;
        }
        if entregues > 0 {
            self.emitir(Audiencia::Staff, &n);
        }
    }

    /// Notifica os contatos com acesso ao portal de uma empresa
    /// (ex.: status do pedido mudou).
    #[instrument(skip(self, n), fields(tipo = n.tipo))]
    async fn notificar_empresa(&self, empresa_id: Id<Empresa>, n: NovaNotificacao) {
        let contatos = match self.contatos.listar_por_empresa(empresa_id).await {
            Ok(c) => c,
            Err(e) => {
                warn!(erro = %e, "notificacao: falha ao listar contatos da empresa");
                return;
            }
        };
        let mut entregues = 0u32;
        for c in contatos.into_iter().filter(|c| c.pode_logar_portal()) {
            let ok = self.persistir(DestinoNotificacao::Portal(c.id), &n).await;
            entregues += u32::from(ok);
        }
        if entregues > 0 {
            self.emitir(Audiencia::Empresa(empresa_id.valor()), &n);
        }
    }
}
