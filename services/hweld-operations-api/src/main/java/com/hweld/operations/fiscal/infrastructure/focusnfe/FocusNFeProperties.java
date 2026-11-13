package com.hweld.operations.fiscal.infrastructure.focusnfe;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuração da Focus NFe API v2 (doc.focusnfe.com.br).
 *
 * Ambientes isolados: `homologacao` e `producao` têm URL e token próprios —
 * nunca há fallback automático de um para o outro. Produção exige habilitação
 * explícita (`production-enabled`) além do token, para impedir emissão de
 * documentos fiscais válidos por acidente de configuração.
 *
 * Prefixo: `hweld.fiscal.focus`.
 */
@ConfigurationProperties(prefix = "hweld.fiscal.focus")
public record FocusNFeProperties(
        String environment,
        String homologationUrl,
        String productionUrl,
        String homologationToken,
        String productionToken,
        boolean productionEnabled,
        long timeoutMs,
        long downloadTimeoutMs,
        String webhookAuthToken,
        String webhookAuthHeader,
        String webhookUrl,
        Emitente emitente,
        NfeDefaults nfe) {

    public static final String ENV_HOMOLOGACAO = "homologacao";
    public static final String ENV_PRODUCAO = "producao";

    public FocusNFeProperties {
        if (environment == null || environment.isBlank()) environment = ENV_HOMOLOGACAO;
        if (!ENV_HOMOLOGACAO.equals(environment) && !ENV_PRODUCAO.equals(environment)) {
            throw new IllegalStateException(
                    "hweld.fiscal.focus.environment inválido: '" + environment
                            + "' — use homologacao|producao");
        }
        if (homologationUrl == null || homologationUrl.isBlank()) {
            homologationUrl = "https://homologacao.focusnfe.com.br";
        }
        if (productionUrl == null || productionUrl.isBlank()) {
            productionUrl = "https://api.focusnfe.com.br";
        }
        if (timeoutMs <= 0) timeoutMs = 30_000;
        if (downloadTimeoutMs <= 0) downloadTimeoutMs = 15_000;
        if (webhookAuthHeader == null || webhookAuthHeader.isBlank()) {
            webhookAuthHeader = "X-Webhook-Token";
        }
    }

    /** URL base do ambiente ativo — sem barra final. */
    public String baseUrl() {
        String url = ENV_PRODUCAO.equals(environment) ? productionUrl : homologationUrl;
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    /** `true` quando o ambiente ativo é produção. */
    public boolean producao() {
        return ENV_PRODUCAO.equals(environment);
    }

    /**
     * Token do ambiente ativo. Fail-fast: token ausente e produção sem
     * habilitação explícita impedem a emissão — nunca emite sem credencial.
     */
    public String token() {
        if (producao() && !productionEnabled) {
            throw new IllegalStateException(
                    "emissão em PRODUCAO bloqueada — defina "
                            + "FOCUS_NFE_PRODUCTION_ENABLED=true para habilitar explicitamente");
        }
        String t = producao() ? productionToken : homologationToken;
        if (t == null || t.isBlank()) {
            String envVar = producao() ? "FOCUS_NFE_PRODUCTION_TOKEN" : "FOCUS_NFE_HOMOLOGATION_TOKEN";
            throw new IllegalStateException(
                    "token Focus NFe ausente para o ambiente " + environment
                            + " — configure " + envVar);
        }
        return t.trim();
    }

    /** Ambiente ativo no formato persistido em `fiscal_documents.environment`. */
    public String environment() {
        return environment;
    }

    /** `true` quando há segredo de webhook configurado. */
    public boolean webhookConfigurado() {
        return webhookAuthToken != null && !webhookAuthToken.isBlank();
    }

    /** Campos fiscais do emitente — a empresa que opera o sistema. */
    public record Emitente(
            String cnpj,
            String nome,
            String nomeFantasia,
            String inscricaoEstadual,
            String logradouro,
            String numero,
            String bairro,
            String municipio,
            String uf,
            String cep,
            Integer regimeTributario,
            String inscricaoMunicipal) {

        /** Campos mínimos para montar o bloco emitente do payload NF-e. */
        public List<String> pendencias() {
            var faltando = new java.util.ArrayList<String>();
            if (vazio(cnpj)) faltando.add("cnpj");
            if (vazio(nome)) faltando.add("nome");
            if (vazio(logradouro)) faltando.add("logradouro");
            if (vazio(numero)) faltando.add("numero");
            if (vazio(bairro)) faltando.add("bairro");
            if (vazio(municipio)) faltando.add("municipio");
            if (vazio(uf)) faltando.add("uf");
            if (vazio(cep)) faltando.add("cep");
            if (regimeTributario == null) faltando.add("regime-tributario");
            return faltando;
        }

        public boolean configurado() {
            return pendencias().isEmpty();
        }

        private static boolean vazio(String v) {
            return v == null || v.isBlank();
        }
    }

    /** Defaults aplicados aos itens/nota quando ausentes no cadastro/pedido. */
    public record NfeDefaults(
            String naturezaOperacao,
            String cfop,
            String unidade,
            Integer tipoDocumento,
            Integer finalidadeEmissao,
            Integer modalidadeFrete,
            Integer presencaComprador,
            Boolean consumidorFinal,
            Integer indicadorIeDestinatario,
            String icmsSituacaoTributaria,
            String pisSituacaoTributaria,
            String cofinsSituacaoTributaria,
            Integer icmsOrigem) {
    }
}
