package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.fiscal.domain.FiscalDocumentRepository;
import com.hweld.operations.fiscal.domain.FiscalWebhookEvent;
import com.hweld.operations.fiscal.domain.FiscalWebhookEventRepository;
import com.hweld.operations.fiscal.infrastructure.FiscalWebhookDedupe;
import com.hweld.operations.fiscal.infrastructure.spedy.SpedyProvider;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.infrastructure.audit.AuditLogEntity;
import com.hweld.operations.shared.infrastructure.audit.AuditLogRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Webhook da Spedy — assinatura padrão [Standard Webhooks]
 * (docs.spedy.com.br/webhooks/assinatura):
 *
 *   conteúdo assinado: {webhook-id}.{webhook-timestamp}.{corpo cru}
 *   assinatura: HMAC-SHA256 em base64, chave = segredo `whsec_` sem o prefixo
 *   header: `webhook-signature: v1,<b64> [v1,<b64> ...]` (rotação suportada)
 *   tolerância: 5 minutos no `webhook-timestamp`
 *   dedupe: `webhook-id` (id da entrega, estável entre retentativas)
 *
 * O segredo é obtido da própria Spedy (`GET /v1/webhooks/secret`) e guardado
 * cifrado em `integration_settings`. Fail-safe: sem segredo, NADA é aceito.
 */
@Service
public class SpedyWebhookService {

    private static final Logger log = LoggerFactory.getLogger(SpedyWebhookService.class);
    private static final int MAX_BODY_BYTES = 256 * 1024;
    private static final long TOLERANCIA_SEGUNDOS = 300;

    public enum Result { PROCESSED, DUPLICATE, REJECTED, IGNORED, NO_CHANGE }

    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final SpedyProvider provider;
    private final FiscalDocumentRepository documents;
    private final FiscalWebhookEventRepository webhookEvents;
    private final FiscalWebhookDedupe dedupe;
    private final FiscalService fiscalService;
    private final AuditLogRepository auditLogs;
    private final ObjectMapper json;

    public SpedyWebhookService(IntegrationSettingsRepository settings,
            CredentialCipher cipher, SpedyProvider provider,
            FiscalDocumentRepository documents, FiscalWebhookEventRepository webhookEvents,
            FiscalWebhookDedupe dedupe, FiscalService fiscalService,
            AuditLogRepository auditLogs, ObjectMapper json) {
        this.settings = settings;
        this.cipher = cipher;
        this.provider = provider;
        this.documents = documents;
        this.webhookEvents = webhookEvents;
        this.dedupe = dedupe;
        this.fiscalService = fiscalService;
        this.auditLogs = auditLogs;
        this.json = json;
    }

    @Transactional
    public Result process(String rawBody, String webhookId, String webhookTimestamp,
            String webhookSignature) {
        // 1) Autenticação: segredo whsec_ da conta, obtido da API e cifrado.
        //    Fail-safe: sem segredo armazenado, NENHUM evento é aceito.
        String secret = secret();
        if (secret == null) {
            log.error("spedy webhook recebido sem segredo armazenado — "
                    + "sincronize a integração (GET /v1/webhooks/secret)");
            auditLogs.save(new AuditLogEntity("service", "spedy", "webhook.unconfigured",
                    "webhook", null, Map.of("payload", "suprimido"), null));
            return Result.REJECTED;
        }
        if (!assinaturaValida(secret, webhookId, webhookTimestamp, webhookSignature, rawBody)) {
            auditLogs.save(new AuditLogEntity("service", "spedy", "webhook.invalid_signature",
                    "webhook", null, Map.of("payload", "suprimido"), null));
            return Result.REJECTED;
        }

        // 2) Tamanho + schema mínimos do envelope `{id, event, data}`.
        if (rawBody == null || rawBody.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) {
            throw ApiException.validacao("payload de webhook ausente ou excede o limite");
        }
        JsonNode body;
        try {
            body = json.readTree(rawBody);
        } catch (Exception e) {
            throw ApiException.validacao("payload de webhook não é JSON válido");
        }
        String event = body.path("event").asString(null);
        JsonNode data = body.path("data");
        if (event == null || event.isBlank() || data.isMissingNode()) {
            throw ApiException.validacao("webhook sem `event`/`data` — fora do contrato Spedy");
        }

        // 3) Dedupe — `webhook-id` é estável entre retentativas (oficial).
        String eventKey = webhookId != null && !webhookId.isBlank()
                ? webhookId : body.path("id").asString("sem-id");
        try {
            dedupe.record(new FiscalWebhookEvent(provider.name(), eventKey,
                    json.convertValue(body, Map.class)));
        } catch (DataIntegrityViolationException e) {
            return Result.DUPLICATE;
        }
        var record = webhookEvents.findByProviderAndEventKey(provider.name(), eventKey)
                .orElseThrow(() -> new IllegalStateException("webhook recém-inserido ausente"));

        // 4) Somente eventos de emissão alimentam o ciclo de vida do documento.
        //    `inbound_invoice.*` (notas recebidas) fica registrado para fase futura.
        if (!event.startsWith("invoice.")) {
            record.markProcessed(null, "IGNORED", "evento " + event + " fora do escopo");
            webhookEvents.save(record);
            return Result.IGNORED;
        }
        String invoiceId = data.path("id").asString(null);
        if (invoiceId == null || invoiceId.isBlank()) {
            record.markProcessed(null, "IGNORED", "data.id ausente");
            webhookEvents.save(record);
            return Result.IGNORED;
        }

        // 5) Correlação + aplicação — `data.id` é o external_id do documento.
        var docOpt = documents.findByProviderAndExternalId(provider.name(), invoiceId);
        if (docOpt.isEmpty()) {
            record.markProcessed(null, "IGNORED", "nota desconhecida");
            webhookEvents.save(record);
            log.warn("spedy webhook: nota desconhecida {} status {}", invoiceId,
                    data.path("status").asString("?"));
            return Result.IGNORED;
        }
        FiscalDocument doc = docOpt.get();
        if (!provider.environment().equals(doc.getEnvironment())) {
            record.markProcessed(doc.getId(), "IGNORED", "ambiente divergente");
            webhookEvents.save(record);
            return Result.IGNORED;
        }
        try {
            var remote = provider.parseWebhook(data);
            boolean mudou = fiscalService.applyWebhookStatus(doc, remote);
            record.markProcessed(doc.getId(), mudou ? "PROCESSED" : "PROCESSED_NO_CHANGE", null);
            webhookEvents.save(record);
            return mudou ? Result.PROCESSED : Result.NO_CHANGE;
        } catch (Exception e) {
            record.markProcessed(doc.getId(), "FAILED", e.getMessage());
            webhookEvents.save(record);
            throw e;
        }
    }

    /** Segredo `whsec_` armazenado (cifrado) — `null` quando ainda não sincronizado. */
    private String secret() {
        return settings.findById(IntegrationSettings.SPEDY_FISCAL)
                .map(IntegrationSettings::getWebhookSecretEnc)
                .map(cipher::decrypt)
                .orElse(null);
    }

    /**
     * Verificação Standard Webhooks: `HMAC-SHA256({id}.{ts}.{body})` em base64,
     * comparada em tempo constante com cada entrada `v1,` do header.
     */
    static boolean assinaturaValida(String secret, String id, String timestamp,
            String signatureHeader, String rawBody) {
        if (id == null || timestamp == null || signatureHeader == null || rawBody == null) {
            return false;
        }
        long ts;
        try {
            ts = Long.parseLong(timestamp.trim());
        } catch (NumberFormatException e) {
            return false;
        }
        long agora = System.currentTimeMillis() / 1000;
        if (Math.abs(agora - ts) > TOLERANCIA_SEGUNDOS) return false;

        byte[] chave;
        try {
            chave = Base64.getDecoder().decode(
                    secret.startsWith("whsec_") ? secret.substring(6) : secret);
        } catch (IllegalArgumentException e) {
            return false;
        }
        byte[] esperado;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(chave, "HmacSHA256"));
            esperado = mac.doFinal(
                    (id + "." + timestamp.trim() + "." + rawBody)
                            .getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return false;
        }
        for (String parte : signatureHeader.split(" ")) {
            int virgula = parte.indexOf(',');
            if (virgula < 0 || !"v1".equals(parte.substring(0, virgula))) continue;
            byte[] recebida;
            try {
                recebida = Base64.getDecoder().decode(parte.substring(virgula + 1));
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (MessageDigest.isEqual(esperado, recebida)) return true;
        }
        return false;
    }
}
