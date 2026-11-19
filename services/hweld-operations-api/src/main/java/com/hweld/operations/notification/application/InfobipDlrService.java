package com.hweld.operations.notification.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDelivery.Status;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Processa Delivery Reports (DLR) do Infobip — `results[]` em lote.
 * Idempotente e tolerante a ordem: duplicados atualizam o mesmo delivery,
 * relatórios tardios nunca rebaixam DELIVERED, e messageId sem correlação
 * (callback antes do envio persistir) é contado, não falha o lote.
 */
@Service
public class InfobipDlrService {

    private static final Logger log = LoggerFactory.getLogger(InfobipDlrService.class);

    public enum Result { PROCESSED, UNAUTHORIZED, UNCONFIGURED, INVALID_PAYLOAD }

    private final NotificationDeliveryRepository deliveries;
    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final ObjectMapper mapper;

    public InfobipDlrService(NotificationDeliveryRepository deliveries,
            IntegrationSettingsRepository settings, CredentialCipher cipher,
            ObjectMapper mapper) {
        this.deliveries = deliveries;
        this.settings = settings;
        this.cipher = cipher;
        this.mapper = mapper;
    }

    @Transactional
    public Outcome process(String rawBody, String pathSecret) {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.INFOBIP_SMS)
                .orElse(null);
        if (cfg == null || cfg.getWebhookSecretEnc() == null) {
            return new Outcome(Result.UNCONFIGURED, 0, 0);
        }
        String esperado = cipher.decrypt(cfg.getWebhookSecretEnc());
        if (pathSecret == null || !constantTimeEquals(pathSecret, esperado)) {
            return new Outcome(Result.UNAUTHORIZED, 0, 0);
        }

        JsonNode results;
        try {
            results = mapper.readTree(rawBody).path("results");
        } catch (Exception e) {
            return new Outcome(Result.INVALID_PAYLOAD, 0, 0);
        }
        if (!results.isArray()) {
            return new Outcome(Result.INVALID_PAYLOAD, 0, 0);
        }

        int matched = 0;
        int unmatched = 0;
        for (JsonNode r : results) {
            String messageId = r.path("messageId").asString(null);
            if (messageId == null || messageId.isBlank()) {
                unmatched++;
                continue;
            }
            var opt = deliveries.findByMessageId(messageId);
            if (opt.isEmpty()) {
                unmatched++;
                log.info("dlr sem correlação messageId={} status={}",
                        messageId, r.path("status").path("name").asString(""));
                continue;
            }
            NotificationDelivery d = opt.get();
            JsonNode status = r.path("status");
            d.applyDlr(mapGroup(status.path("groupId").asInt(-1)),
                    status.path("name").asString(null),
                    mapper.convertValue(r, Map.class));
            deliveries.save(d);
            matched++;
        }
        return new Outcome(Result.PROCESSED, matched, unmatched);
    }

    /**
     * Mapeamento monotônico dos groupId Infobip (doc: report statuses):
     * 1 PENDING→ACCEPTED · 2 UNDELIVERABLE→FAILED · 3 DELIVERED→DELIVERED ·
     * 4 EXPIRED→EXPIRED · 5 REJECTED→FAILED · demais→UNKNOWN.
     */
    private static Status mapGroup(int groupId) {
        return switch (groupId) {
            case 1 -> Status.ACCEPTED;
            case 2 -> Status.FAILED;
            case 3 -> Status.DELIVERED;
            case 4 -> Status.EXPIRED;
            case 5 -> Status.FAILED;
            default -> Status.UNKNOWN;
        };
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    public record Outcome(Result result, int matched, int unmatched) {}
}
