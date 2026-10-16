pub mod contato;
pub mod empresa;
pub mod endereco;
pub mod interacao;
pub mod oportunidade;
pub mod orcamento;

pub use contato::{Contato, ContatoInput};
pub use empresa::{Empresa, EmpresaInput, StatusEmpresa};
pub use endereco::{Endereco, EnderecoInput, TipoEndereco};
pub use interacao::{Interacao, InteracaoInput, TipoInteracao};
pub use oportunidade::{EstagioOportunidade, Oportunidade, OportunidadeInput, OrigemOportunidade};
pub use orcamento::{
    calcular_totais, ItemOrcamentoNovo, Orcamento, OrcamentoInput, OrcamentoItem, StatusOrcamento,
    TotaisDocumento,
};
