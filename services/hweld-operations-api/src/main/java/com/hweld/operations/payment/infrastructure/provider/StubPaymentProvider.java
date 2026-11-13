package com.hweld.operations.payment.infrastructure.provider;

import com.hweld.operations.payment.application.PaymentProperties;
import com.hweld.operations.payment.application.PaymentProvider;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.shared.domain.Money;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Adapter de teste do port `PaymentProvider` — simula um PSP em memória.
 *
 * Webhook stub: POST /api/v1/webhooks/stub com JSON
 * `{ "eventId": "...", "externalId": "...", "status": "CONFIRMED|FAILED|..." }`
 * e header `X-Signature: sha256=<hmac>` (HMAC-SHA256 do corpo com o secret
 * `hweld.payment.webhook-secrets.stub`). Em dev/test,
 * `hweld.payment.allow-unsigned-stub-webhook=true` dispensa a assinatura.
 *
 * NÃO é um PSP real: substituir por adapter credenciado em produção.
 */
@Component
public class StubPaymentProvider implements PaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(StubPaymentProvider.class);
    public static final String NAME = "stub";

    private final PaymentProperties props;
    private final ObjectMapper mapper;

    public StubPaymentProvider(PaymentProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public ChargeResult createCharge(ChargeRequest req) {
        String externalId = "stub_" + UUID.randomUUID();
        Instant expires = Instant.now().plus(props.pixExpirationMinutes(), ChronoUnit.MINUTES);
        ObjectNode raw = mapper.createObjectNode()
                .put("id", externalId)
                .put("idempotencyKey", req.idempotencyKey())
                .put("amount", req.amount().amount())
                .put("currency", req.amount().currency())
                .put("method", req.method().name());
        return switch (req.method()) {
            case PIX -> {
                String copia = "00020126580014BR.GOV.BCB.PIX0136" + externalId
                        + "52040000530398654" + String.format("%06d", req.amount().amount().movePointRight(2).longValue())
                        + "5802BR5909HWELD_OPS6009SAO_PAULO62070503***6304"
                        + Integer.toHexString(externalId.hashCode() & 0xFFFF).toUpperCase();
                raw.put("pix", copia);
                yield new ChargeResult(externalId, PaymentStatus.PENDING, null,
                        copia, copia, expires, mapper.convertValue(raw, Map.class));
            }
            case CREDIT_CARD -> {
                String url = "https://pagamentos.stub.local/checkout/" + externalId;
                raw.put("checkoutUrl", url);
                yield new ChargeResult(externalId, PaymentStatus.PENDING, url,
                        null, null, expires, mapper.convertValue(raw, Map.class));
            }
            case BOLETO -> {
                String url = "https://pagamentos.stub.local/boleto/" + externalId;
                raw.put("boletoUrl", url);
                yield new ChargeResult(externalId, PaymentStatus.PENDING, url,
                        null, null, expires.plus(2, ChronoUnit.DAYS), mapper.convertValue(raw, Map.class));
            }
        };
    }

    @Override
    public ChargeResult getCharge(String externalId) {
        // Stub não tem estado próprio: reconciliação retorna o último estado
        // conhecido pelo nosso lado — PSPs reais consultam a API deles.
        return new ChargeResult(externalId, PaymentStatus.PENDING, null, null, null, null, Map.of());
    }

    @Override
    public void cancelCharge(String externalId) {
        log.debug("stub: cancel {}", externalId);
    }

    @Override
    public void refundCharge(String externalId, Money amount) {
        log.debug("stub: refund {} {}", externalId, amount.amount());
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signatureHeader) {
        String secret = props.webhookSecret(NAME);
        if (signatureHeader == null || signatureHeader.isBlank()) {
            return props.allowUnsignedStubWebhook();
        }
        String sig = signatureHeader.startsWith("sha256=")
                ? signatureHeader.substring(7) : signatureHeader;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String expected = HexFormat.of().formatHex(mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                    sig.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public ParsedWebhook parseWebhook(String rawBody) {
        try {
            JsonNode n = mapper.readTree(rawBody);
            String eventId = required(n, "eventId");
            String externalId = required(n, "externalId");
            PaymentStatus status = PaymentStatus.valueOf(required(n, "status").toUpperCase());
            return new ParsedWebhook(eventId, externalId, status,
                    textOrNull(n, "failureCode"), textOrNull(n, "failureMessage"),
                    n.has("occurredAt") ? Instant.parse(n.get("occurredAt").asString()) : Instant.now(),
                    mapper.convertValue(n, Map.class));
        } catch (PaymentProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new PaymentProviderException("webhook stub malformado: " + e.getMessage());
        }
    }

    private static String required(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull() || v.asString().isBlank()) {
            throw new PaymentProviderException("campo obrigatório ausente no webhook: " + field);
        }
        return v.asString();
    }

    private static String textOrNull(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asString();
    }

    public static class PaymentProviderException extends RuntimeException {
        public PaymentProviderException(String msg) { super(msg); }
    }
}
