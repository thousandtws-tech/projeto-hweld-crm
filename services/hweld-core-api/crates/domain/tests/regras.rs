//! Testes das regras puras do domínio — máquinas de estado, cálculo de
//! parcelas, totais de documento e value objects. Sem I/O, sem banco.

use chrono::NaiveDate;
use hweld_domain::crm::orcamento::{calcular_totais, ItemOrcamentoNovo, StatusOrcamento};
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::erro::ErroDominio;
use hweld_domain::shared::id::Id;
use hweld_domain::vendas::pagamento::{plano_parcelas, StatusPagamento};
use hweld_domain::vendas::pedido::StatusPedido;
use rust_decimal_macros::dec;

fn d(v: rust_decimal::Decimal) -> Dinheiro {
    Dinheiro::novo(v)
}

fn data() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 1).unwrap()
}

// ── Value objects ───────────────────────────────────────────────────────────

#[test]
fn dinheiro_arredonda_duas_casas() {
    assert_eq!(d(dec!(10.555)).valor(), dec!(10.56));
    assert_eq!(d(dec!(10.554)).valor(), dec!(10.55));
}

#[test]
fn quantidade_rejeita_zero_e_negativo() {
    assert!(Quantidade::nova(dec!(0)).is_err());
    assert!(Quantidade::nova(dec!(-1)).is_err());
    assert!(Quantidade::nova(dec!(0.001)).is_ok());
}

#[test]
fn dinheiro_nao_negativo_rejeita_negativo() {
    assert!(Dinheiro::nao_negativo(dec!(-0.01), "preco").is_err());
    assert!(Dinheiro::nao_negativo(dec!(0), "preco").is_ok());
}

// ── Totais de documento (fold puro) ─────────────────────────────────────────

#[test]
fn totais_somam_itens_menos_desconto_mais_frete() {
    let itens = [d(dec!(100.00)), d(dec!(50.00))];
    let t = calcular_totais(itens, d(dec!(10.00)), d(dec!(5.00)));
    assert_eq!(t.subtotal.valor(), dec!(150.00));
    assert_eq!(t.total.valor(), dec!(145.00));
}

#[test]
fn total_nunca_fica_negativo() {
    let t = calcular_totais([d(dec!(10.00))], d(dec!(999.00)), Dinheiro::ZERO);
    assert_eq!(t.total, Dinheiro::ZERO);
}

#[test]
fn item_orcamento_total_e_preco_vezes_qtd_menos_desconto() {
    let item = ItemOrcamentoNovo {
        produto_id: Id::novo(1),
        descricao: "x".into(),
        quantidade: Quantidade::nova(dec!(2.5)).unwrap(),
        preco_unitario: d(dec!(10.00)),
        desconto: d(dec!(5.00)),
    };
    assert_eq!(item.total().valor(), dec!(20.00));
}

// ── Plano de parcelas — invariante Σ == total ───────────────────────────────

#[test]
fn parcelas_somam_exatamente_o_total() {
    // 100.00 / 3 → última absorve a sobra de arredondamento.
    let plano = plano_parcelas(d(dec!(100.00)), 3, data(), 30).unwrap();
    assert_eq!(plano.len(), 3);
    let soma: Dinheiro = plano.iter().map(|p| p.valor).sum();
    assert_eq!(soma.valor(), dec!(100.00));
    assert_eq!(plano[0].valor.valor(), dec!(33.33));
    assert_eq!(plano[2].valor.valor(), dec!(33.34));
}

#[test]
fn parcelas_respeitam_intervalo_de_vencimento() {
    let plano = plano_parcelas(d(dec!(90.00)), 3, data(), 30).unwrap();
    assert_eq!(plano[0].vencimento, data());
    assert_eq!(plano[1].vencimento, data() + chrono::Duration::days(30));
    assert_eq!(plano[2].vencimento, data() + chrono::Duration::days(60));
}

#[test]
fn parcelas_rejeitam_zero_ou_total_invalido() {
    assert!(matches!(
        plano_parcelas(d(dec!(100.00)), 0, data(), 30),
        Err(ErroDominio::RegraNegocio(_))
    ));
    assert!(plano_parcelas(Dinheiro::ZERO, 2, data(), 30).is_err());
}

// ── Máquinas de estado ──────────────────────────────────────────────────────

#[test]
fn pedido_segue_fluxo_feliz_ate_concluido() {
    let mut s = StatusPedido::AguardandoPagamento;
    for proximo in [
        StatusPedido::Confirmado,
        StatusPedido::EmSeparacao,
        StatusPedido::Faturado,
        StatusPedido::Enviado,
        StatusPedido::Entregue,
        StatusPedido::Concluido,
    ] {
        s = s.transicionar(proximo).unwrap();
    }
    assert_eq!(s, StatusPedido::Concluido);
    assert!(s.eh_terminal());
}

#[test]
fn pedido_nao_pula_etapas_nem_cancela_depois_de_faturado() {
    assert!(StatusPedido::AguardandoPagamento
        .transicionar(StatusPedido::Faturado)
        .is_err());
    assert!(StatusPedido::Faturado
        .transicionar(StatusPedido::Cancelado)
        .is_err());
    assert!(StatusPedido::Concluido
        .transicionar(StatusPedido::Confirmado)
        .is_err());
}

#[test]
fn orcamento_so_converte_de_aprovado() {
    assert!(!StatusOrcamento::Aprovado.eh_terminal());
    // aprovado → convertido é a única rota de conversão
    assert!(StatusOrcamento::Aprovado
        .transicionar(StatusOrcamento::Convertido)
        .is_ok());
    assert!(StatusOrcamento::Rascunho
        .transicionar(StatusOrcamento::Convertido)
        .is_err());
    assert!(StatusOrcamento::EmAnalise
        .transicionar(StatusOrcamento::Convertido)
        .is_err());
}

#[test]
fn pagamento_estorna_so_de_pago() {
    assert!(StatusPagamento::Pago
        .transicionar(StatusPagamento::Estornado)
        .is_ok());
    assert!(StatusPagamento::Pendente
        .transicionar(StatusPagamento::Estornado)
        .is_err());
    assert!(StatusPagamento::Estornado
        .transicionar(StatusPagamento::Pago)
        .is_err());
}

// ── CNPJ módulo-11 ──────────────────────────────────────────────────────────

use hweld_domain::crm::oportunidade::EstagioOportunidade;
use hweld_domain::financeiro::caixa::{
    fechar, saldo_calculado, CaixaMovimentacao, TipoCaixaMovimentacao,
};
use hweld_domain::fiscal::nota_fiscal::{NotaFiscal, StatusNotaFiscal};
use hweld_domain::shared::validacao::texto;

fn mov(tipo: TipoCaixaMovimentacao, valor: rust_decimal::Decimal) -> CaixaMovimentacao {
    CaixaMovimentacao {
        id: Id::novo(1),
        caixa_id: Id::novo(1),
        tipo,
        valor: Dinheiro::novo(valor),
        forma_pagamento_id: None,
        pagamento_id: None,
        usuario_id: None,
        descricao: None,
        created_at: chrono::Utc::now(),
    }
}

#[test]
fn cnpj_aceita_validos_com_e_sem_mascara() {
    // CNPJs reais com dígitos verificadores corretos.
    assert!(texto::cnpj("cnpj", "04252011000110").is_ok());
    assert!(texto::cnpj("cnpj", "04.252.011/0001-10").is_ok());
    assert!(texto::cnpj("cnpj", "33.000.167/0001-01").is_ok());
    assert!(texto::cnpj("cnpj", "11.222.333/0001-81").is_ok());
}

#[test]
fn cnpj_rejeita_digito_verificador_errado() {
    assert!(texto::cnpj("cnpj", "04252011000111").is_err()); // DV errado
    assert!(texto::cnpj("cnpj", "11.222.333/0001-80").is_err());
}

#[test]
fn cnpj_rejeita_tamanho_errado_e_sequencia_repetida() {
    assert!(texto::cnpj("cnpj", "0425201100011").is_err()); // 13 dígitos
    assert!(texto::cnpj("cnpj", "042520110001100").is_err()); // 15 dígitos
    assert!(texto::cnpj("cnpj", "11111111111111").is_err()); // repetição
    assert!(texto::cnpj("cnpj", "00.000.000/0000-00").is_err());
    assert!(texto::cnpj("cnpj", "").is_err());
}

// ── Caixa: livro-razão e conferência de fechamento ──────────────────────────

#[test]
fn saldo_calculado_acumula_entradas_menos_saidas() {
    let movs = vec![
        mov(TipoCaixaMovimentacao::Suprimento, dec!(100.00)),
        mov(TipoCaixaMovimentacao::Venda, dec!(250.50)),
        mov(TipoCaixaMovimentacao::Sangria, dec!(50.00)),
        mov(TipoCaixaMovimentacao::Despesa, dec!(30.25)),
    ];
    let saldo = saldo_calculado(d(dec!(200.00)), movs);
    // 200 + 100 + 250.50 − 50 − 30.25 = 470.25
    assert_eq!(saldo.valor(), dec!(470.25));
}

#[test]
fn estorno_entra_como_saida_do_caixa() {
    let movs = vec![
        mov(TipoCaixaMovimentacao::Venda, dec!(100.00)),
        mov(TipoCaixaMovimentacao::Estorno, dec!(40.00)),
    ];
    assert_eq!(saldo_calculado(Dinheiro::ZERO, movs).valor(), dec!(60.00));
}

#[test]
fn fechamento_diferenca_e_informado_menos_calculado() {
    let movs = vec![mov(TipoCaixaMovimentacao::Venda, dec!(100.00))];
    let exato = fechar(d(dec!(50.00)), d(dec!(150.00)), movs.clone());
    assert_eq!(exato.diferenca.valor(), dec!(0.00));
    // Quebra de caixa: contou menos do que o calculado.
    let quebra = fechar(d(dec!(50.00)), d(dec!(140.00)), movs.clone());
    assert_eq!(quebra.diferenca.valor(), dec!(-10.00));
    // Sobra.
    let sobra = fechar(d(dec!(50.00)), d(dec!(155.00)), movs);
    assert_eq!(sobra.diferenca.valor(), dec!(5.00));
}

#[test]
fn caixa_fechado_rejeita_nova_movimentacao() {
    let caixa = hweld_domain::financeiro::caixa::Caixa {
        id: Id::novo(1),
        aberto_por: Id::novo(1),
        aberto_em: chrono::Utc::now(),
        valor_abertura: d(dec!(0.00)),
        fechado_por: Some(Id::novo(1)),
        fechado_em: Some(chrono::Utc::now()),
        valor_fechamento_calculado: Some(d(dec!(0.00))),
        valor_fechamento_informado: Some(d(dec!(0.00))),
        diferenca: Some(d(dec!(0.00))),
        status: hweld_domain::financeiro::caixa::StatusCaixa::Fechado,
    };
    assert!(caixa.aceita_movimentacao().is_err());
}

// ── Funil de oportunidades ──────────────────────────────────────────────────

#[test]
fn oportunidade_rejeita_noop_mas_permite_reabrir_terminal() {
    use EstagioOportunidade::*;
    // No-op é a única transição proibida.
    assert!(Negociacao.transicionar(Negociacao).is_err());
    assert!(Ganha.transicionar(Ganha).is_err());
    // Reabrir ganha/perdida é permitido (card não fica preso no kanban).
    assert_eq!(Ganha.transicionar(Proposta).unwrap(), Proposta);
    assert_eq!(Perdida.transicionar(Lead).unwrap(), Lead);
    assert_eq!(Lead.transicionar(Negociacao).unwrap(), Negociacao);
}

// ── Nota fiscal: máquina de estados ─────────────────────────────────────────

#[test]
fn nota_fiscal_segue_fluxo_e_bloqueia_transicoes_ilegais() {
    use StatusNotaFiscal::*;
    assert_eq!(Rascunho.transicionar(Autorizada).unwrap(), Autorizada);
    assert_eq!(Rascunho.transicionar(Rejeitada).unwrap(), Rejeitada);
    assert_eq!(Autorizada.transicionar(Cancelada).unwrap(), Cancelada);
    assert_eq!(Rejeitada.transicionar(Rascunho).unwrap(), Rascunho);
    // Cancelada e Denegada são terminais.
    assert!(Cancelada.transicionar(Rascunho).is_err());
    assert!(Cancelada.transicionar(Autorizada).is_err());
    assert!(Denegada.transicionar(Rascunho).is_err());
    // Não pode autorizar nota já cancelada.
    assert!(Cancelada.transicionar(Autorizada).is_err());
}

// ── Chave de acesso NF-e (44 dígitos + DV módulo-11) ───────────────────────

#[test]
fn chave_de_acesso_valida_44_digitos_numericos() {
    assert!(NotaFiscal::validar_chave("35250100000000000000550010000000131000000135").is_ok());
    assert!(NotaFiscal::validar_chave("123").is_err());
    assert!(NotaFiscal::validar_chave("3525010000000000000055001000000013100000013A").is_err());
}

// ── Sessões: parse de User-Agent em Dispositivo (woothee) ──────────────────

use hweld_domain::acesso::sessao::{CategoriaDispositivo, Dispositivo};

#[test]
fn dispositivo_identifica_desktop_windows_chrome() {
    let d = Dispositivo::de_user_agent(Some(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ));
    assert_eq!(d.categoria, CategoriaDispositivo::Desktop);
    assert_eq!(d.navegador.as_deref(), Some("Chrome"));
    assert!(d.sistema.as_deref().unwrap_or("").contains("Windows"));
}

#[test]
fn dispositivo_identifica_smartphone_e_desconhecido() {
    let android = Dispositivo::de_user_agent(Some(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    ));
    assert_eq!(android.categoria, CategoriaDispositivo::Smartphone);

    // Sem UA ou UA irreconhecível → categoria desconhecida, sem pânico.
    assert_eq!(
        Dispositivo::de_user_agent(None).categoria,
        CategoriaDispositivo::Desconhecido
    );
    assert_eq!(
        Dispositivo::de_user_agent(Some("   ")).categoria,
        CategoriaDispositivo::Desconhecido
    );
    // Ferramentas de linha de comando não são sessões de navegador.
    assert_eq!(
        Dispositivo::de_user_agent(Some("curl/8.0")).categoria,
        CategoriaDispositivo::Desconhecido
    );
}
