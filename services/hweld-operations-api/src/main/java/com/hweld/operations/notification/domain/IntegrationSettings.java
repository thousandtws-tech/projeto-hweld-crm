package com.hweld.operations.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Configuração operacional + credenciais de uma integração
 * (`integration_settings`), gerenciada pelo cliente no painel.
 * `apiKeyEnc`/`webhookSecretEnc` são cifrados (AES-GCM) — a entidade só
 * carrega ciphertext; quem lê/escreve passa pelo `CredentialCipher`.
 * `versao` implementa optimistic locking do formulário (409 em divergência).
 */
@Entity
@Table(name = "integration_settings")
public class IntegrationSettings {

    public static final String INFOBIP_SMS = "infobip-sms";
    public static final String ZAPI_WHATSAPP = "zapi-whatsapp";
    public static final String SPEDY_FISCAL = "spedy-fiscal";
    public static final String MELHOR_ENVIO_FRETE = "melhorenvio-frete";
    public static final String PAGBANK_PAGAMENTOS = "pagbank-pagamentos";

    @Id
    @Column(length = 40)
    private String code;

    @Version
    @Column(nullable = false)
    private long versao;

    @Column(name = "nome_conta", length = 120)
    private String nomeConta;

    @Column(nullable = false)
    private boolean enabled = false;

    /** Endpoint da conta — ex.: `https://xxxxxx.api.infobip.com` (HTTPS). */
    @Column(name = "base_url", length = 200)
    private String baseUrl;

    /** API key cifrada — write-only para o exterior. */
    @Column(name = "api_key_enc", columnDefinition = "text")
    private String apiKeyEnc;

    /** Segredo do callback DLR, gerado no servidor — cifrado. */
    @Column(name = "webhook_secret_enc", columnDefinition = "text")
    private String webhookSecretEnc;

    /** ID externo do recurso do provider — ex.: instance ID da Z-API. */
    @Column(name = "external_id", length = 80)
    private String externalId;

    /** Segundo segredo cifrado — ex.: Client-Token da conta Z-API. */
    @Column(name = "client_token_enc", columnDefinition = "text")
    private String clientTokenEnc;

    /** Remetente autorizado no painel Infobip (alfa ou E.164). */
    @Column(length = 32)
    private String sender;

    @Column(name = "max_segments", nullable = false)
    private int maxSegments = 3;

    /** Congela o canal sem desligar — itens aguardam na fila. */
    @Column(name = "envio_pausado", nullable = false)
    private boolean envioPausado = false;

    /** Destinatários E.164 do SMS de teste — vazia = sem restrição. */
    @JdbcTypeCode(SqlTypes.JSON)
    private List<String> testRecipients = List.of();

    /** eventType → boolean — gatilhos SMS por evento (nascem desligados). */
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Boolean> events = Map.of();

    /** Resultado do último "Testar conexão" — {at, ok, detail}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "last_check")
    private Map<String, Object> lastCheck;

    /** Config genérica do provider (ex.: cep_origem, servicos) — campos
     *  que não cabem nas colunas tipadas. Sem segredos: segredos vivem
     *  exclusivamente nas colunas `*_enc`. */
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> config = Map.of();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by", length = 120)
    private String updatedBy;

    protected IntegrationSettings() {}

    /** Nova integração nasce desativada — opt-in explícito do admin. */
    public static IntegrationSettings criar(String code) {
        IntegrationSettings s = new IntegrationSettings();
        s.code = code;
        return s;
    }

    public boolean isEventEnabled(String eventType) {
        return enabled && !envioPausado && Boolean.TRUE.equals(events.get(eventType));
    }

    /** Lista vazia = teste livre (admin); preenchida = só os E.164 dela. */
    public boolean isTestRecipientAllowed(String e164) {
        return testRecipients == null || testRecipients.isEmpty()
                || testRecipients.contains(e164);
    }

    /** Credenciais mínimas para o adapter Infobip enviar de fato. */
    public boolean credenciaisCompletas() {
        return baseUrl != null && !baseUrl.isBlank()
                && apiKeyEnc != null && !apiKeyEnc.isBlank()
                && sender != null && !sender.isBlank();
    }

    /** Credenciais mínimas para o adapter Z-API: instance ID + token + Client-Token. */
    public boolean credenciaisZapiCompletas() {
        return externalId != null && !externalId.isBlank()
                && apiKeyEnc != null && !apiKeyEnc.isBlank()
                && clientTokenEnc != null && !clientTokenEnc.isBlank();
    }

    /** Credenciais mínimas para o adapter Spedy: `X-Api-Key` + ambiente (base URL). */
    public boolean credenciaisSpedyCompletas() {
        return baseUrl != null && !baseUrl.isBlank()
                && apiKeyEnc != null && !apiKeyEnc.isBlank();
    }

    /** Credenciais mínimas para o adapter Melhor Envio: Bearer token,
     *  ambiente e CEP de origem das coletas (`config.cep_origem`). */
    public boolean credenciaisMelhorEnvioCompletas() {
        return baseUrl != null && !baseUrl.isBlank()
                && apiKeyEnc != null && !apiKeyEnc.isBlank()
                && cepOrigem() != null;
    }

    /** CEP de origem das coletas — `config.cep_origem`, só dígitos ou null. */
    public String cepOrigem() {
        Object v = config != null ? config.get("cep_origem") : null;
        if (v == null) return null;
        String cep = v.toString().replaceAll("\\D", "");
        return cep.length() == 8 ? cep : null;
    }

    /** Update da linha Z-API — reusa pausa/destinatários/eventos; ignora campos SMS. */
    public void atualizarZapi(String nomeConta, boolean enabled, String externalId,
            boolean envioPausado, List<String> testRecipients,
            Map<String, Boolean> events, String updatedBy) {
        this.nomeConta = nomeConta == null || nomeConta.isBlank() ? null : nomeConta.trim();
        this.enabled = enabled;
        this.externalId = externalId == null || externalId.isBlank() ? null : externalId.trim();
        this.envioPausado = envioPausado;
        this.testRecipients = testRecipients == null ? List.of() : List.copyOf(testRecipients);
        this.events = events == null ? Map.of() : Map.copyOf(events);
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
    }

    /**
     * Update da linha Spedy — `baseUrl` guarda o ambiente da API
     * (`https://api.spedy.com.br` | `https://sandbox-api.spedy.com.br`),
     * `externalId` o id da empresa, `envioPausado` pausa emissões.
     */
    public void atualizarSpedy(String nomeConta, boolean enabled, String baseUrl,
            String externalId, boolean envioPausado,
            Map<String, Boolean> events, String updatedBy) {
        this.nomeConta = nomeConta == null || nomeConta.isBlank() ? null : nomeConta.trim();
        this.enabled = enabled;
        this.baseUrl = baseUrl == null || baseUrl.isBlank() ? null : baseUrl.trim();
        this.externalId = externalId == null || externalId.isBlank() ? null : externalId.trim();
        this.envioPausado = envioPausado;
        this.events = events == null ? Map.of() : Map.copyOf(events);
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
    }

    /**
    /** Credenciais mínimas para o adapter PagBank: Bearer token + ambiente. */
    public boolean credenciaisPagBankCompletas() {
        return baseUrl != null && !baseUrl.isBlank()
                && apiKeyEnc != null && !apiKeyEnc.isBlank();
    }

    /**
     * Update da linha PagBank — `baseUrl` guarda o ambiente da API
     * (`https://api.pagseguro.com` produção | `https://sandbox.api.pagseguro.com`
     * sandbox), `externalId` o e-mail/nome da conta, `envioPausado` pausa
     * a criação de cobranças sem desligar a integração.
     */
    public void atualizarPagBank(String nomeConta, boolean enabled, String baseUrl,
            String externalId, boolean envioPausado, String updatedBy) {
        this.nomeConta = nomeConta == null || nomeConta.isBlank() ? null : nomeConta.trim();
        this.enabled = enabled;
        this.baseUrl = normalizeBaseUrl(baseUrl);
        this.externalId = externalId == null || externalId.isBlank() ? null : externalId.trim();
        this.envioPausado = envioPausado;
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
    }

    /**
     * Update da linha Melhor Envio — `baseUrl` guarda o ambiente da API
     * (`https://melhorenvio.com.br` produção | `https://sandbox.melhorenvio.com.br`
     * sandbox), `externalId` o id do usuário na conta, `envioPausado` pausa
     * cotações, `config` guarda cep_origem/serviços permitidos.
     */
    public void atualizarMelhorEnvio(String nomeConta, boolean enabled, String baseUrl,
            String externalId, boolean envioPausado, Map<String, Object> config,
            String updatedBy) {
        this.nomeConta = nomeConta == null || nomeConta.isBlank() ? null : nomeConta.trim();
        this.enabled = enabled;
        this.baseUrl = normalizeBaseUrl(baseUrl);
        this.externalId = externalId == null || externalId.isBlank() ? null : externalId.trim();
        this.envioPausado = envioPausado;
        this.config = config == null ? Map.of() : Map.copyOf(config);
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
    }

    public void definirClientToken(String enc) {
        this.clientTokenEnc = enc;
        this.updatedAt = Instant.now();
    }

    public void atualizar(String nomeConta, boolean enabled, String baseUrl,
            String sender, int maxSegments, boolean envioPausado,
            List<String> testRecipients, Map<String, Boolean> events,
            String updatedBy) {
        this.nomeConta = nomeConta == null || nomeConta.isBlank() ? null : nomeConta.trim();
        this.enabled = enabled;
        this.baseUrl = normalizeBaseUrl(baseUrl);
        this.sender = sender == null || sender.isBlank() ? null : sender.trim();
        this.maxSegments = Math.max(1, Math.min(maxSegments, 10));
        this.envioPausado = envioPausado;
        this.testRecipients = testRecipients == null ? List.of() : List.copyOf(testRecipients);
        this.events = events == null ? Map.of() : Map.copyOf(events);
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
    }

    public void definirApiKey(String enc) {
        this.apiKeyEnc = enc;
        this.updatedAt = Instant.now();
    }

    public void definirWebhookSecret(String enc) {
        this.webhookSecretEnc = enc;
        this.updatedAt = Instant.now();
    }

    public void registrarCheck(boolean ok, String detail) {
        this.lastCheck = Map.of(
                "at", Instant.now().toString(),
                "ok", ok,
                "detail", detail == null ? "" : detail);
    }

    private static String normalizeBaseUrl(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String url = raw.trim();
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    public String getCode() { return code; }
    public long getVersao() { return versao; }
    public String getNomeConta() { return nomeConta; }
    public boolean isEnabled() { return enabled; }
    public String getBaseUrl() { return baseUrl; }
    public String getApiKeyEnc() { return apiKeyEnc; }
    public String getWebhookSecretEnc() { return webhookSecretEnc; }
    public String getExternalId() { return externalId; }
    public String getClientTokenEnc() { return clientTokenEnc; }
    public String getSender() { return sender; }
    public int getMaxSegments() { return maxSegments; }
    public boolean isEnvioPausado() { return envioPausado; }
    public List<String> getTestRecipients() { return testRecipients; }
    public Map<String, Boolean> getEvents() { return events; }
    public Map<String, Object> getLastCheck() { return lastCheck; }
    public Map<String, Object> getConfig() { return config != null ? config : Map.of(); }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getUpdatedBy() { return updatedBy; }
}
