pub mod ordem_servico;

pub use ordem_servico::{
    total_materiais, valor_total_os, OrdemServico, OrdemServicoInput, OsHistorico, OsItem,
    PrioridadeOs, StatusOs,
};
