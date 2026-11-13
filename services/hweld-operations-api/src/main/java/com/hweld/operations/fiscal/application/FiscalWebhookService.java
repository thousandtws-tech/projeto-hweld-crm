package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.fiscal.domain.FiscalDocumentRepository;
import com.hweld.operations.fiscal.domain.FiscalWebhookEvent;
import com.hweld.operations.fiscal.domain.FiscalWebhookEventRepository;
import com.hweld.operations.fiscal.infrastructure.FiscalWebhookDedupe;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProperties;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProvider;
import com.hweld.operations.shared.infrastructure.audit.AuditLogEntity;
import com.hweld.operations.shared.infrastructure.audit.AuditLogRepository;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Webhook da Focus NFe. Contrato oficial de gatilhos (doc.focusnfe.com.br):
 * a Focus não assina HMAC — a autenticação é o par `authorization` +
 * `authorization_header` configurado no `POST /v2/hooks`; ela repete o
 * segredo no header indicado a cada notificação.
 *
 * O payload da notificação carrega os campos do documento (`ref`, `status`,
 * `chave_nfe`, `numero`, `serie`, `status_sefaz`, `mensagem_sefaz`) — a
 * mesma forma da consulta. Dedupe por (provider, ref+status+sha256(body)):
 * a agenda de reenvio da Focus (1min/30min/1h/3h/24h) repete o mesmo corpo.
 */
@Service
public class FiscalWebhookService {

    private static final Logger log = LoggerFactory.getLogger(FiscalWebhookService.class);
    private static final int MAX_BODY_BYTES = 256 * 1024;

    public enum Result { PROCESSED, DUPLICATE, REJECTED, IGNORED, NO_CHANGE }

    private final FocusNFeProperties props;
    private final FocusNFeProvider provider;
    private final FiscalDocumentRepository documents;
    private final FiscalWebhookEventRepository webhookEvents;
    private final FiscalWebhookDedupe dedupe;
    private final FiscalService fiscalService;
    private final AuditLogRepository auditLogs;
    private final ObjectMapper json;

    public FiscalWebhookService(FocusNFeProperties props, FocusNFeProvider provider,
            FiscalDocumentRepository documents, FiscalWebhookEventRepository webhookEvents,
            FiscalWebhookDedupe dedupe, FiscalService fiscalService,
            AuditLogRepository auditLogs, ObjectMapper json) {
        this.props = props;
        this.provider = provider;
        this.documents = documents;
        this.webhookEvents = webhookEvents;
        this.dedupe = dedupe;
        this.fiscalService = fiscalService;
        this.auditLogs = auditLogs;
        this.json = json;
    }

    @Transactional
    public Result process(String rawBody, String authHeaderValue) {
        // 1) Autenticação: segredo compartilhado configurado no gatilho.
        //    Fail-safe: sem segredo configurado, NENHUM webhook é aceito.
        if (!props.webhookConfigurado()) {
            log.error("fiscal webhook recebido sem FOCUS_NFE_WEBHOOK_AUTH_TOKEN configurado");
            auditLogs.save(new AuditLogEntity("service", "focusnfe", "webhook.unconfigured",
                    "webhook", null, Map.of("payload", "suprimido"), null));
            return Result.REJECTED;
        }
        if (authHeaderValue == null || !MessageDigest.isEqual(
                props.webhookAuthToken().getBytes(StandardCharsets.UTF_8),
                authHeaderValue.getBytes(StandardCharsets.UTF_8))) {
            auditLogs.save(new AuditLogEntity("service", "focusnfe", "webhook.invalid_auth",
                    "webhook", null, Map.of("payload", "suprimido"), null));
            return Result.REJECTED;
        }

        // 2) Tamanho + schema mínimos (ref/status são os campos da notificação).
        if (rawBody == null || rawBody.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) {
            throw ApiException.validacao("payload de webhook ausente ou excede o limite");
        }
        JsonNode body;
        try {
            body = json.readTree(rawBody);
        } catch (Exception e) {
            throw ApiException.validacao("payload de webhook não é JSON válido");
        }
        String ref = body.path("ref").asString(null);
        String status = body.path("status").asString(null);
        if (ref == null || ref.isBlank() || status == null || status.isBlank()) {
            throw ApiException.validacao("webhook sem `ref`/`status` — fora do contrato Focus");
        }

        // 3) Dedupe — chave derivada (a notificação não traz event_id).
        String eventKey = ref + ":" + status + ":" + sha256(rawBody);
        try {
            dedupe.record(new FiscalWebhookEvent(provider.name(), eventKey,
                    json.convertValue(body, Map.class)));
        } catch (DataIntegrityViolationException e) {
            return Result.DUPLICATE;
        }
        var record = webhookEvents.findByProviderAndEventKey(provider.name(), eventKey)
                .orElseThrow(() -> new IllegalStateException("webhook recém-inserido ausente"));

        // 4) Correlação + aplicação — `ref` é o external_id do documento.
        var docOpt = documents.findByProviderAndExternalId(provider.name(), ref);
        if (docOpt.isEmpty()) {
            record.markProcessed(null, "IGNORED", "ref desconhecida");
            webhookEvents.save(record);
            log.warn("fiscal webhook: ref desconhecida {} status {}", ref, status);
            return Result.IGNORED;
        }
        FiscalDocument doc = docOpt.get();
        if (!provider.environment().equals(doc.getEnvironment())) {
            record.markProcessed(doc.getId(), "IGNORED", "ambiente divergente");
            webhookEvents.save(record);
            return Result.IGNORED;
        }
        try {
            var remote = provider.parseWebhook(json.convertValue(body, Map.class));
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

    private static String sha256(String raw) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8));
            var sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "nohash";
        }
    }
}
