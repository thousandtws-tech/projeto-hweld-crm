package com.hweld.operations.payment.application;

import com.hweld.operations.payment.domain.Payment;
import com.hweld.operations.payment.domain.PaymentRepository;
import com.hweld.operations.payment.domain.WebhookEventRecord;
import com.hweld.operations.payment.domain.WebhookEventRepository;
import com.hweld.operations.payment.infrastructure.WebhookDedupe;
import com.hweld.operations.payment.infrastructure.provider.StubPaymentProvider.PaymentProviderException;
import com.hweld.operations.shared.infrastructure.audit.AuditLogEntity;
import com.hweld.operations.shared.infrastructure.audit.AuditLogRepository;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Processamento de webhooks de PSP: verifica assinatura ANTES de processar,
 * deduplica por (provider, event_id) em TX isolada, persiste o payload,
 * aplica a transição de estado e marca o resultado. Reenvio do mesmo
 * evento pelo provedor é no-op (200 duplicado).
 */
@Service
public class WebhookService {

    private static final Logger log = LoggerFactory.getLogger(WebhookService.class);

    private final ProviderRegistry providers;
    private final WebhookEventRepository webhookEvents;
    private final PaymentRepository payments;
    private final PaymentService paymentService;
    private final AuditLogRepository auditLogs;
    private final WebhookDedupe dedupe;

    public WebhookService(ProviderRegistry providers, WebhookEventRepository webhookEvents,
            PaymentRepository payments, PaymentService paymentService,
            AuditLogRepository auditLogs, WebhookDedupe dedupe) {
        this.providers = providers;
        this.webhookEvents = webhookEvents;
        this.payments = payments;
        this.paymentService = paymentService;
        this.auditLogs = auditLogs;
        this.dedupe = dedupe;
    }

    public enum Result { PROCESSED, DUPLICATE, REJECTED, IGNORED }

    @Transactional
    public Result process(String providerName, String rawBody,
            java.util.Map<String, String> headers) {
        PaymentProvider provider = providers.get(providerName);

        // Assinatura ANTES do parse e do dedupe: o parse pode fazer I/O
        // (fetch-back Mercado Pago/PagBank) — payload forjado é rejeitado
        // com um HMAC local, sem chamar a API do PSP, e não pode queimar
        // o eventId (reenvio assinado do mesmo evento ainda processa).
        boolean signatureValid = provider.verifyWebhookSignature(rawBody, headers);
        if (!signatureValid) {
            auditLogs.save(new AuditLogEntity("service", providerName, "webhook.invalid_signature",
                    "webhook", "unsigned", Map.of("payload", "suprimido"), null));
            return Result.REJECTED;
        }

        PaymentProvider.ParsedWebhook parsed;
        try {
            parsed = provider.parseWebhook(rawBody);
        } catch (PaymentProviderException e) {
            throw ApiException.validacao(e.getMessage());
        }

        WebhookEventRecord record = new WebhookEventRecord(
                providerName, parsed.eventId(), true, parsed.raw());
        try {
            dedupe.record(record);
        } catch (DataIntegrityViolationException e) {
            return Result.DUPLICATE;
        }
        // A linha foi commitada pela TX REQUIRES_NEW do dedupe — recarrega na
        // TX atual; `save(record)` re-inseriria e violaria webhook_event_uk.
        record = webhookEvents.findByProviderAndEventId(providerName, parsed.eventId())
                .orElseThrow(() -> new IllegalStateException("webhook recém-inserido ausente"));

        var payment = payments.findByProviderAndExternalId(providerName, parsed.externalPaymentId());
        if (payment.isEmpty() && parsed.referenceId() != null && !parsed.referenceId().isBlank()) {
            // Fluxos hospedados (checkout PagBank): o PSP emite um charge id
            // novo por transação — a correlação cai na referência do pedido
            // (= nossa idempotency key). O provider no filtro impede casar
            // cobrança de outro PSP com a mesma chave.
            payment = payments.findByIdempotencyKey(parsed.referenceId())
                    .filter(p -> providerName.equals(p.getProvider()));
        }
        if (payment.isEmpty()) {
            record.markProcessed(null, "IGNORED_UNKNOWN_PAYMENT", null);
            webhookEvents.save(record);
            log.warn("webhook {} evento {} para externalId desconhecido {}",
                    providerName, parsed.eventId(), parsed.externalPaymentId());
            return Result.IGNORED;
        }

        Payment p = payment.get();
        try {
            paymentService.applyWebhookResult(p, parsed);
            record.markProcessed(p.getId(), "PROCESSED", null);
        } catch (Exception e) {
            // Libera o dedupe para o reenvio do PSP poder reprocessar — sem
            // isto a linha commitada responderia DUPLICATE para sempre e o
            // evento se perderia (o save da marca FAILED rola junto da TX).
            try {
                dedupe.release(providerName, parsed.eventId());
            } catch (Exception ex) {
                log.warn("falha ao liberar dedupe {}: {}", parsed.eventId(), ex.getMessage());
            }
            throw e;
        }
        webhookEvents.save(record);
        return Result.PROCESSED;
    }
}
