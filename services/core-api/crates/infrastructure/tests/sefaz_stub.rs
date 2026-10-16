//! Contrato do stub fiscal — a chave de acesso gerada segue o formato NF-e
//! real (44 dígitos, DV módulo-11 válido), garantindo que a troca futura pelo
/// transmissor SEFAZ de produção não mude o contrato observado pelos
/// consumidores (admin, portal, auditoria).
use hweld_application::ports::externos::GatewayFiscal;
use hweld_domain::fiscal::nota_fiscal::{NotaFiscal, StatusNotaFiscal, TipoNotaFiscal};
use hweld_domain::shared::id::Id;
use hweld_infrastructure::fiscal::sefaz_stub::GatewayFiscalStub;

fn nf(numero: &str, id: i64) -> NotaFiscal {
    NotaFiscal {
        id: Id::novo(id),
        numero: numero.into(),
        serie: Some("1".into()),
        chave_acesso: None,
        pedido_id: Id::novo(1),
        empresa_id: Id::novo(1),
        tipo: TipoNotaFiscal::Saida,
        status: StatusNotaFiscal::Rascunho,
        natureza_operacao: None,
        cfop: None,
        emitida_em: None,
        valor_produtos: None,
        valor_frete: None,
        valor_desconto: None,
        valor_total: None,
        protocolo_autorizacao: None,
        xml_path: None,
        pdf_path: None,
        motivo_cancelamento: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    }
}

/// DV da chave NF-e: pesos 2..9 ciclando da direita para a esquerda.
fn dv_mod11(chave43: &str) -> u32 {
    let soma: u32 = chave43
        .chars()
        .rev()
        .enumerate()
        .map(|(i, c)| c.to_digit(10).unwrap() * ((i % 8) as u32 + 2))
        .sum();
    let dv = 11 - (soma % 11);
    if dv >= 10 {
        0
    } else {
        dv
    }
}

#[tokio::test]
async fn autorizar_gera_chave_nfe_com_dv_valido() {
    let gw = GatewayFiscalStub::novo();
    let auth = gw.autorizar(&nf("123", 1)).await.unwrap();

    assert_eq!(auth.chave_acesso.len(), 44);
    assert!(auth.chave_acesso.chars().all(|c| c.is_ascii_digit()));

    let (base, dv) = auth.chave_acesso.split_at(43);
    assert_eq!(dv, dv_mod11(base).to_string());

    assert!(!auth.protocolo.is_empty());
    assert!(auth.xml_path.is_some());
}

#[tokio::test]
async fn chaves_sao_distintas_por_numero_da_nota() {
    let gw = GatewayFiscalStub::novo();
    let a = gw.autorizar(&nf("1", 1)).await.unwrap();
    let b = gw.autorizar(&nf("2", 2)).await.unwrap();
    assert_ne!(a.chave_acesso, b.chave_acesso);
}

#[tokio::test]
async fn cancelar_sempre_sucede_no_stub() {
    let gw = GatewayFiscalStub::novo();
    gw.cancelar(&nf("1", 1), "erro de digitação do pedido")
        .await
        .unwrap();
}
