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
 * Adapter PagBank (Orders API + Checkout API) do port `PaymentProvider`.
 *
 * Pix — `POST /orders` com `charges[].payment_method.type=PIX` e
 * `pix.expiration_date` → `charges[].qr_code.text` (copia-e-cola)
 * + links `QRCODE.PNG`/`QRCODE.BASE64`.
 *
 * Cartão — `POST /checkouts`: página de pagamento hospedada no PagBank
 * (PCI-seguro: PAN/CVV nunca trafegam por aqui). Resposta traz `id`
 * CHEC_* e `links[rel=PAY]` → `checkoutUrl`. O checkout pago gera uma
 * Order/Charge nova (CHAR_*) — a correlação chega pelo webhook via
 * `reference_id` (= nossa idempotency key) e o `external_id` é
 * migrado CHEC→CHAR no primeiro evento transacional
 * (`Payment.relinkExternalId`), para que cancel/estorno/reconciliação
 * operem sobre a cobrança real. Antes disso, ids CHEC_ roteiam para
 * os endpoints `/checkouts/*` (consulta/inativação).
 *
 * Webhooks — PagBank NÃO assina notificações; autenticidade = fetch-back
 * (`GET /charges/{id}` para payloads ORDE_*, `GET /checkouts/{id}` para
 * payloads CHEC_*) conferindo status/id contra o corpo recebido.
 * `notification_urls` (eventos do checkout) e `payment_notification_urls`
 * (eventos transacionais) apontam para a mesma rota.
 *
 * Fora do escopo — erro tipado, nunca suporte fingido:
 * BOLETO (exige `holder` com tax_id + endereço — fora do ChargeRequest
 * atual), cartão transparente (tokenização/3DS), recorrência, Connect/split.
 *
 * Status PagBank → internos: WAITING→PENDING, IN_ANALYSIS/AUTHORIZED→PROCESSING,
 * PAID→CONFIRMED, DECLINED→FAILED, CANCELED→CANCELLED.
 * Checkout: ACTIVE→PENDING, PAID→CONFIRMED, INACTIVE→CANCELLED, EXPIRED→EXPIRED.
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
        if (req.method() != PaymentMethod.PIX && req.method() != PaymentMethod.CREDIT_CARD) {
            throw ApiException.validacao(
                    "PagBank não suporta " + req.method() + " nesta fase — boleto exige "
                            + "tax_id + endereço do portador, dados fora do ChargeRequest atual");
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
        if (req.method() == PaymentMethod.CREDIT_CARD) {
            JsonNode checkout = client.criarCheckout(montarCheckoutCartao(req));
            return chargeResultDeCheckout(checkout);
        }
        Map<String, Object> body = montarPedidoPix(req);
        JsonNode order = client.criarPedido(body);
        return chargeResultDe(order);
    }

    @Override
    public ChargeResult getCharge(String externalId) {
        // Checkout hospedado ainda não pago consulta o checkout, não a cobrança
        // (a Charge CHAR_* só existe após o pagamento). Status PAID já reconcilia
        // como CONFIRMED mesmo sem o evento transacional.
        if (isCheckoutId(externalId)) {
            JsonNode checkout = client.consultarCheckout(externalId);
            return new ChargeResult(externalId,
                    mapStatusCheckout(texto(checkout, "status")),
                    linkRel(checkout, "PAY"), null, null,
                    parseInstant(texto(checkout, "expiration_date")), rawOf(checkout));
        }
        JsonNode charge = client.consultarCobranca(externalId);
        String status = texto(charge, "status");
        return new ChargeResult(externalId, mapStatus(status), null,
                textoAninhado(charge, "qr_code", "text"), null,
                extrairExpiracao(charge), rawOf(charge));
    }

    @Override
    public void cancelCharge(String externalId) {
        if (isCheckoutId(externalId)) {
            // Link ainda não pago — "cancelar" é inativar o checkout.
            client.inativarCheckout(externalId);
            return;
        }
        // Cancelamento total: sem `amount` o PagBank cancela a cobrança inteira.
        client.cancelarCobranca(externalId, null);
    }

    @Override
    public void refundCharge(String externalId, com.hweld.operations.shared.domain.Money amount) {
        if (isCheckoutId(externalId)) {
            // Checkout nunca pago não tem valor a estornar — inativa o link.
            client.inativarCheckout(externalId);
            return;
        }
        // Estorno (parcial ou total) usa o mesmo endpoint com `amount.value`
        // em centavos — contrato oficial `POST /charges/{id}/cancel`.
        long centavos = amount.amount().movePointRight(2)
                .setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        client.cancelarCobranca(externalId, Map.of("amount",
                Map.of("value", centavos, "currency", amount.currency())));
    }

    private static boolean isCheckoutId(String externalId) {
        return externalId != null && externalId.startsWith("CHEC_");
    }

    /**
     * Autenticidade PagBank = fetch-back (não há assinatura em webhooks —
     * mecanismo oficial: confirmar a transação consultando a API).
     * Payload ORDE_*: `GET /charges/{id}` exigindo `metadata.ps_order_id`
     * e `status` iguais ao corpo. Payload CHEC_* (evento do checkout):
     * `GET /checkouts/{id}` exigindo `status` igual. Rejeita forjado,
     * desconhecido e desatualizado.
     */
    @Override
    public boolean verifyWebhookSignature(String rawBody, String signatureHeader) {
        try {
            JsonNode payload = mapper.readTree(rawBody);
            String id = texto(payload, "id");
            if (id == null) return false;
            if (isCheckoutId(id)) {
                String claimedStatus = texto(payload, "status");
                if (claimedStatus == null) return false;
                JsonNode real = client.consultarCheckout(id);
                return claimedStatus.equals(texto(real, "status"));
            }
            JsonNode charge = primeiroCharge(payload);
            if (charge == null) return false;
            String chargeId = texto(charge, "id");
            String claimedStatus = texto(charge, "status");
            if (chargeId == null || claimedStatus == null) return false;

            JsonNode real = client.consultarCobranca(chargeId);
            String realOrderId = textoAninhado(real, "metadata", "ps_order_id");
            String realStatus = texto(real, "status");
            return id.equals(realOrderId) && claimedStatus.equals(realStatus);
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
            JsonNode payload = mapper.readTree(rawBody);
            String id = obrigatorio(payload, "id");
            // `reference_id` propaga do checkout/order para o evento — é a
            // chave de correlação quando o externalPaymentId ainda não é o
            // id conhecido (checkout gera CHAR_* novo na transação).
            String referenceId = texto(payload, "reference_id");
            if (isCheckoutId(id)) {
                // Evento do próprio checkout (EXPIRED/INACTIVE/ACTIVE/PAID).
                String status = obrigatorio(payload, "status");
                Instant occurredAt = parseInstant(texto(payload, "updated_at"));
                if (occurredAt == null) occurredAt = parseInstant(texto(payload, "created_at"));
                if (occurredAt == null) occurredAt = Instant.now();
                return new ParsedWebhook(id + "|" + status, id,
                        mapStatusCheckout(status), null, null, occurredAt,
                        referenceId, rawOf(payload));
            }
            JsonNode charge = primeiroCharge(payload);
            if (charge == null) {
                throw new PaymentProviderException("webhook pagbank sem charges[]");
            }
            String chargeId = obrigatorio(charge, "id");
            String status = obrigatorio(charge, "status");
            // Sem event id oficial → chave de dedupe por transição
            // (reenvio do mesmo estado = DUPLICATE; outra transição = outra chave).
            String eventId = id + "|" + chargeId + "|" + status;
            Instant occurredAt = parseInstant(texto(charge, "paid_at"));
            if (occurredAt == null) occurredAt = parseInstant(texto(charge, "created_at"));
            if (occurredAt == null) occurredAt = Instant.now();
            String failureCode = textoAninhado(charge, "payment_response", "code");
            String failureMessage = textoAninhado(charge, "payment_response", "message");
            return new ParsedWebhook(eventId, chargeId, mapStatus(status),
                    failureCode, failureMessage, occurredAt, referenceId, rawOf(payload));
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

    // ── checkout hospedado (cartão) ─────────────────────────────────────────

    /**
     * `POST /checkouts` — cartão via página de pagamento PagBank.
     * `reference_id` = idempotency key: o PagBank a propaga para a Order
     * gerada no pagamento, e é ela que reencontra o `Payment` quando o
     * webhook transacional chega com um CHAR_* desconhecido (fallback
     * `findByIdempotencyKey` no WebhookService).
     * `customer_modifiable=true` → nome/tax_id o cliente informa na página
     * hospedada (o ChargeRequest não carrega esses dados).
     */
    private Map<String, Object> montarCheckoutCartao(ChargeRequest req) {
        long centavos = req.amount().amount().movePointRight(2)
                .setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        String pedidoNumero = String.valueOf(req.metadata().getOrDefault("pedidoNumero",
                req.metadata().getOrDefault("pedidoId", "")));
        Instant expiracao = Instant.now().plus(props.pixExpirationMinutes(), ChronoUnit.MINUTES);

        Map<String, Object> item = new HashMap<>(Map.of(
                "reference_id", "pedido-" + req.metadata().getOrDefault("pedidoId", pedidoNumero),
                "name", req.description() != null && !req.description().isBlank()
                        ? req.description() : "Pedido " + pedidoNumero,
                "quantity", 1,
                "unit_amount", centavos));

        Map<String, Object> body = new HashMap<>(Map.of(
                "reference_id", req.idempotencyKey(),
                "items", List.of(item),
                "customer_modifiable", true,
                "payment_methods", List.of(Map.of("type", "CREDIT_CARD")),
                "expiration_date", expiracao.truncatedTo(ChronoUnit.SECONDS).toString()));

        // Parcelamento — payment_methods_configs.config_options (contrato
        // oficial): limite aceito + parcelas com juros arcados pelo vendedor.
        java.util.List<Map<String, String>> opcoes = new java.util.ArrayList<>();
        opcoes.add(Map.of("option", "INSTALLMENTS_LIMIT",
                "value", String.valueOf(configInt("parcelas_max", 12, 1, 18))));
        int semJuros = configInt("parcelas_sem_juros", 0, 0, 18);
        if (semJuros > 0) {
            opcoes.add(Map.of("option", "INTEREST_FREE_INSTALLMENTS",
                    "value", String.valueOf(semJuros)));
        }
        body.put("payment_methods_configs", java.util.List.of(Map.of(
                "type", "CREDIT_CARD", "config_options", opcoes)));

        if (req.customerEmail() != null && !req.customerEmail().isBlank()) {
            body.put("customer", Map.of("email", req.customerEmail().trim()));
        }
        String webhookUrl = webhookUrl();
        if (webhookUrl != null) {
            // eventos do checkout (EXPIRED/INACTIVE) → notification_urls;
            // eventos transacionais (PAID/IN_ANALYSIS/…) → payment_notification_urls
            body.put("notification_urls", java.util.List.of(webhookUrl));
            body.put("payment_notification_urls", java.util.List.of(webhookUrl));
        } else {
            log.warn("APP_PUBLIC_URL ausente — checkout criado SEM webhooks "
                    + "(confirmação só por reconciliação)");
        }
        Object returnUrl = req.metadata().get("returnUrl");
        if (returnUrl instanceof String ru && !ru.isBlank()) {
            body.put("redirect_url", ru.trim());
        }
        return body;
    }

    private ChargeResult chargeResultDeCheckout(JsonNode checkout) {
        String id = texto(checkout, "id");
        if (id == null) {
            throw PagBankException.provedor("checkout criado sem id no PagBank", 0);
        }
        return new ChargeResult(id, mapStatusCheckout(texto(checkout, "status")),
                linkRel(checkout, "PAY"), null, null,
                parseInstant(texto(checkout, "expiration_date")), rawOf(checkout));
    }

    /** Inteiro opcional de `config` (painel), com limites defensivos. */
    private int configInt(String chave, int padrao, int min, int max) {
        Object v = settings.findById(IntegrationSettings.PAGBANK_PAGAMENTOS)
                .map(c -> c.getConfig().get(chave)).orElse(null);
        try {
            int n = v instanceof Number num ? num.intValue()
                    : Integer.parseInt(String.valueOf(v));
            return Math.max(min, Math.min(max, n));
        } catch (Exception e) {
            return padrao;
        }
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

    /** Status do checkout hospedado → interno (ACTIVE/INACTIVE/EXPIRED/PAID). */
    static PaymentStatus mapStatusCheckout(String checkoutStatus) {
        if (checkoutStatus == null) return PaymentStatus.PENDING;
        return switch (checkoutStatus.toUpperCase()) {
            case "ACTIVE" -> PaymentStatus.PENDING;
            case "PAID" -> PaymentStatus.CONFIRMED;
            case "INACTIVE" -> PaymentStatus.CANCELLED;
            case "EXPIRED" -> PaymentStatus.EXPIRED;
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
