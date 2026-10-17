//! Cache de leitura de curta duração para listagens paginadas.
//!
//! Modelo de consistência: um **contador de geração global** (`VERSAO`) é
//! incrementado por toda mutação em qualquer repositório. Entradas guardam a
//! geração em que foram gravadas — uma escrita invalida logicamente todas as
//! listas em O(1), o que cobre também escritas cruzadas entre tabelas
//! (ex.: orçamento convertido cria pedido na mesma transação).
//!
//! O TTL de 5s é apenas um bound extra para escritas fora do processo
//! (migrations, SQL manual, triggers futuros).
//!
//! Sem Redis/infra extra: `HashMap` + `RwLock` + `AtomicU64` bastam para
//! dezenas de chaves num processo único.

use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::RwLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::observabilidade::metricas;

/// TTL das entradas — bound de frescor para escritas fora do processo.
const TTL_LISTA: Duration = Duration::from_secs(5);
/// Teto de entradas por repositório — combinações de filtro são limitadas,
/// mas evita crescer sem bound em varreduras sintéticas.
const MAX_ENTRADAS: usize = 512;

/// Geração global de dados — incrementada por qualquer mutação.
static VERSAO: AtomicU64 = AtomicU64::new(1);

/// Invalida **todas** as listas cacheadas — chamado por toda mutação.
pub fn invalidar_listas() {
    VERSAO.fetch_add(1, Ordering::Relaxed);
    if let Some(m) = metricas() {
        m.cache_invalidate();
    }
}

fn versao_atual() -> u64 {
    VERSAO.load(Ordering::Relaxed)
}

struct Entrada<T> {
    expira: Instant,
    gerada_em: u64,
    valor: T,
}

pub struct CacheListas<T> {
    ttl: Duration,
    /// Nome da entidade — dimensão das métricas de hit/miss.
    entidade: &'static str,
    map: RwLock<HashMap<String, Entrada<T>>>,
}

impl<T: Clone + Send + Sync + 'static> CacheListas<T> {
    pub fn novo(entidade: &'static str) -> Self {
        Self {
            ttl: TTL_LISTA,
            entidade,
            map: RwLock::new(HashMap::new()),
        }
    }

    /// `None` em miss, expirado ou stale (geração anterior à atual).
    /// Lock envenenado degrada para miss — nunca para erro.
    pub fn get(&self, chave: &str) -> Option<T> {
        let valor = self.map.read().ok().and_then(|g| {
            g.get(chave).and_then(|e| {
                (Instant::now() < e.expira && e.gerada_em == versao_atual())
                    .then(|| e.valor.clone())
            })
        });
        if let Some(m) = metricas() {
            m.cache_get(self.entidade, valor.is_some());
        }
        valor
    }

    pub fn set(&self, chave: String, valor: T) {
        if let Some(m) = metricas() {
            m.cache_set(self.entidade);
        }
        if let Ok(mut map) = self.map.write() {
            if map.len() >= MAX_ENTRADAS {
                let agora = Instant::now();
                let geracao = versao_atual();
                map.retain(|_, e| e.expira > agora && e.gerada_em == geracao);
                // Se ainda assim estiver cheio, perdemos o cache — nunca
                // crescemos indefinidamente.
                if map.len() >= MAX_ENTRADAS {
                    map.clear();
                }
            }
            map.insert(
                chave,
                Entrada {
                    expira: Instant::now() + self.ttl,
                    gerada_em: versao_atual(),
                    valor,
                },
            );
        }
    }
}

/// Chave estável de cache — `Debug` dos filtros é determinístico por struct.
pub fn chave_lista(paginacao: &impl Debug, filtro: &impl Debug) -> String {
    format!("{paginacao:?}|{filtro:?}")
}
