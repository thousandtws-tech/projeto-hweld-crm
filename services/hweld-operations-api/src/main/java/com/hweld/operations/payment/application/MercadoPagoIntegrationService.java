package com.hweld.operations.payment.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.payment.domain.Payment;
import com.hweld.operations.payment.domain.PaymentRepository;
import com.hweld.operations.payment.domain.WebhookEventRepository;
import com.hweld.operations.payment.infrastructure.mercadopago.MercadoPagoClient;
import com.hweld.operations.payment.infrastructure.mercadopago.MercadoPagoProvider;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Gerenciamento da integração Mercado Pago pelo cliente no painel —
 * view/salvar/habilitar/testarConexao/eventos/transacoes.
 * Segredos write-only (só flags `configurado`): Access Token em
 * `api_key_enc`, segredo de assinatura de webhook em `webhook_secret_enc`.
 * `GET /users/me` valida token + ambiente (leitura autenticada segura) e
 * resolve o id/nickname da conta para `external_id`.
 */
@Service
public class MercadoPagoIntegrationService {

    public record SalvarReq(Long versao, String nomeConta, Map<String, Object> config,
            Map<String, String> segredos) {
    }

    private final IntegrationSettingsRepository settings;
    private final MercadoPagoClient client;
    private final CredentialCipher cipher;
    private final AuditService audit;
    private final WebhookEventRepository webhookEvents;
    private final PaymentRepository payments;
    private final InfobipProperties infobipProps;

    public MercadoPagoIntegrationService(IntegrationSettingsRepository settings,
            MercadoPagoClient client, CredentialCipher cipher, AuditService audit,
            WebhookEventRepository webhookEvents, PaymentRepository payments,
            InfobipProperties infobipProps) {
        this.settings = settings;
        this.client = client;
        this.cipher = cipher;
        this.audit = audit;
        this.webhookEvents = webhookEvents;
        this.payments = payments;
        this.infobipProps = infobipProps;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> view() {
        IntegrationSettings cfg = load();
        Map<String, Object> check = cfg.getLastCheck() != null
                ? cfg.getLastCheck() : Map.of();

        Map<String, Object> config = new TreeMap<>();
        config.put("ambiente", ambiente(cfg));
        config.put("parcelas_max", configInt(cfg, "parcelas_max", 12));
        config.put("cobrancas_pausadas", cfg.isEnvioPausado());
        config.put("webhook_url", webhookUrl());

        Map<String, Object> view = new TreeMap<>();
        view.put("provedor", "mercadopago");
        view.put("categoria", "pagamento");
        view.put("ambiente", ambiente(cfg));
        view.put("provider_ativo", cfg.isEnabled() && cfg.credenciaisMercadoPagoCompletas()
                ? MercadoPagoProvider.NAME : "");
        view.put("nome_conta", cfg.getNomeConta() != null ? cfg.getNomeConta() : "");
        view.put("habilitado", cfg.isEnabled());
        view.put("estado", estado(cfg));
        view.put("versao", cfg.getVersao());
        view.put("config", config);
        view.put("segredos", Map.of("campos", Map.of(
                "token", cfg.getApiKeyEnc() != null,
                "webhook_secret", cfg.getWebhookSecretEnc() != null)));
        view.put("ultima_verificacao_em", check.getOrDefault("at", ""));
        view.put("verificacao_status",
                check.isEmpty() ? "nunca"
                        : (Boolean.TRUE.equals(check.get("ok")) ? "ok" : "falha"));
        view.put("verificacao_erro",
                Boolean.FALSE.equals(check.get("ok")) ? check.getOrDefault("detail", "") : "");
        return view;
    }

    private String estado(IntegrationSettings cfg) {
        if (!cfg.isEnabled()) return "desativada";
        if (!cfg.credenciaisMercadoPagoCompletas()) return "pendente";
        Map<String, Object> check = cfg.getLastCheck();
        if (check != null && Boolean.FALSE.equals(check.get("ok"))) return "falha";
        return "ativa";
    }

    @Transactional
    public Map<String, Object> salvar(SalvarReq req) {
        IntegrationSettings cfg = load();
        if (req.versao() != null && req.versao() != cfg.getVersao()) {
            throw ApiException.conflito(
                    "integração alterada por outro administrador — recarregue antes de salvar");
        }
        Map<String, Object> c = req.config() != null ? req.config() : Map.of();
        String ambiente = c.containsKey("ambiente")
                ? validarAmbiente(c.get("ambiente"))
                : ambiente(cfg);
        int parcelasMax = c.containsKey("parcelas_max")
                ? clampInt(c.get("parcelas_max"), 1, 24)
                : configInt(cfg, "parcelas_max", 12);
        var actor = AuditService.currentActor();

        cfg.atualizarMercadoPago(
                req.nomeConta(),
                cfg.isEnabled(),
                MercadoPagoClient.BASE_URL,
                cfg.getExternalId(),
                Boolean.TRUE.equals(c.get("cobrancas_pausadas")),
                Map.of("ambiente", ambiente, "parcelas_max", parcelasMax),
                actor.tipo() + ":" + actor.id());

        if (req.segredos() != null && req.segredos().containsKey("token")) {
            String token = req.segredos().get("token");
            cfg.definirApiKey(token == null || token.isBlank()
                    ? null : cipher.encrypt(token.trim()));
        }
        if (req.segredos() != null && req.segredos().containsKey("webhook_secret")) {
            String secret = req.segredos().get("webhook_secret");
            cfg.definirWebhookSecret(secret == null || secret.isBlank()
                    ? null : cipher.encrypt(secret.trim()));
        }
        settings.save(cfg);
        audit.record("integracao.mercadopago.salvar", "integration_settings",
                IntegrationSettings.MERCADOPAGO_PAGAMENTOS,
                Map.of("tokenDefinido", cfg.getApiKeyEnc() != null,
                        "segredoWebhookDefinido", cfg.getWebhookSecretEnc() != null));
        return view();
    }

    @Transactional
    public Map<String, Object> habilitar(boolean habilitado) {
        IntegrationSettings cfg = load();
        if (habilitado && !cfg.credenciaisMercadoPagoCompletas()) {
            throw ApiException.validacao(
                    "configure o Access Token Mercado Pago antes de habilitar cobranças");
        }
        var actor = AuditService.currentActor();
        cfg.atualizarMercadoPago(cfg.getNomeConta(), habilitado, cfg.getBaseUrl(),
                cfg.getExternalId(), cfg.isEnvioPausado(), cfg.getConfig(),
                actor.tipo() + ":" + actor.id());
        settings.save(cfg);
        audit.record("integracao.mercadopago.habilitacao", "integration_settings",
                IntegrationSettings.MERCADOPAGO_PAGAMENTOS, Map.of("habilitado", habilitado));
        return view();
    }

    /**
     * "Testar conexão" — `GET /users/me` prova que o Access Token é válido
     * e devolve a conta (id + nickname) — gravada como `external_id`/`nome_conta`.
     */
    @Transactional
    public Map<String, Object> testarConexao() {
        IntegrationSettings cfg = load();
        boolean ok;
        String detail;
        try {
            JsonNode me = client.usuario();
            String id = me.path("id").asString("");
            String nickname = me.path("nickname").asString("");
            ok = true;
            detail = "token aceito pelo Mercado Pago — conta "
                    + (nickname.isBlank() ? id : nickname)
                    + " (" + id + ") · ambiente " + ("producao".equals(ambiente(cfg))
                            ? "produção" : "teste");
            cfg.atualizarMercadoPago(
                    cfg.getNomeConta() != null && !cfg.getNomeConta().isBlank()
                            ? cfg.getNomeConta()
                            : (nickname.isBlank() ? "Conta MP " + id : nickname),
                    cfg.isEnabled(), cfg.getBaseUrl(),
                    !id.isBlank() ? id : cfg.getExternalId(),
                    cfg.isEnvioPausado(), cfg.getConfig(),
                    AuditService.currentActor().tipo() + ":" + AuditService.currentActor().id());
        } catch (Exception e) {
            ok = false;
            detail = e.getMessage();
        }
        cfg.registrarCheck(ok, detail);
        settings.save(cfg);
        audit.record("integracao.mercadopago.testar_conexao", "integration_settings",
                IntegrationSettings.MERCADOPAGO_PAGAMENTOS, Map.of("ok", ok));
        Map<String, Object> out = new TreeMap<>();
        out.put("verificacao_status", ok ? "ok" : "falha");
        out.put("mensagem", detail);
        return out;
    }

    /** Últimos webhooks recebidos do Mercado Pago (dedupe + resultado). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> eventos() {
        return webhookEvents.findTop100ByProviderOrderByReceivedAtDesc(MercadoPagoProvider.NAME)
                .stream()
                .map(e -> {
                    Map<String, Object> m = new TreeMap<String, Object>();
                    m.put("id", e.getId().toString());
                    m.put("evento", e.getEventId());
                    m.put("resultado", e.getProcessingResult() != null
                            ? e.getProcessingResult() : "pendente");
                    m.put("payment_id", e.getPaymentId() != null
                            ? e.getPaymentId().toString() : "");
                    m.put("recebido_em", e.getReceivedAt() != null
                            ? e.getReceivedAt().toString() : "");
                    m.put("processado_em", e.getProcessedAt() != null
                            ? e.getProcessedAt().toString() : "");
                    m.put("erro", e.getErrorMessage() != null ? e.getErrorMessage() : "");
                    return (Map<String, Object>) m;
                })
                .toList();
    }

    /** Últimas cobranças criadas via Mercado Pago (histórico operacional). */
    @Transactional(readOnly = true)
    public Map<String, Object> transacoes(int pagina, int tamanho) {
        var page = payments.findByProvider(MercadoPagoProvider.NAME,
                PageRequest.of(Math.max(0, pagina), Math.min(Math.max(1, tamanho), 100)));
        var itens = page.getContent().stream()
                .map(MercadoPagoIntegrationService::transacaoView).toList();
        Map<String, Object> out = new TreeMap<>();
        out.put("itens", itens);
        out.put("pagina", page.getNumber());
        out.put("tamanho", page.getSize());
        out.put("total", page.getTotalElements());
        return out;
    }

    private static Map<String, Object> transacaoView(Payment p) {
        Map<String, Object> m = new TreeMap<String, Object>();
        m.put("id", p.getId().toString());
        m.put("pedido_id", p.getPedidoId());
        m.put("pedido_numero", p.getPedidoNumero() != null ? p.getPedidoNumero() : "");
        m.put("metodo", p.getMethod() != null ? p.getMethod().name() : "");
        m.put("status", p.getStatus() != null ? p.getStatus().name() : "");
        m.put("valor", p.getAmount() != null ? p.getAmount().toPlainString() : "");
        m.put("moeda", p.getCurrency());
        m.put("external_id", p.getExternalId() != null ? p.getExternalId() : "");
        m.put("pix_copia_cola", p.getPixCopyPaste() != null ? p.getPixCopyPaste() : "");
        m.put("checkout_url", p.getCheckoutUrl() != null ? p.getCheckoutUrl() : "");
        m.put("expira_em", p.getExpiresAt() != null ? p.getExpiresAt().toString() : "");
        m.put("criado_em", p.getCreatedAt() != null ? p.getCreatedAt().toString() : "");
        m.put("atualizado_em", p.getUpdatedAt() != null ? p.getUpdatedAt().toString() : "");
        m.put("erro", p.getFailureMessage() != null ? p.getFailureMessage() : "");
        return m;
    }

    private String webhookUrl() {
        String base = infobipProps.publicBaseUrl();
        if (base == null || base.isBlank()) return "";
        return base + "/api/v1/webhooks/" + MercadoPagoProvider.NAME;
    }

    private static String ambiente(IntegrationSettings cfg) {
        Object a = cfg.getConfig() != null ? cfg.getConfig().get("ambiente") : null;
        return a instanceof String s && !s.isBlank() ? s : "teste";
    }

    private static String validarAmbiente(Object ambiente) {
        if (!(ambiente instanceof String a) || a.isBlank()) {
            throw ApiException.validacao(
                    "ambiente obrigatório — teste (token TEST-) ou producao (APP_USR-)");
        }
        return switch (a.trim().toLowerCase()) {
            case "teste", "sandbox", "homologacao" -> "teste";
            case "producao", "production" -> "producao";
            default -> throw ApiException.validacao(
                    "ambiente inválido — use teste ou producao");
        };
    }

    private static int configInt(IntegrationSettings cfg, String chave, int padrao) {
        Object v = cfg.getConfig() != null ? cfg.getConfig().get(chave) : null;
        try {
            return v instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return padrao;
        }
    }

    private static int clampInt(Object v, int min, int max) {
        try {
            int n = v instanceof Number num ? num.intValue() : Integer.parseInt(String.valueOf(v));
            return Math.max(min, Math.min(max, n));
        } catch (Exception e) {
            return min;
        }
    }

    private IntegrationSettings load() {
        return settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)
                .orElseGet(() -> settings.save(
                        IntegrationSettings.criar(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)));
    }
}
