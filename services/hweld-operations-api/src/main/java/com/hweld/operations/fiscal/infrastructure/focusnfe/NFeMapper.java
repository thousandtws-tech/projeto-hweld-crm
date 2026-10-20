package com.hweld.operations.fiscal.infrastructure.focusnfe;

import com.hweld.operations.fiscal.application.FiscalDataGateway.DadosFiscaisPedido;
import com.hweld.operations.fiscal.application.FiscalDataGateway.ItemFiscal;
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
 * Converte o conjunto fiscal interno (`DadosFiscaisPedido`) no payload oficial
 * `NFeRequest` da Focus NFe — somente campos documentados na API v2 são
 * emitidos. Campos tributários de item (`icms_*`, `pis_*`, `cofins_*`) saem
 * de `hweld.fiscal.nfe`/`dados` — nunca são inventados.
 *
 * Validação fail-fast: dados insuficientes/ inconsistentes abortam ANTES da
 * chamada HTTP (sem queimar a referência no provedor).
 */
@Component
public class NFeMapper {

    private final FocusNFeProperties props;

    public NFeMapper(FocusNFeProperties props) {
        this.props = props;
    }

    /**
     * Monta o payload NF-e. `dados` aceita suplementos/override controlados:
     * `natureza_operacao`, `finalidade_emissao`, `tipo_documento`,
     * `modalidade_frete`, `presenca_comprador`, `consumidor_final`,
     * `local_destino`, `indicador_ie_destinatario`, `cfop`, `ncm`,
     * `unidade`, `icms_*`, `pis_*`, `cofins_*` (defaults por item) e
     * `valor_outras_despesas`, `valor_seguro`.
     */
    public Map<String, Object> montar(DadosFiscaisPedido dados, Map<String, Object> suplementos) {
        var erros = new ArrayList<String>();
        var sup = suplementos != null ? suplementos : Map.<String, Object>of();
        var emitente = props.emitente();
        var nfe = props.nfe();

        var body = new LinkedHashMap<String, Object>();

        // ── Cabeçalho ────────────────────────────────────────────────────────
        body.put("natureza_operacao", primeiro(sup.get("natureza_operacao"),
                dados.notaFiscal() != null ? dados.notaFiscal().naturezaOperacao() : null,
                nfe != null ? nfe.naturezaOperacao() : null));
        body.put("data_emissao", OffsetDateTime.now(ZoneOffset.UTC)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        body.put("tipo_documento", inteiro(primeiro(sup.get("tipo_documento"),
                nfe != null ? nfe.tipoDocumento() : null), 1));
        body.put("finalidade_emissao", inteiro(primeiro(sup.get("finalidade_emissao"),
                nfe != null ? nfe.finalidadeEmissao() : null), 1));

        // ── Emitente (configuração do serviço — empresa que opera o sistema) ─
        if (emitente == null || !emitente.configurado()) {
            erros.add("emitente não configurado: " +
                    (emitente == null ? "ausente" : String.join(", ", emitente.pendencias())));
        } else {
            body.put("cnpj_emitente", apenasDigitos(emitente.cnpj()));
            body.put("nome_emitente", emitente.nome());
            if (emitente.nomeFantasia() != null && !emitente.nomeFantasia().isBlank()) {
                body.put("nome_fantasia_emitente", emitente.nomeFantasia());
            }
            body.put("logradouro_emitente", emitente.logradouro());
            body.put("numero_emitente", emitente.numero());
            body.put("bairro_emitente", emitente.bairro());
            body.put("municipio_emitente", emitente.municipio());
            body.put("uf_emitente", emitente.uf().trim().toUpperCase());
            body.put("cep_emitente", apenasDigitos(emitente.cep()));
            body.put("regime_tributario_emitente", emitente.regimeTributario());
            if (emitente.inscricaoEstadual() != null && !emitente.inscricaoEstadual().isBlank()) {
                body.put("inscricao_estadual_emitente", apenasDigitos(emitente.inscricaoEstadual()));
            }
        }

        // ── Destinatário (empresa do pedido + endereço de faturamento) ────────
        var empresa = dados.empresa();
        var endereco = dados.enderecoFaturamento();
        if (empresa.cnpj() == null || apenasDigitos(empresa.cnpj()).length() != 14) {
            erros.add("destinatario.cnpj ausente ou inválido (empresa " + empresa.id() + ")");
        } else {
            body.put("cnpj_destinatario", apenasDigitos(empresa.cnpj()));
        }
        body.put("nome_destinatario", empresa.razaoSocial());
        if (endereco == null) {
            erros.add("endereco_faturamento ausente no pedido");
        } else {
            body.put("logradouro_destinatario", endereco.logradouro());
            body.put("numero_destinatario", endereco.numero());
            body.put("bairro_destinatario", endereco.bairro());
            body.put("municipio_destinatario", endereco.cidade());
            body.put("uf_destinatario", endereco.uf().trim().toUpperCase());
            body.put("cep_destinatario", apenasDigitos(endereco.cep()));
            if (endereco.logradouro() == null || endereco.numero() == null
                    || endereco.bairro() == null || apenasDigitos(endereco.cep()).length() != 8) {
                erros.add("endereco_faturamento incompleto (logradouro/numero/bairro/cep)");
            }
        }
        body.put("pais_destinatario", "Brasil");
        if (empresa.telefone() != null && !empresa.telefone().isBlank()) {
            body.put("telefone_destinatario", apenasDigitos(empresa.telefone()));
        }
        String ie = empresa.inscricaoEstadual();
        if (ie != null && !ie.isBlank() && !"ISENTO".equalsIgnoreCase(ie.trim())) {
            body.put("inscricao_estadual_destinatario", apenasDigitos(ie));
            body.put("indicador_inscricao_estadual_destinatario",
                    inteiro(sup.get("indicador_ie_destinatario"), 1));
        } else {
            body.put("indicador_inscricao_estadual_destinatario",
                    inteiro(sup.get("indicador_ie_destinatario"),
                            ie != null && !ie.isBlank() ? 2 : 9));
        }

        // ── Valores ───────────────────────────────────────────────────────────
        var itens = dados.itens();
        if (itens == null || itens.isEmpty()) {
            erros.add("pedido sem itens");
        }
        BigDecimal valorProdutos = BigDecimal.ZERO;
        BigDecimal valorDesconto = dados.pedido().desconto() != null
                ? dados.pedido().desconto() : BigDecimal.ZERO;
        List<Map<String, Object>> items = new ArrayList<>();
        if (itens != null) {
            int pos = 0;
            for (ItemFiscal item : itens) {
                pos++;
                var linha = new LinkedHashMap<String, Object>();
                BigDecimal qtd = item.quantidade() != null ? item.quantidade() : BigDecimal.ZERO;
                BigDecimal unit = item.valorUnitario() != null ? item.valorUnitario() : BigDecimal.ZERO;
                BigDecimal bruto = qtd.multiply(unit).setScale(2, RoundingMode.HALF_UP);
                valorProdutos = valorProdutos.add(bruto);
                if (item.desconto() != null) valorDesconto = valorDesconto.add(item.desconto());

                linha.put("numero_item", pos);
                linha.put("codigo_produto", vazio(item.codigo())
                        ? "ITEM" + pos : item.codigo());
                linha.put("descricao", item.descricao());
                linha.put("cfop", primeiro(sup.get("cfop"), item.cfop(),
                        dados.notaFiscal() != null ? dados.notaFiscal().cfop() : null,
                        nfe != null ? nfe.cfop() : null));
                linha.put("quantidade_comercial", qtd);
                linha.put("valor_unitario_comercial", unit);
                linha.put("valor_bruto", bruto);
                linha.put("codigo_ncm", primeiro(sup.get("ncm"), item.ncm()));
                String unidade = primeiro(sup.get("unidade"), item.unidade(),
                        nfe != null ? nfe.unidade() : null);
                if (unidade != null) linha.put("unidade_comercial", unidade);
                String icmsSt = primeiro(sup.get("icms_situacao_tributaria"),
                        nfe != null ? nfe.icmsSituacaoTributaria() : null);
                if (icmsSt != null) linha.put("icms_situacao_tributaria", icmsSt);
                Integer icmsOrigem = inteiro(primeiro(sup.get("icms_origem"),
                        nfe != null ? nfe.icmsOrigem() : null), -1);
                if (icmsOrigem >= 0) linha.put("icms_origem", icmsOrigem);
                String pisSt = primeiro(sup.get("pis_situacao_tributaria"),
                        nfe != null ? nfe.pisSituacaoTributaria() : null);
                if (pisSt != null) linha.put("pis_situacao_tributaria", pisSt);
                String cofinsSt = primeiro(sup.get("cofins_situacao_tributaria"),
                        nfe != null ? nfe.cofinsSituacaoTributaria() : null);
                if (cofinsSt != null) linha.put("cofins_situacao_tributaria", cofinsSt);
                items.add(linha);
            }
        }
        body.put("items", items);

        BigDecimal frete = dados.pedido().frete() != null
                ? dados.pedido().frete() : BigDecimal.ZERO;
        BigDecimal total = dados.pedido().total() != null
                ? dados.pedido().total() : BigDecimal.ZERO;
        body.put("valor_produtos", valorProdutos.setScale(2, RoundingMode.HALF_UP));
        body.put("valor_desconto", valorDesconto.setScale(2, RoundingMode.HALF_UP));
        body.put("valor_frete", frete.setScale(2, RoundingMode.HALF_UP));
        body.put("valor_total", total.setScale(2, RoundingMode.HALF_UP));
        body.put("modalidade_frete", inteiro(primeiro(sup.get("modalidade_frete"),
                nfe != null ? nfe.modalidadeFrete() : null), frete.signum() > 0 ? 0 : 9));
        if (sup.get("valor_seguro") != null) body.put("valor_seguro", sup.get("valor_seguro"));
        if (sup.get("valor_outras_despesas") != null) {
            body.put("valor_outras_despesas", sup.get("valor_outras_despesas"));
        }

        // Operação: interna quando UF emitente == UF destinatário.
        if (endereco != null && emitente != null && emitente.uf() != null) {
            boolean interna = emitente.uf().trim().equalsIgnoreCase(endereco.uf().trim());
            body.put("local_destino", inteiro(sup.get("local_destino"), interna ? 1 : 2));
        }
        body.put("presenca_comprador", inteiro(primeiro(sup.get("presenca_comprador"),
                nfe != null ? nfe.presencaComprador() : null), 9));
        body.put("consumidor_final", inteiro(primeiro(sup.get("consumidor_final"),
                nfe != null ? nfe.consumidorFinal() : null), 0));

        if (!erros.isEmpty()) {
            throw new NFeValidationException(erros);
        }
        validar(body, erros);
        return body;
    }

    private void validar(Map<String, Object> body, List<String> erros) {
        if (body.get("natureza_operacao") == null) {
            erros.add("natureza_operacao ausente (config hweld.fiscal.nfe.natureza-operacao)");
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        if (items != null) {
            for (int i = 0; i < items.size(); i++) {
                var it = items.get(i);
                String prefixo = "items[" + i + "]";
                if (it.get("descricao") == null || it.get("descricao").toString().isBlank()) {
                    erros.add(prefixo + ".descricao vazia");
                }
                String cfop = (String) it.get("cfop");
                if (cfop == null || !cfop.matches("\\d{4}")) {
                    erros.add(prefixo + ".cfop ausente/inválido — configure hweld.fiscal.nfe.cfop "
                            + "ou cadastre cfop na NF");
                }
                String ncm = (String) it.get("codigo_ncm");
                if (ncm == null || !ncm.matches("\\d{8}")) {
                    erros.add(prefixo + ".codigo_ncm ausente/inválido (8 dígitos) — "
                            + "cadastre NCM no produto");
                }
                if (((BigDecimal) it.get("quantidade_comercial")).signum() <= 0) {
                    erros.add(prefixo + ".quantidade_comercial deve ser > 0");
                }
                if (((BigDecimal) it.get("valor_unitario_comercial")).signum() < 0) {
                    erros.add(prefixo + ".valor_unitario_comercial negativo");
                }
            }
        }
        BigDecimal vProd = (BigDecimal) body.get("valor_produtos");
        BigDecimal vDesc = (BigDecimal) body.get("valor_desconto");
        BigDecimal vFrete = (BigDecimal) body.get("valor_frete");
        BigDecimal vTotal = (BigDecimal) body.get("valor_total");
        BigDecimal esperado = vProd.subtract(vDesc).add(vFrete);
        if (esperado.subtract(vTotal).abs().compareTo(new BigDecimal("0.02")) > 0) {
            erros.add("valor_total inconsistente: produtos(" + vProd + ") - desconto("
                    + vDesc + ") + frete(" + vFrete + ") = " + esperado + " ≠ " + vTotal);
        }
        if (!erros.isEmpty()) {
            throw new NFeValidationException(erros);
        }
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

    /** Dados fiscais insuficientes/inconsistentes — a emissão nem sai da API. */
    public static class NFeValidationException extends RuntimeException {
        private final List<String> erros;

        public NFeValidationException(List<String> erros) {
            super("dados fiscais inválidos: " + String.join("; ", erros));
            this.erros = List.copyOf(erros);
        }

        public List<String> erros() {
            return erros;
        }
    }
}
