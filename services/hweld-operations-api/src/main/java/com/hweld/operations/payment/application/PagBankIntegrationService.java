package com.hweld.operations.payment.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.payment.domain.Payment;
import com.hweld.operations.payment.domain.PaymentRepository;
import com.hweld.operations.payment.domain.WebhookEventRepository;
import com.hweld.operations.payment.infrastructure.pagbank.PagBankClient;
import com.hweld.operations.payment.infrastructure.pagbank.PagBankProvider;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gerenciamento da integração PagBank pelo cliente no painel —
 * view/salvar/habilitar/testarConexao/eventos/transacoes.
 * Token write-only (só flag `configurado`), cifrado em `api_key_enc`.
 * `GET /public-keys` valida token + ambiente (leitura autenticada segura —
 * a Orders API não expõe endpoint "me").
 */
@Service
public class PagBankIntegrationService {

    public record SalvarReq(Long versao, String nomeConta, Map<String, Object> config,
            Map<String, String> segredos) {
    }

    private final IntegrationSettingsRepository settings;
    private final PagBankClient client;
    private final CredentialCipher cipher;
    private final AuditService audit;
    private final WebhookEventRepository webhookEvents;
    private final PaymentRepository payments;
    private final InfobipProperties infobipProps;

    public PagBankIntegrationService(IntegrationSettingsRepository settings,
            PagBankClient client, CredentialCipher cipher, AuditService audit,
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
        config.put("cobrancas_pausadas", cfg.isEnvioPausado());
        config.put("webhook_url", webhookUrl());

        Map<String, Object> view = new TreeMap<>();
        view.put("provedor", "pagbank");
        view.put("categoria", "pagamento");
        view.put("ambiente", ambiente(cfg));
        view.put("provider_ativo", cfg.isEnabled() && cfg.credenciaisPagBankCompletas()
                ? PagBankProvider.NAME : "");
        view.put("nome_conta", cfg.getNomeConta() != null ? cfg.getNomeConta() : "");
        view.put("habilitado", cfg.isEnabled());
        view.put("estado", estado(cfg));
        view.put("versao", cfg.getVersao());
        view.put("config", config);
        view.put("segredos", Map.of("campos", Map.of(
                "token", cfg.getApiKeyEnc() != null)));
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
        if (!cfg.credenciaisPagBankCompletas()) return "pendente";
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
        String baseUrl = c.containsKey("ambiente")
                ? baseUrlDoAmbiente(c.get("ambiente"))
                : cfg.getBaseUrl();
        var actor = AuditService.currentActor();

        cfg.atualizarPagBank(
                req.nomeConta(),
                cfg.isEnabled(),
                baseUrl,
                cfg.getExternalId(),
                Boolean.TRUE.equals(c.get("cobrancas_pausadas")),
                actor.tipo() + ":" + actor.id());

        if (req.segredos() != null && req.segredos().containsKey("token")) {
            String token = req.segredos().get("token");
            cfg.definirApiKey(token == null || token.isBlank()
                    ? null : cipher.encrypt(token.trim()));
        }
        settings.save(cfg);
        audit.record("integracao.pagbank.salvar", "integration_settings",
                IntegrationSettings.PAGBANK_PAGAMENTOS,
                Map.of("tokenDefinido", cfg.getApiKeyEnc() != null));
        return view();
    }

    @Transactional
    public Map<String, Object> habilitar(boolean habilitado) {
        IntegrationSettings cfg = load();
        if (habilitado && !cfg.credenciaisPagBankCompletas()) {
            throw ApiException.validacao(
                    "configure o token PagBank antes de habilitar cobranças");
        }
        var actor = AuditService.currentActor();
        cfg.atualizarPagBank(cfg.getNomeConta(), habilitado, cfg.getBaseUrl(),
                cfg.getExternalId(), cfg.isEnvioPausado(),
                actor.tipo() + ":" + actor.id());
        settings.save(cfg);
        audit.record("integracao.pagbank.habilitacao", "integration_settings",
                IntegrationSettings.PAGBANK_PAGAMENTOS, Map.of("habilitado", habilitado));
        return view();
    }

    /**
     * "Testar conexão" — `GET /public-keys` prova que token + ambiente
     * estão válidos sem efeito colateral.
     */
    @Transactional
    public Map<String, Object> testarConexao() {
        IntegrationSettings cfg = load();
        boolean ok;
        String detail;
        try {
            client.chavesPublicas();
            ok = true;
            detail = "token aceito pelo PagBank — ambiente "
                    + ("homologacao".equals(ambiente(cfg)) ? "sandbox" : "produção");
        } catch (Exception e) {
            ok = false;
            detail = e.getMessage();
        }
        cfg.registrarCheck(ok, detail);
        settings.save(cfg);
        audit.record("integracao.pagbank.testar_conexao", "integration_settings",
                IntegrationSettings.PAGBANK_PAGAMENTOS, Map.of("ok", ok));
        Map<String, Object> out = new TreeMap<>();
        out.put("verificacao_status", ok ? "ok" : "falha");
        out.put("mensagem", detail);
        return out;
    }

    /** Últimos webhooks recebidos do PagBank (dedupe + resultado). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> eventos() {
        return webhookEvents.findTop100ByProviderOrderByReceivedAtDesc(PagBankProvider.NAME)
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

    /** Últimas cobranças criadas via PagBank (histórico operacional). */
    @Transactional(readOnly = true)
    public Map<String, Object> transacoes(int pagina, int tamanho) {
        var page = payments.findByProvider(PagBankProvider.NAME,
                PageRequest.of(Math.max(0, pagina), Math.min(Math.max(1, tamanho), 100)));
        var itens = page.getContent().stream().map(PagBankIntegrationService::transacaoView).toList();
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
        return base + "/api/v1/webhooks/" + PagBankProvider.NAME;
    }

    private static String ambiente(IntegrationSettings cfg) {
        String u = cfg.getBaseUrl();
        if (u == null || u.isBlank()) return "";
        return u.contains("sandbox") ? "homologacao" : "producao";
    }

    private static String baseUrlDoAmbiente(Object ambiente) {
        if (!(ambiente instanceof String a) || a.isBlank()) return null;
        return switch (a.trim().toLowerCase()) {
            case "homologacao", "sandbox" -> PagBankClient.URL_SANDBOX;
            case "producao", "production" -> PagBankClient.URL_PRODUCAO;
            default -> throw ApiException.validacao(
                    "ambiente inválido — use homologacao (sandbox) ou producao");
        };
    }

    private IntegrationSettings load() {
        return settings.findById(IntegrationSettings.PAGBANK_PAGAMENTOS)
                .orElseGet(() -> settings.save(
                        IntegrationSettings.criar(IntegrationSettings.PAGBANK_PAGAMENTOS)));
    }
}
