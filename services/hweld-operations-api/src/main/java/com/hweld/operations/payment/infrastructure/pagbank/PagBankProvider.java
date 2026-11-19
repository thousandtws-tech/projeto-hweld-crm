package com.hweld.operations.payment.infrastructure.pagbank;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.payment.application.PaymentProvider;
import com.hweld.operations.payment.application.PaymentProperties;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.payment.infrastructure.provider.StubPaymentProvider.PaymentProviderException;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Adapter PagBank (Orders API) do port `PaymentProvider`.
 *
 * Fase A — Pix: `POST /orders` com `charges[].payment_method.type=PIX` e
 * `pix.expiration_date` → resposta traz `charges[].qr_code.text` (copia-e-cola)
 * + links `QRCODE.PNG`/`QRCODE.BASE64`. Webhooks: a Orders API POSTa o objeto
 * Order completo para `notification_urls` definidas por pedido — PagBank NÃO
 * assina a notificação; o mecanismo oficial de autenticidade é o fetch-back
 * (`GET /charges/{id}` e conferir `metadata.ps_order_id` + status contra o
 * payload recebido). `verifyWebhookSignature` implementa exatamente isso.
 *
 * Fora da fase A — erro tipado, nunca suporte fingido:
 * CREDIT_CARD (exige cartão tokenizado/cifrado com public-key + 3DS),
 * BOLETO (exige `holder` com tax_id + endereço — fora do ChargeRequest atual),
 * checkout hospedado, recorrência, Connect/split.
 *
 * Status PagBank → internos: WAITING→PENDING, IN_ANALYSIS/AUTHORIZED→PROCESSING,
 * PAID→CONFIRMED, DECLINED→FAILED, CANCELED→CANCELLED.
 */
@Component
public class PagBankProvider implements PaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(PagBankProvider.class);
    public static final String NAME = "pagbank";

    private final PagBankClient client;
    private final IntegrationSettingsRepository settings;
    private final PaymentProperties props;
    private final InfobipProperties infobipProps;
    private final ObjectMapper mapper;

    public PagBankProvider(PagBankClient client, IntegrationSettingsRepository settings,
            PaymentProperties props, InfobipProperties infobipProps, ObjectMapper mapper) {
        this.client = client;
        this.settings = settings;
        this.props = props;
        this.infobipProps = infobipProps;
        this.mapper = mapper;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean configured() {
        return settings.findById(IntegrationSettings.PAGBANK_PAGAMENTOS)
                .map(IntegrationSettings::credenciaisPagBankCompletas)
                .orElse(false);
    }

    @Override
    public ChargeResult createCharge(ChargeRequest req) {
        if (req.method() != PaymentMethod.PIX) {
            throw ApiException.validacao(
                    "PagBank fase A suporta apenas PIX — " + req.method()
                            + " depende de tokenização de cartão/dados do portador (fase B)");
        }
        // Pausa/desligamento travam cobranças NOVAS; cancelamento/estorno/
        // reconciliação de cobranças existentes seguem liberados.
        settings.findById(IntegrationSettings.PAGBANK_PAGAMENTOS).ifPresent(cfg -> {
            if (!cfg.isEnabled()) {
                throw ApiException.conflito("integração PagBank desabilitada no painel");
            }
            if (cfg.isEnvioPausado()) {
                throw ApiException.conflito("cobranças PagBank pausadas no painel");
            }
        });
        Map<String, Object> body = montarPedidoPix(req);
        JsonNode order = client.criarPedido(body);
        return chargeResultDe(order);
    }

    @Override
    public ChargeResult getCharge(String externalId) {
        JsonNode charge = client.consultarCobranca(externalId);
        String status = texto(charge, "status");
        return new ChargeResult(externalId, mapStatus(status), null,
                textoAninhado(charge, "qr_code", "text"), null,
                extrairExpiracao(charge), rawOf(charge));
    }

    @Override
    public void cancelCharge(String externalId) {
        // Cancelamento total: sem `amount` o PagBank cancela a cobrança inteira.
        client.cancelarCobranca(externalId, null);
    }

    @Override
    public void refundCharge(String externalId, com.hweld.operations.shared.domain.Money amount) {
        // Estorno (parcial ou total) usa o mesmo endpoint com `amount.value`
        // em centavos — contrato oficial `POST /charges/{id}/cancel`.
        long centavos = amount.amount().movePointRight(2)
                .setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        client.cancelarCobranca(externalId, Map.of("amount",
                Map.of("value", centavos, "currency", amount.currency())));
    }

    /**
     * Autenticidade PagBank = fetch-back (a Orders API não assina webhooks —
     * mecanismo oficial: confirmar a transação consultando a API).
     * Extrai ids do payload, consulta `GET /charges/{id}` e exige que
     * `metadata.ps_order_id` e o `status` da cobrança real batam com o
     * corpo recebido. Rejeita forjado, desconhecido e desatualizado.
     */
    @Override
    public boolean verifyWebhookSignature(String rawBody, String signatureHeader) {
        try {
            JsonNode order = mapper.readTree(rawBody);
            String orderId = texto(order, "id");
            JsonNode charge = primeiroCharge(order);
            if (orderId == null || charge == null) return false;
            String chargeId = texto(charge, "id");
            String claimedStatus = texto(charge, "status");
            if (chargeId == null || claimedStatus == null) return false;

            JsonNode real = client.consultarCobranca(chargeId);
            String realOrderId = textoAninhado(real, "metadata", "ps_order_id");
            String realStatus = texto(real, "status");
            return orderId.equals(realOrderId) && claimedStatus.equals(realStatus);
        } catch (PagBankException e) {
            // fetch-back indisponível/inexistente → rejeita (PagBank reenvia).
            log.warn("pagbank webhook fetch-back falhou ({}): {}", e.kind(), e.getMessage());
            return false;
        } catch (Exception e) {
            log.warn("pagbank webhook malformado: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public ParsedWebhook parseWebhook(String rawBody) {
        try {
            JsonNode order = mapper.readTree(rawBody);
            String orderId = obrigatorio(order, "id");
            JsonNode charge = primeiroCharge(order);
            if (charge == null) {
                throw new PaymentProviderException("webhook pagbank sem charges[]");
            }
            String chargeId = obrigatorio(charge, "id");
            String status = obrigatorio(charge, "status");
            // Sem event id oficial → chave de dedupe por transição
            // (reenvio do mesmo estado = DUPLICATE; outra transição = outra chave).
            String eventId = orderId + "|" + chargeId + "|" + status;
            Instant occurredAt = parseInstant(texto(charge, "paid_at"));
            if (occurredAt == null) occurredAt = parseInstant(texto(charge, "created_at"));
            if (occurredAt == null) occurredAt = Instant.now();
            String failureCode = textoAninhado(charge, "payment_response", "code");
            String failureMessage = textoAninhado(charge, "payment_response", "message");
            return new ParsedWebhook(eventId, chargeId, mapStatus(status),
                    failureCode, failureMessage, occurredAt, rawOf(order));
        } catch (PaymentProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new PaymentProviderException("webhook pagbank malformado: " + e.getMessage());
        }
    }

    // ── montagem do pedido ──────────────────────────────────────────────────

    private Map<String, Object> montarPedidoPix(ChargeRequest req) {
        long centavos = req.amount().amount().movePointRight(2)
                .setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        String pedidoNumero = String.valueOf(req.metadata().getOrDefault("pedidoNumero",
                req.metadata().getOrDefault("pedidoId", "")));
        Instant expiracao = Instant.now().plus(props.pixExpirationMinutes(), ChronoUnit.MINUTES);

        Map<String, Object> item = new HashMap<>(Map.of(
                "reference_id", "pedido-" + req.metadata().getOrDefault("pedidoId", pedidoNumero),
                "name", req.description() != null && !req.description().isBlank()
                        ? req.description() : "Cobrança " + pedidoNumero,
                "quantity", 1,
                "unit_amount", centavos));

        Map<String, Object> charge = new HashMap<>(Map.of(
                "reference_id", req.idempotencyKey(),
                "description", req.description() != null && !req.description().isBlank()
                        ? req.description() : "Cobrança " + pedidoNumero,
                "amount", Map.of("value", centavos, "currency", req.amount().currency()),
                "payment_method", Map.of(
                        "type", "PIX",
                        "pix", Map.of("expiration_date",
                                expiracao.truncatedTo(ChronoUnit.SECONDS).toString()))));

        Map<String, Object> body = new HashMap<>(Map.of(
                "reference_id", pedidoNumero.isBlank() ? req.idempotencyKey() : pedidoNumero,
                "items", List.of(item),
                "charges", List.of(charge)));

        if (req.customerEmail() != null && !req.customerEmail().isBlank()) {
            body.put("customer", Map.of("email", req.customerEmail().trim()));
        }
        String webhookUrl = webhookUrl();
        if (webhookUrl != null) {
            body.put("notification_urls", List.of(webhookUrl));
        } else {
            log.warn("APP_PUBLIC_URL ausente — cobrança criada SEM notification_urls "
                    + "(confirmação só por reconciliação)");
        }
        return body;
    }

    private String webhookUrl() {
        String base = infobipProps.publicBaseUrl();
        if (base == null || base.isBlank()) return null;
        return base + "/api/v1/webhooks/" + NAME;
    }

    // ── normalização ────────────────────────────────────────────────────────

    private ChargeResult chargeResultDe(JsonNode order) {
        JsonNode charge = primeiroCharge(order);
        if (charge == null) {
            throw PagBankException.provedor("order criada sem charges[] no PagBank", 0);
        }
        String chargeId = texto(charge, "id");
        String status = texto(charge, "status");
        String pixText = textoAninhado(charge, "qr_code", "text");
        String qrPng = linkRel(charge, "QRCODE.PNG");
        Instant expiracao = extrairExpiracao(charge);
        // pixQrCode = PNG pronto para exibição; pixCopyPaste = payload EMV.
        return new ChargeResult(chargeId, mapStatus(status), null,
                qrPng != null ? qrPng : pixText, pixText, expiracao, rawOf(order));
    }

    private static JsonNode primeiroCharge(JsonNode order) {
        JsonNode charges = order != null ? order.path("charges") : null;
        return charges != null && charges.isArray() && !charges.isEmpty()
                ? charges.get(0) : null;
    }

    private static Instant extrairExpiracao(JsonNode charge) {
        return parseInstant(textoAninhado(charge, "payment_method", "pix", "expiration_date"));
    }

    private static Instant parseInstant(String iso) {
        try {
            return iso == null || iso.isBlank() ? null : Instant.parse(iso);
        } catch (Exception e) {
            try {
                return java.time.OffsetDateTime.parse(iso).toInstant();
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    /** PagBank → status interno. Desconhecido→PENDING (transição nunca retrocede). */
    static PaymentStatus mapStatus(String pagBankStatus) {
        if (pagBankStatus == null) return PaymentStatus.PENDING;
        return switch (pagBankStatus.toUpperCase()) {
            case "WAITING" -> PaymentStatus.PENDING;
            case "IN_ANALYSIS", "AUTHORIZED" -> PaymentStatus.PROCESSING;
            case "PAID" -> PaymentStatus.CONFIRMED;
            case "DECLINED" -> PaymentStatus.FAILED;
            case "CANCELED" -> PaymentStatus.CANCELLED;
            default -> PaymentStatus.PENDING;
        };
    }

    private static String texto(JsonNode n, String campo) {
        JsonNode v = n != null ? n.path(campo) : null;
        return v != null && !v.isNull() && !v.asString().isBlank() ? v.asString() : null;
    }

    private static String textoAninhado(JsonNode n, String... caminho) {
        JsonNode v = n;
        for (String c : caminho) {
            v = v != null ? v.path(c) : null;
        }
        return v != null && !v.isNull() && !v.asString().isBlank() ? v.asString() : null;
    }

    private static String linkRel(JsonNode charge, String rel) {
        JsonNode links = charge != null ? charge.path("links") : null;
        if (links == null || !links.isArray()) return null;
        List<String> found = new ArrayList<>();
        links.forEach(l -> {
            if (rel.equals(l.path("rel").asString(""))) {
                found.add(l.path("href").asString(""));
            }
        });
        return found.isEmpty() ? null : found.get(0);
    }

    private static String obrigatorio(JsonNode n, String campo) {
        String v = texto(n, campo);
        if (v == null) {
            throw new PaymentProviderException("campo obrigatório ausente no webhook: " + campo);
        }
        return v;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> rawOf(JsonNode n) {
        return n != null ? mapper.convertValue(n, Map.class) : Map.of();
    }
}
