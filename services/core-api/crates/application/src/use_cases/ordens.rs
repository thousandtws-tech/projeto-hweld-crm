//! Use cases de ordens de serviço — Fluxo C do modelo.
//! `os_itens` baixam estoque (tipo=saida) na mesma transação; toda transição
//! grava `os_historicos`.

use std::sync::Arc;

use hweld_domain::acesso::usuario::Usuario;
use hweld_domain::catalogo::produto::Produto;
use hweld_domain::operacao::ordem_servico::{
    OrdemServico, OrdemServicoInput, OsHistorico, OsItem, StatusOs,
};
use hweld_domain::shared::dinheiro::Quantidade;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;

use crate::erro::{ErroApp, Resultado};
use crate::ports::catalogo::RepositorioProdutos;
use crate::ports::operacao::{FiltroOrdensServico, RepositorioOrdensServico};
use crate::ports::realtime::{Audiencia, EventoRealtime, NotificadorRealtime};

pub struct ServicoOrdensServico {
    ordens: Arc<dyn RepositorioOrdensServico>,
    produtos: Arc<dyn RepositorioProdutos>,
    realtime: Arc<dyn NotificadorRealtime>,
}

impl ServicoOrdensServico {
    pub fn novo(
        ordens: Arc<dyn RepositorioOrdensServico>,
        produtos: Arc<dyn RepositorioProdutos>,
        realtime: Arc<dyn NotificadorRealtime>,
    ) -> Self {
        Self {
            ordens,
            produtos,
            realtime,
        }
    }

    pub async fn buscar(
        &self,
        id: Id<OrdemServico>,
    ) -> Resultado<(OrdemServico, Vec<OsItem>, Vec<OsHistorico>)> {
        let os = self
            .ordens
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("ordem_servico", id))?;
        let itens = self.ordens.listar_itens(id).await?;
        let historico = self.ordens.listar_historico(id).await?;
        Ok((os, itens, historico))
    }

    /// Resolve referência externa: UUID (`public_id`) ou id numérico legado.
    pub async fn buscar_por_ref(
        &self,
        referencia: &str,
    ) -> Resultado<(OrdemServico, Vec<OsItem>, Vec<OsHistorico>)> {
        let encontrada = if let Ok(uuid) = uuid::Uuid::parse_str(referencia) {
            self.ordens.buscar_por_public_id(uuid).await?
        } else if let Ok(n) = referencia.parse::<i64>() {
            self.ordens.buscar_por_id(Id::novo(n)).await?
        } else {
            None
        };
        let o = encontrada.ok_or_else(|| ErroApp::nao_encontrado("ordem_servico", referencia))?;
        self.buscar(o.id).await
    }

    pub async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOrdensServico,
    ) -> Resultado<Pagina<OrdemServico>> {
        self.ordens.listar(paginacao, filtro).await
    }

    pub async fn criar(
        &self,
        input: OrdemServicoInput,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<OrdemServico> {
        let criada = self.ordens.criar(input.validar()?, ator).await?;
        self.realtime.publicar(EventoRealtime::novo(
            "os.criada",
            Audiencia::Staff,
            serde_json::json!({ "id": criada.id.valor(), "numero": criada.numero }),
        ));
        Ok(criada)
    }

    /// Consome material na OS — baixa o estoque na mesma transação.
    /// Preço registrado: `preco_venda` atual do produto (snapshot de consumo).
    pub async fn consumir_material(
        &self,
        os_id: Id<OrdemServico>,
        produto_id: Id<Produto>,
        quantidade: Decimal,
        ator: Option<Id<Usuario>>,
    ) -> Resultado<OsItem> {
        let os = self
            .ordens
            .buscar_por_id(os_id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("ordem_servico", os_id))?;
        if !os.status.aceita_itens() {
            return Err(ErroApp::Dominio(hweld_domain::ErroDominio::regra(format!(
                "OS {} não aceita novos materiais (status: {})",
                os.numero, os.status
            ))));
        }
        let produto = self
            .produtos
            .buscar_por_id(produto_id)
            .await?
            .filter(|p| p.deleted_at.is_none())
            .ok_or_else(|| ErroApp::nao_encontrado("produto", produto_id))?;
        let qtd = Quantidade::nova(quantidade).map_err(ErroApp::Dominio)?;

        self.ordens
            .adicionar_item(
                os_id,
                produto_id,
                qtd,
                produto.preco_venda,
                produto.controla_estoque,
                ator,
            )
            .await
    }

    /// Avança o status pela máquina de estados — grava `os_historicos` na tx.
    pub async fn transicionar(
        &self,
        id: Id<OrdemServico>,
        proximo: StatusOs,
        ator: Option<Id<Usuario>>,
        observacao: Option<String>,
    ) -> Resultado<OrdemServico> {
        let os = self
            .ordens
            .buscar_por_id(id)
            .await?
            .ok_or_else(|| ErroApp::nao_encontrado("ordem_servico", id))?;
        os.status.transicionar(proximo)?;
        let depois = self
            .ordens
            .transicionar(id, proximo, ator, observacao.as_deref())
            .await?;
        self.realtime.publicar(EventoRealtime::novo(
            "os.status_alterada",
            Audiencia::Staff,
            serde_json::json!({
                "id": depois.id.valor(),
                "numero": depois.numero,
                "de": os.status,
                "para": depois.status,
            }),
        ));
        Ok(depois)
    }
}
