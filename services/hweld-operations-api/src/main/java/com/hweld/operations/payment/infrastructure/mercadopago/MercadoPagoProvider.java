package com.hweld.operations.payment.infrastructure.mercadopago;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.payment.application.PaymentProperties;
import com.hweld.operations.payment.application.PaymentProvider;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.payment.infrastructure.provider.StubPaymentProvider.PaymentProviderException;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.util.HexFormat;

/**
 * Adapter Mercado Pago (Payments API + Checkout Pro) do port `PaymentProvider`.
 *
 * Pix — `POST /v1/payments` com `payment_method_id=pix`, `external_reference`
 * = idempotency key e `X-Idempotency-Key` no header → resposta traz
 * `point_of_interaction.transaction_data.qr_code` (copia-e-cola) +
 * `qr_code_base64` (imagem) + `ticket_url`.
 *
 * Cartão — Checkout Pro: `POST /checkout/preferences` → `init_point`/
 * `sandbox_init_point` vira `checkoutUrl` (PAN/CVV nunca trafegam aqui).
 * O pagamento resultante herda `external_reference` → correlação do webhook
 * via `ParsedWebhook.referenceId` + `findByIdempotencyKey`, e o
 * `external_id` migra preference→payment no primeiro evento
 * (`Payment.relinkExternalId`), igual ao fluxo CHEC→CHAR do PagBank.
 *
 * Webhooks — MP assina de verdade: `x-signature` (`ts=...,v1=...`) +
 * `x-request-id`; manifest `id:{data.id};request-id:{x-request-id};ts:{ts};`
 * HMAC-SHA256 com o segredo configurado no painel MP (cifrado em
 * `webhook_secret_enc`), tolerância ±300s, comparação em tempo constante.
 * O payload é só sinal de mudança: `parseWebhook` consulta
 * `GET /v1/payments/{data.id}` e usa o status REAL como fonte de verdade
 * (prática oficial MP), trazendo `external_reference` para correlação.
 *
 * Fora do escopo — erro tipado, nunca suporte fingido:
 * BOLETO (`ticket` exige `payer` com tax_id/endereço — fora do ChargeRequest
 * atual), cartão transparente (card_token/Bricks), assinaturas, Point,
 * OAuth/marketplace, chargebacks.
 *
 * Status MP → internos: pending→PENDING, authorized/in_process/in_mediation→
 * PROCESSING (authorized NÃO é capturado), approved→CONFIRMED, rejected→FAILED,
 * cancelled→CANCELLED (status_detail=expired→EXPIRED), refunded→REFUNDED,
 * charged_back→FAILED (disputa perdida).
 */
@Component
public class MercadoPagoProvider implements PaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(MercadoPagoProvider.class);
    public static final String NAME = "mercadopago";
    private static final long SIGNATURE_TOLERANCE_SECONDS = 300;

    private final MercadoPagoClient client;
    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final PaymentProperties props;
    private final InfobipProperties infobipProps;
    private final ObjectMapper mapper;

    public MercadoPagoProvider(MercadoPagoClient client, IntegrationSettingsRepository settings,
            CredentialCipher cipher, PaymentProperties props,
            InfobipProperties infobipProps, ObjectMapper mapper) {
        this.client = client;
        this.settings = settings;
        this.cipher = cipher;
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
        return settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)
                .map(IntegrationSettings::credenciaisMercadoPagoCompletas)
                .orElse(false);
    }

    @Override
    public ChargeResult createCharge(ChargeRequest req) {
        if (req.method() != PaymentMethod.PIX && req.method() != PaymentMethod.CREDIT_CARD) {
            throw ApiException.validacao(
                    "Mercado Pago não suporta " + req.method() + " nesta fase — boleto exige "
                            + "tax_id + endereço do pagador, dados fora do ChargeRequest atual");
        }
        settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS).ifPresent(cfg -> {
            if (!cfg.isEnabled()) {
                throw ApiException.conflito("integração Mercado Pago desabilitada no painel");
            }
            if (cfg.isEnvioPausado()) {
                throw ApiException.conflito("cobranças Mercado Pago pausadas no painel");
            }
        });
        if (req.method() == PaymentMethod.CREDIT_CARD) {
            JsonNode pref = client.criarPreferencia(montarPreferenciaCartao(req), req.idempotencyKey());
            return chargeResultDePreferencia(pref);
        }
        JsonNode payment = client.criarPagamento(montarPagamentoPix(req), req.idempotencyKey());
        return chargeResultDePagamento(payment);
    }

    @Override
    public ChargeResult getCharge(String externalId) {
        if (isPaymentId(externalId)) {
            return chargeResultDePagamento(client.consultarPagamento(externalId));
        }
        // Preferência (Checkout Pro): não tem status financeiro — a confirmação
        // chega pelo webhook transacional (que migra o id p/ o payment numérico).
        JsonNode pref = client.consultarPreferencia(externalId);
        return new ChargeResult(externalId, PaymentStatus.PENDING,
                initPoint(pref), null, null,
                parseInstant(texto(pref, "expiration_date_to")), rawOf(pref));
    }

    @Override
    public void cancelCharge(String externalId) {
        if (!isPaymentId(externalId)) {
            throw ApiException.conflito(
                    "checkout MP ainda não gerou pagamento — a preferência expira "
                            + "sozinha; cancelamento disponível após a primeira tentativa");
        }
        client.cancelarPagamento(externalId);
    }

    @Override
    public void refundCharge(String externalId, com.hweld.operations.shared.domain.Money amount) {
        if (!isPaymentId(externalId)) {
            throw ApiException.conflito(
                    "checkout MP sem pagamento capturado — nada a estornar");
        }
        // Contrato MP: amount em REAIS (decimal), não centavos; sem body = total.
        Map<String, Object> body = amount != null && amount.amount() != null
                ? Map.of("amount", amount.amount())
                : Map.of();
        client.estornarPagamento(externalId, body.isEmpty() ? null : body,
                "refund-" + externalId + "-" + (body.isEmpty() ? "total" : "parcial"));
    }

    private static boolean isPaymentId(String externalId) {
        return externalId != null && externalId.matches("\\d+");
    }

    /**
     * Assinatura oficial MP: `x-signature` (`ts=...,v1=...`) + `x-request-id`
     * → manifest `id:{data.id};request-id:{requestId};ts:{ts};` (pares vazios
     * omitidos; `id` minúsculo) → HMAC-SHA256 com o segredo do webhook
     * (`webhook_secret_enc`) → comparação em tempo constante, ts ±300s.
     * Sem segredo configurado → rejeita tudo (fail-closed).
     */
    @Override
    public boolean verifyWebhookSignature(String rawBody, Map<String, String> headers) {
        try {
            String segredo = segredoWebhook();
            if (segredo == null) {
                log.warn("mercadopago webhook sem segredo configurado — rejeitando (fail-closed)");
                return false;
            }
            String xSignature = headers != null ? headers.get("x-signature") : null;
            if (xSignature == null || xSignature.isBlank()) return false;
            String ts = null;
            String v1 = null;
            for (String parte : xSignature.split(",")) {
                int eq = parte.indexOf('=');
                if (eq < 0) continue;
                String k = parte.substring(0, eq).trim();
                String val = parte.substring(eq + 1).trim();
                if ("ts".equals(k)) ts = val;
                if ("v1".equals(k)) v1 = val;
            }
            if (ts == null || v1 == null) return false;
            // Proteção contra replay — janela oficial de tolerância.
            try {
                long tsSec = Long.parseLong(ts);
                if (Math.abs(Instant.now().getEpochSecond() - tsSec) > SIGNATURE_TOLERANCE_SECONDS) {
                    return false;
                }
            } catch (NumberFormatException e) {
                return false;
            }
            String requestId = headers.get("x-request-id");
            JsonNode body = mapper.readTree(rawBody);
            // Manifest oficial usa data.id (id do recurso), não o id top-level.
            String dataId = textoAninhado(body, "data", "id");
            StringBuilder manifest = new StringBuilder();
            if (dataId != null && !dataId.isBlank()) {
                manifest.append("id:").append(dataId.toLowerCase()).append(";");
            }
            if (requestId != null && !requestId.isBlank()) {
                manifest.append("request-id:").append(requestId).append(";");
            }
            manifest.append("ts:").append(ts).append(";");

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(segredo.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String esperado = HexFormat.of().formatHex(
                    mac.doFinal(manifest.toString().getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(esperado.getBytes(StandardCharsets.UTF_8),
                    v1.toLowerCase().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.warn("mercadopago webhook malformado: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Parse: `type=payment` consulta `GET /v1/payments/{data.id}` — status
     * real + `external_reference` (correlação). Outros tipos (merchant_order
     * etc.) viram evento de registro que cai em IGNORED pelo lookup.
     * O `id` top-level do envelope é o notification id oficial → dedupe.
     */
    @Override
    public ParsedWebhook parseWebhook(String rawBody) {
        try {
            JsonNode body = mapper.readTree(rawBody);
            String tipo = texto(body, "type");
            String acao = texto(body, "action");
            String dataId = textoAninhado(body, "data", "id");
            String notificationId = texto(body, "id");
            if (dataId == null) {
                throw new PaymentProviderException("webhook mercadopago sem data.id");
            }
            Instant occurredAt = parseInstant(texto(body, "date_created"));
            if (occurredAt == null) occurredAt = Instant.now();

            if (!"payment".equals(tipo)) {
                String eventId = notificationId != null ? "notif-" + notificationId
                        : tipo + "|" + dataId + "|" + (acao != null ? acao : "");
                return new ParsedWebhook(eventId, dataId, PaymentStatus.PENDING,
                        null, null, occurredAt, null, rawOf(body));
            }

            // Fonte de verdade: o payload é só sinal — estado vem do recurso real.
            JsonNode payment = client.consultarPagamento(dataId);
            String status = texto(payment, "status");
            String detail = texto(payment, "status_detail");
            String referenceId = texto(payment, "external_reference");
            String eventId = notificationId != null ? "notif-" + notificationId
                    : dataId + "|" + (status != null ? status : "");
            return new ParsedWebhook(eventId, dataId, mapStatus(status, detail),
                    detail, detail, occurredAt, referenceId, rawOf(body));
        } catch (PaymentProviderException e) {
            throw e;
        } catch (MercadoPagoException e) {
            // fetch falhou → erro tipado; MP reenvia a notificação.
            throw new PaymentProviderException(
                    "consulta do pagamento falhou (" + e.kind() + "): " + e.getMessage());
        } catch (Exception e) {
            throw new PaymentProviderException("webhook mercadopago malformado: " + e.getMessage());
        }
    }

    // ── montagem ────────────────────────────────────────────────────────────

    private Map<String, Object> montarPagamentoPix(ChargeRequest req) {
        String pedidoNumero = String.valueOf(req.metadata().getOrDefault("pedidoNumero",
                req.metadata().getOrDefault("pedidoId", "")));
        Instant expiracao = Instant.now().plus(props.pixExpirationMinutes(), ChronoUnit.MINUTES);

        Map<String, Object> body = new HashMap<>(Map.of(
                "transaction_amount", req.amount().amount(),
                "description", req.description() != null && !req.description().isBlank()
                        ? req.description() : "Pedido " + pedidoNumero,
                "payment_method_id", "pix",
                "external_reference", req.idempotencyKey(),
                "date_of_expiration", expiracao.truncatedTo(ChronoUnit.SECONDS).toString()));

        if (req.customerEmail() != null && !req.customerEmail().isBlank()) {
            body.put("payer", Map.of("email", req.customerEmail().trim()));
        }
        String webhookUrl = webhookUrl();
        if (webhookUrl != null) {
            body.put("notification_url", webhookUrl);
        } else {
            log.warn("APP_PUBLIC_URL ausente — pagamento criado SEM notification_url "
                    + "(confirmação só por reconciliação)");
        }
        return body;
    }

    /**
     * Checkout Pro — cartão na página hospedada MP. `external_reference` =
     * idempotency key propaga para o payment gerado (mesma correlação do
     * PagBank: reference_id → findByIdempotencyKey → relink do external_id).
     * `back_urls` opcional via metadata.returnUrl; expiração = mesma regra Pix.
     */
    private Map<String, Object> montarPreferenciaCartao(ChargeRequest req) {
        String pedidoNumero = String.valueOf(req.metadata().getOrDefault("pedidoNumero",
                req.metadata().getOrDefault("pedidoId", "")));
        Instant expiracao = Instant.now().plus(props.pixExpirationMinutes(), ChronoUnit.MINUTES);

        Map<String, Object> item = new HashMap<>(Map.of(
                "id", "pedido-" + req.metadata().getOrDefault("pedidoId", pedidoNumero),
                "title", req.description() != null && !req.description().isBlank()
                        ? req.description() : "Pedido " + pedidoNumero,
                "quantity", 1,
                "unit_price", req.amount().amount(),
                "currency_id", req.amount().currency()));

        Map<String, Object> body = new HashMap<>(Map.of(
                "items", List.of(item),
                "external_reference", req.idempotencyKey(),
                "expires", true,
                "expiration_date_to", expiracao.truncatedTo(ChronoUnit.SECONDS).toString()));

        // Só cartão de crédito no checkout (ticket/bank_transfer/atm/débito
        // excluídos). account_money NÃO pode ser excluído — a API rejeita
        // a preferência inteira ("account_money cannot be excluded").
        // installments = parcelas_max do painel.
        body.put("payment_methods", Map.of(
                "excluded_payment_types", List.of(
                        Map.of("id", "ticket"), Map.of("id", "bank_transfer"),
                        Map.of("id", "atm"), Map.of("id", "debit_card")),
                "installments", configInt("parcelas_max", 12, 1, 24)));

        if (req.customerEmail() != null && !req.customerEmail().isBlank()) {
            body.put("payer", Map.of("email", req.customerEmail().trim()));
        }
        String webhookUrl = webhookUrl();
        if (webhookUrl != null) {
            body.put("notification_url", webhookUrl);
        } else {
            log.warn("APP_PUBLIC_URL ausente — preferência criada SEM webhooks "
                    + "(confirmação só por reconciliação)");
        }
        Object returnUrl = req.metadata().get("returnUrl");
        if (returnUrl instanceof String ru && !ru.isBlank()) {
            body.put("back_urls", Map.of(
                    "success", ru.trim(), "pending", ru.trim(), "failure", ru.trim()));
        }
        return body;
    }

    private String webhookUrl() {
        String base = infobipProps.publicBaseUrl();
        if (base == null || base.isBlank()) return null;
        return base + "/api/v1/webhooks/" + NAME;
    }

    private String segredoWebhook() {
        return settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)
                .map(IntegrationSettings::getWebhookSecretEnc)
                .map(enc -> {
                    try {
                        return cipher.decrypt(enc);
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(s -> s != null && !s.isBlank())
                .orElse(null);
    }

    // ── normalização ────────────────────────────────────────────────────────

    private ChargeResult chargeResultDePagamento(JsonNode payment) {
        String id = texto(payment, "id");
        if (id == null) {
            throw MercadoPagoException.provedor("payment criado sem id no Mercado Pago", 0);
        }
        String qrCode = textoAninhado(payment, "point_of_interaction", "transaction_data", "qr_code");
        String qrBase64 = textoAninhado(payment, "point_of_interaction", "transaction_data",
                "qr_code_base64");
        return new ChargeResult(id, mapStatus(texto(payment, "status"),
                texto(payment, "status_detail")),
                textoAninhado(payment, "point_of_interaction", "transaction_data", "ticket_url"),
                qrBase64, qrCode,
                parseInstant(texto(payment, "date_of_expiration")), rawOf(payment));
    }

    private ChargeResult chargeResultDePreferencia(JsonNode pref) {
        String id = texto(pref, "id");
        if (id == null) {
            throw MercadoPagoException.provedor("preference criada sem id no Mercado Pago", 0);
        }
        return new ChargeResult(id, PaymentStatus.PENDING, initPoint(pref),
                null, null, parseInstant(texto(pref, "expiration_date_to")), rawOf(pref));
    }

    /** `init_point` (produção) vs `sandbox_init_point` (teste) — config.ambiente. */
    private String initPoint(JsonNode pref) {
        Object amb = settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)
                .map(c -> c.getConfig().get("ambiente")).orElse(null);
        boolean teste = !(amb instanceof String a && a.toLowerCase().startsWith("prod"));
        String url = teste ? texto(pref, "sandbox_init_point") : texto(pref, "init_point");
        return url != null ? url : texto(pref, "init_point");
    }

    /** MP `status` + `status_detail` → interno. authorized ≠ capturado (nunca CONFIRMED). */
    static PaymentStatus mapStatus(String status, String statusDetail) {
        if (status == null) return PaymentStatus.PENDING;
        if ("cancelled".equalsIgnoreCase(status) && "expired".equalsIgnoreCase(statusDetail)) {
            return PaymentStatus.EXPIRED;
        }
        return switch (status.toLowerCase()) {
            case "pending" -> PaymentStatus.PENDING;
            case "authorized", "in_process", "in_mediation" -> PaymentStatus.PROCESSING;
            case "approved" -> PaymentStatus.CONFIRMED;
            case "rejected", "charged_back" -> PaymentStatus.FAILED;
            case "cancelled" -> PaymentStatus.CANCELLED;
            case "refunded" -> PaymentStatus.REFUNDED;
            default -> PaymentStatus.PENDING;
        };
    }

    /** Inteiro opcional de `config` (painel), com limites defensivos. */
    private int configInt(String chave, int padrao, int min, int max) {
        Object v = settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)
                .map(c -> c.getConfig().get(chave)).orElse(null);
        try {
            int n = v instanceof Number num ? num.intValue()
                    : Integer.parseInt(String.valueOf(v));
            return Math.max(min, Math.min(max, n));
        } catch (Exception e) {
            return padrao;
        }
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> rawOf(JsonNode n) {
        return n != null ? mapper.convertValue(n, Map.class) : Map.of();
    }
}
