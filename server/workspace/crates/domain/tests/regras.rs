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
