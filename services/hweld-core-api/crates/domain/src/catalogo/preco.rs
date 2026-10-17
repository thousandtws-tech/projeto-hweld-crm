//! Motor de precificação B2B — função pura (modelo §4.8 / §7.8).
//!
//! Preço efetivo = `tabela_preco_itens.preco` quando a empresa tem tabela
//! ativa e o produto está nela; senão `produtos.preco_venda`.
//! Resolvido na aplicação e gravado como snapshot no item do documento.

use crate::shared::dinheiro::Dinheiro;
use crate::shared::id::Id;

use super::produto::Produto;
use super::tabela_preco::{TabelaPreco, TabelaPrecoItem};

/// Resolve o preço efetivo de venda para um produto no contexto B2B.
///
/// Função pura: mesma entrada → mesma saída, sem IO. O repositório fornece
/// `tabela` e `item_tabela` já filtrados (tabela ativa + produto presente).
pub fn preco_efetivo(
    produto: &Produto,
    tabela: Option<&TabelaPreco>,
    item_tabela: Option<&TabelaPrecoItem>,
) -> Dinheiro {
    match (tabela, item_tabela) {
        (Some(t), Some(i)) if t.ativa && i.produto_id == produto.id => i.preco,
        _ => produto.preco_venda,
    }
}

/// Conveniência para catálogo: resolve preços de N produtos em uma passada,
/// sem N+1 — `itens_tabela` é o conjunto completo da tabela da empresa.
pub fn precos_em_lote<'a, I>(
    produtos: I,
    tabela: Option<&TabelaPreco>,
    itens_tabela: &[TabelaPrecoItem],
) -> Vec<(Id<Produto>, Dinheiro)>
where
    I: IntoIterator<Item = &'a Produto>,
{
    produtos
        .into_iter()
        .map(|p| {
            let item = itens_tabela.iter().find(|i| i.produto_id == p.id);
            (p.id, preco_efetivo(p, tabela, item))
        })
        .collect()
}
