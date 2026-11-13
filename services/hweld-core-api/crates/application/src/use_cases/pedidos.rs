use std::sync::Arc;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::auditoria::log::EventoAuditoria;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::estoque::movimentacao::{MovimentacaoCmd, TipoMovimentacao};
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pedido::{OrigemPedido, Pedido, PedidoItem, StatusPedido};

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::RepositorioProdutos;
use crate::ports::externos::RegistradorAuditoria;
use crate::ports::integracao::{EventoOperacoes, NotificadorOperacoes};
use crate::ports::notificacoes::{CaixaDeEntrada, NovaNotificacao};
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};
use crate::ports::vendas::{FiltroPedidos, NovoPedido, RepositorioPedidos};

pub struct ServicoPedidos {
    pedidos: Arc<dyn RepositorioPedidos>,
    produtos: Arc<dyn RepositorioProdutos>,
    audit: Arc<dyn RegistradorAuditoria>,
    realtime: Arc<dyn NotificadorRealtime>,
    notificacoes: Arc<dyn CaixaDeEntrada>,
    ops: Arc<dyn NotificadorOperacoes>,
}

impl ServicoPedidos {
    pub fn novo(
        pedidos: Arc<dyn RepositorioPedidos>,
        produtos: Arc<dyn RepositorioProdutos>,
        audit: Arc<dyn RegistradorAuditoria>,
        realtime: Arc<dyn NotificadorRealtime>,
        notificacoes: Arc<dyn CaixaDeEntrada>,
        ops: Arc<dyn NotificadorOperacoes>,
    ) -> Self {
        Self {
            pedidos,
            produtos,
            audit,
            realtime,
            notificacoes,
            ops,
        }
    }

    pub async fn buscar(&self, id: Id<Pedido>) -> Resultado<(Pedido, Vec<PedidoItem>)> {
        let pedido = self
            .pedidos
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("pedido", id))?;
        let itens = self.pedidos.buscar_itens(id).await?;
        Ok((pedido, itens))
    }

    /// Resolve referência externa: UUID (`public_id`) ou id numérico legado.
    pub async fn buscar_por_ref(&self, referencia: &str) -> Resultado<(Pedido, Vec<PedidoItem>)> {
        let encontrado = if let Ok(uuid) = uuid::Uuid::parse_str(referencia) {
            self.pedidos.buscar_por_public_id(uuid).await?
        } else if let Ok(n) = referencia.parse::<i64>() {
            self.pedidos.buscar_por_id(Id::novo(n)).await?
        } else {
            None
        };
        let p = encontrado.ok_or_else(|| ErroApp::nao_encontrado("pedido", referencia))?;
        self.buscar(p.id).await
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroPedidos,
    ) -> Resultado<Pagina<Pedido>> {
        self.pedidos.listar(paginacao, filtro).await
    }

    /// Pedido manual — staff cria sem origem (§4.13).
    pub async fn criar_manual(
        &self,
        pedido: NovoPedido,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Pedido> {
        if pedido.origem != OrigemPedido::Manual {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "criação manual exige origem=manual",
            )));
        }
        if pedido.itens.is_empty() {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(
                "pedido exige ao menos 1 item",
            )));
        }
        let criado = self.pedidos.criar_manual(pedido).await?;
        self.audit
            .registrar(EventoAuditoria::insert(
                ator,
                "pedidos",
                criado.id.valor(),
                serde_json::json!({ "numero": criado.numero, "total": criado.total }),
            ))
            .await;
        // Mesmo evento do checkout — a lista de pedidos reconcilia igual.
        self.realtime.publicar(EventoRealtime::novo(
            "pedido.criado",
            Audiencia::Empresa(criado.empresa_id.valor()),
            serde_json::json!({
                "id": criado.id.valor(),
                "numero": criado.numero,
                "total": criado.total,
                "origem": criado.origem,
            }),
        ));
        // Projeção no serviço de operações (OrderCreated → read model).
        self.ops.publicar(EventoOperacoes::pedido_criado(&criado));
        Ok(criado)
    }

    pub async fn transicionar(
        &self,
        id: Id<Pedido>,
        proximo: StatusPedido,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Pedido> {
        let (pedido, itens) = self.buscar(id).await?;
        let novo = pedido.status.transicionar(proximo)?;

        let movimentos = self
            .movimentos_da_transicao(&pedido, &itens, novo, ator)
            .await?;
        let depois = self.pedidos.transicionar(id, novo, &movimentos).await?;

        self.audit
            .registrar(EventoAuditoria::update(
                ator,
                "pedidos",
                id.valor(),
                serde_json::json!({ "status": pedido.status }),
                serde_json::json!({ "status": depois.status }),
            ))
            .await;
        // Realtime: staff vê toda transição; o portal da empresa vê a própria.
        self.realtime.publicar(EventoRealtime::novo(
            "pedido.status_alterado",
            Audiencia::Empresa(depois.empresa_id.valor()),
            serde_json::json!({
                "id": depois.id.valor(),
                "numero": depois.numero,
                "de": pedido.status,
                "para": depois.status,
            }),
        ));
        // Inbox do cliente — "seu pedido mudou" é a notificação que ele espera.
        self.notificacoes
            .notificar_empresa(
                depois.empresa_id,
                NovaNotificacao {
                    tipo: "pedido.status_alterado",
                    titulo: format!("Pedido {} atualizado", depois.numero),
                    mensagem: format!("Status: {} → {}", pedido.status, depois.status),
                    link: Some(format!("/conta/pedidos/{}", depois.id.valor())),
                },
            )
            .await;
        Ok(depois)
    }

    async fn movimentos_da_transicao(
        &self,
        pedido: &Pedido,
        itens: &[PedidoItem],
        proximo: StatusPedido,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<Vec<MovimentacaoCmd>> {
        let tipos: &[TipoMovimentacao] = match proximo {
            // confirmado → reserva; faturado → libera + baixa (Fluxo D)
            StatusPedido::Confirmado => &[TipoMovimentacao::Reserva],
            StatusPedido::Faturado => {
                &[TipoMovimentacao::LiberacaoReserva, TipoMovimentacao::Saida]
            }
            // cancelado pré-faturamento: devolve a reserva que existia
            // (aguardando_pagamento nunca reservou — nada a liberar)
            StatusPedido::Cancelado if pedido.exige_reserva() => {
                &[TipoMovimentacao::LiberacaoReserva]
            }
            _ => &[],
        };
        if tipos.is_empty() {
            return Ok(vec![]);
        }

        let produtos = self
            .produtos
            .buscar_por_ids(&itens.iter().map(|i| i.produto_id).collect::<Vec<_>>())
            .await?;
        let controla = |id: Id<Produto>| {
            produtos
                .iter()
                .find(|p| p.id == id)
                .map(|p| p.controla_estoque)
                .unwrap_or(false)
        };

        Ok(itens
            .iter()
            .filter(|i| controla(i.produto_id))
            .flat_map(|i| {
                tipos.iter().map(move |&tipo| MovimentacaoCmd {
                    produto_id: i.produto_id,
                    tipo,
                    quantidade: i.quantidade.valor(),
                    pedido_id: Some(pedido.id),
                    ordem_servico_id: None,
                    usuario_id: ator,
                    motivo: None,
                })
            })
            .collect())
    }
}
