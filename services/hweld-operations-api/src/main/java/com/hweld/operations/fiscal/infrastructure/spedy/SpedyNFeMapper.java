package com.hweld.operations.fiscal.infrastructure.spedy;

import com.hweld.operations.fiscal.application.FiscalDataGateway.DadosFiscaisPedido;
import com.hweld.operations.fiscal.application.FiscalDataGateway.ItemFiscal;
import com.hweld.operations.fiscal.application.NFeValidationException;
import com.hweld.operations.fiscal.infrastructure.NfeDefaults;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Converte `DadosFiscaisPedido` no payload `CreateProductInvoiceDto` da Spedy
 * (`POST /v1/product-invoices`) — somente campos do contrato oficial.
 *
 * O emitente NÃO vai no payload: a `X-Api-Key` identifica a empresa na Spedy
 * (cadastro, endereço, série e certificado vivem lá). Defaults tributários de
 * item (`icms_csosn`, `pis_cst`, `cofins_cst`, `cfop`, `ncm`, `unidade`) saem
 * de `hweld.fiscal.nfe`/`dados` — nunca são inventados.
 *
 * Validação fail-fast via `NFeValidationException` antes da chamada HTTP.
 */
@Component
public class SpedyNFeMapper {

    private final NfeDefaults nfe;

    public SpedyNFeMapper(NfeDefaults nfe) {
        this.nfe = nfe;
    }

    /**
     * Monta o payload NF-e. `sup` aceita overrides controlados:
     * `natureza_operacao`, `is_final_customer`/`consumidor_final`,
     * `metodo_pagamento` ou `payments` (array completo), `modalidade_frete`,
     * `cfop`, `ncm`, `unidade`, `icms_situacao_tributaria`, `icms_origem`,
     * `pis_situacao_tributaria`, `cofins_situacao_tributaria`,
     * `im_destinatario`, `informacoes_complementares`.
     */
    public Map<String, Object> montar(String documentId, DadosFiscaisPedido dados,
            Map<String, Object> suplementos) {
        var erros = new ArrayList<String>();
        var sup = suplementos != null ? suplementos : Map.<String, Object>of();

        var body = new LinkedHashMap<String, Object>();
        body.put("integrationId", documentId);
        body.put("effectiveDate", OffsetDateTime.now(ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        body.put("operationNature", primeiro(sup.get("natureza_operacao"),
                dados.notaFiscal() != null ? dados.notaFiscal().naturezaOperacao() : null,
                nfe != null ? nfe.naturezaOperacao() : null,
                "Venda de mercadoria"));

        Object consumidorFinal = primeiro(sup.get("is_final_customer"),
                sup.get("consumidor_final"),
                nfe != null ? nfe.consumidorFinal() : null, Boolean.TRUE);
        body.put("isFinalCustomer", boolOuInteiro(consumidorFinal));

        // ── Destinatário ─────────────────────────────────────────────────────
        var empresa = dados.empresa();
        var endereco = dados.enderecoFaturamento();
        String taxId = apenasDigitos(empresa.cnpj());
        if (taxId.length() != 11 && taxId.length() != 14) {
            erros.add("destinatario.federalTaxNumber ausente/inválido — CPF (11) ou CNPJ (14), "
                    + "empresa " + empresa.id());
        }
        if (endereco == null) {
            erros.add("endereco_faturamento ausente no pedido");
        }

        var receiver = new LinkedHashMap<String, Object>();
        receiver.put("name", empresa.razaoSocial() != null && !empresa.razaoSocial().isBlank()
                ? empresa.razaoSocial() : empresa.nomeFantasia());
        if (taxId.length() == 11 || taxId.length() == 14) {
            receiver.put("federalTaxNumber", taxId);
        }
        String ie = apenasDigitos(empresa.inscricaoEstadual());
        if (!ie.isBlank() && !"ISENTO".equalsIgnoreCase(
                empresa.inscricaoEstadual() == null ? "" : empresa.inscricaoEstadual().trim())) {
            receiver.put("stateTaxNumber", ie);
        }
        String im = primeiro(sup.get("im_destinatario"), sup.get("inscricao_municipal"));
        if (im != null) receiver.put("cityTaxNumber", apenasDigitos(im));
        if (empresa.email() != null && !empresa.email().isBlank()) {
            receiver.put("email", empresa.email().trim());
        }
        String fone = apenasDigitos(empresa.telefone());
        if (!fone.isBlank()) receiver.put("phoneNumber", fone);
        if (endereco != null) {
            var address = new LinkedHashMap<String, Object>();
            address.put("street", endereco.logradouro());
            address.put("number", endereco.numero());
            address.put("district", endereco.bairro());
            address.put("postalCode", apenasDigitos(endereco.cep()));
            if (endereco.complemento() != null && !endereco.complemento().isBlank()) {
                address.put("additionalInformation", endereco.complemento().trim());
            }
            address.put("city", Map.of(
                    "name", endereco.cidade() != null ? endereco.cidade() : "",
                    "state", endereco.uf() != null ? endereco.uf().trim().toUpperCase() : ""));
            receiver.put("address", address);
            if (endereco.logradouro() == null || endereco.numero() == null
                    || endereco.bairro() == null || apenasDigitos(endereco.cep()).length() != 8
                    || endereco.cidade() == null || endereco.uf() == null) {
                erros.add("endereco_faturamento incompleto "
                        + "(logradouro/numero/bairro/cidade/uf/cep)");
            }
        }
        body.put("receiver", receiver);

        // ── Itens ─────────────────────────────────────────────────────────────
        var itens = dados.itens();
        if (itens == null || itens.isEmpty()) {
            erros.add("pedido sem itens");
        }
        BigDecimal valorTotal = BigDecimal.ZERO;
        List<Map<String, Object>> items = new ArrayList<>();
        if (itens != null) {
            int pos = 0;
            for (ItemFiscal item : itens) {
                pos++;
                BigDecimal qtd = item.quantidade() != null ? item.quantidade() : BigDecimal.ZERO;
                BigDecimal unit = item.valorUnitario() != null ? item.valorUnitario() : BigDecimal.ZERO;
                BigDecimal bruto = qtd.multiply(unit).setScale(2, RoundingMode.HALF_UP);
                BigDecimal liquido = item.valorTotal() != null
                        ? item.valorTotal() : bruto;
                valorTotal = valorTotal.add(liquido);

                var linha = new LinkedHashMap<String, Object>();
                linha.put("code", vazio(item.codigo()) ? "ITEM" + pos : item.codigo());
                linha.put("description", item.descricao());
                String ncm = primeiro(sup.get("ncm"), item.ncm());
                if (ncm != null) linha.put("ncm", apenasDigitos(ncm));
                String cfop = primeiro(sup.get("cfop"), item.cfop(),
                        dados.notaFiscal() != null ? dados.notaFiscal().cfop() : null,
                        nfe != null ? nfe.cfop() : null);
                if (cfop != null && apenasDigitos(cfop).matches("\\d{4}")) {
                    linha.put("cfop", Integer.parseInt(apenasDigitos(cfop)));
                } else if (cfop != null) {
                    linha.put("cfop", cfop);
                }
                String unidade = primeiro(sup.get("unidade"), item.unidade(),
                        nfe != null ? nfe.unidade() : null);
                if (unidade != null) linha.put("unit", unidade);
                linha.put("quantity", qtd);
                linha.put("unitAmount", unit);
                // Item inline exige o trio tributável — espelha comercial
                // (embalagem ≠ tributável só via suplemento por item, fora de escopo).
                linha.put("unitTax", unidade != null ? unidade : "UN");
                linha.put("quantityTax", qtd);
                linha.put("unitTaxAmount", unit);
                linha.put("totalAmount", liquido.setScale(2, RoundingMode.HALF_UP));

                linha.put("taxes", taxes(sup, nfe));
                items.add(linha);
            }
        }
        body.put("items", items);

        // ── Pagamentos (obrigatório desde a NF-e 4.0) ─────────────────────────
        BigDecimal frete = dados.pedido().frete() != null
                ? dados.pedido().frete() : BigDecimal.ZERO;
        BigDecimal total = dados.pedido().total() != null
                ? dados.pedido().total() : valorTotal.add(frete);
        Object paymentsSup = sup.get("payments");
        if (paymentsSup instanceof List<?> lista && !lista.isEmpty()) {
            body.put("payments", lista);
        } else {
            String metodo = primeiro(sup.get("metodo_pagamento"), "bankDeposit");
            body.put("payments", List.of(Map.of(
                    "method", metodo,
                    "amount", total.setScale(2, RoundingMode.HALF_UP))));
        }

        // ── Transporte — só quando há frete físico ────────────────────────────
        if (frete.signum() > 0) {
            body.put("transport", Map.of(
                    "freightModality", inteiro(sup.get("modalidade_frete"), 0)));
        }

        String obs = primeiro(sup.get("informacoes_complementares"), sup.get("observacao"));
        if (obs != null) body.put("additionalInformation", obs);

        // ── Validação final ───────────────────────────────────────────────────
        if (items.isEmpty()) {
            // já registrado acima
        } else {
            for (int i = 0; i < items.size(); i++) {
                var it = items.get(i);
                String prefixo = "items[" + i + "]";
                if (it.get("description") == null || it.get("description").toString().isBlank()) {
                    erros.add(prefixo + ".description vazia");
                }
                if (it.get("cfop") == null) {
                    erros.add(prefixo + ".cfop ausente — configure hweld.fiscal.nfe.cfop "
                            + "ou cadastre cfop na NF");
                }
                String ncm = (String) it.get("ncm");
                if (ncm == null || !ncm.matches("\\d{8}")) {
                    erros.add(prefixo + ".ncm ausente/inválido (8 dígitos) — "
                            + "cadastre NCM no produto");
                }
                if (((BigDecimal) it.get("quantity")).signum() <= 0) {
                    erros.add(prefixo + ".quantity deve ser > 0");
                }
            }
        }
        if (!erros.isEmpty()) {
            throw new NFeValidationException(erros);
        }
        return body;
    }

    /** `taxes` do item — CSOSN (3 dígitos, Simples) vs CST (2 dígitos, normal). */
    private Map<String, Object> taxes(Map<String, Object> sup, NfeDefaults nfe) {
        var taxes = new LinkedHashMap<String, Object>();
        var icms = new LinkedHashMap<String, Object>();
        Integer origem = inteiro(primeiro(sup.get("icms_origem"),
                nfe != null ? nfe.icmsOrigem() : null), -1);
        if (origem >= 0) icms.put("origin", origem);
        String situacao = primeiro(sup.get("icms_situacao_tributaria"),
                nfe != null ? nfe.icmsSituacaoTributaria() : null);
        if (situacao != null) {
            String digits = apenasDigitos(situacao);
            if (digits.length() == 3) icms.put("csosn", Integer.parseInt(digits));
            else if (digits.length() == 2) icms.put("cst", Integer.parseInt(digits));
            else icms.put("csosn", situacao);
        }
        if (!icms.isEmpty()) taxes.put("icms", icms);
        String pis = primeiro(sup.get("pis_situacao_tributaria"),
                nfe != null ? nfe.pisSituacaoTributaria() : null);
        if (pis != null) taxes.put("pis", Map.of("cst", inteiroOuTexto(pis)));
        String cofins = primeiro(sup.get("cofins_situacao_tributaria"),
                nfe != null ? nfe.cofinsSituacaoTributaria() : null);
        if (cofins != null) taxes.put("cofins", Map.of("cst", inteiroOuTexto(cofins)));
        return taxes;
    }

    private static Object inteiroOuTexto(String v) {
        String d = apenasDigitos(v);
        return d.matches("\\d{2}") ? Integer.parseInt(d) : v;
    }

    private static boolean boolOuInteiro(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return !"0".equals(v.toString().trim()) && !"false".equalsIgnoreCase(v.toString().trim());
    }

    private static String primeiro(Object... candidatos) {
        for (Object c : candidatos) {
            if (c != null && !c.toString().isBlank()) return c.toString();
        }
        return null;
    }

    private static int inteiro(Object v, int fallback) {
        if (v == null) return fallback;
        if (v instanceof Number n) return n.intValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        try {
            return Integer.parseInt(v.toString().trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static boolean vazio(String v) {
        return v == null || v.isBlank();
    }

    private static String apenasDigitos(String v) {
        return v == null ? "" : v.replaceAll("\\D", "");
    }
}
