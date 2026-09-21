//! # hweld-domain
//!
//! Camada de domínio da plataforma HWeld (E-commerce B2B + CRM integrado).
//!
//! Princípios:
//! - **Zero IO**: nenhuma dependência de framework, banco ou rede.
//! - **Invariantes no tipo**: newtypes (`Id<T>`, `Dinheiro`, `Quantidade`),
//!   smart constructors e validação aplicativa com acúmulo de erros.
//! - **Estados como funções totais**: máquinas de estado via `match` exaustivo.
//! - **Imutabilidade**: transições retornam novas instâncias; históricos são
//!   append-only conforme `docs/modelo-de-dados.md` §7.2.
//! - **Cálculos puros**: totais, preços, parcelas e saldos são funções puras
//!   (folds sobre itens/movimentações) — determinísticos e testáveis.

pub mod acesso;
pub mod auditoria;
pub mod catalogo;
pub mod crm;
pub mod estoque;
pub mod financeiro;
pub mod fiscal;
pub mod operacao;
pub mod shared;
pub mod vendas;

pub use shared::{
    AcumuladorValidacao, Dinheiro, ErroCampo, ErroDominio, Id, Pagina, Paginacao, Quantidade,
    TipoDocumento,
};
