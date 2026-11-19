package com.hweld.operations.logistics.application;

import com.hweld.operations.logistics.infrastructure.melhorenvio.MelhorEnvioClient;
import com.hweld.operations.logistics.infrastructure.melhorenvio.MelhorEnvioProvider;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Gerenciamento da integração Melhor Envio pelo cliente no painel —
 * view/salvar/habilitar/testarConexao. Token write-only (só `configurado`
 * flag), cifrado em `api_key_enc`. `GET /me` valida o token e traz
 * id/nome da conta para `external_id`/`nome_conta`.
 */
@Service
public class MelhorEnvioIntegrationService {

    public record SalvarReq(Long versao, String nomeConta, Map<String, Object> config,
            Map<String, String> segredos) {
    }

    private final IntegrationSettingsRepository settings;
    private final MelhorEnvioClient client;
    private final CredentialCipher cipher;
    private final AuditService audit;

    public MelhorEnvioIntegrationService(IntegrationSettingsRepository settings,
            MelhorEnvioClient client, CredentialCipher cipher, AuditService audit) {
        this.settings = settings;
        this.client = client;
        this.cipher = cipher;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> view() {
        IntegrationSettings cfg = load();
        Map<String, Object> check = cfg.getLastCheck() != null
                ? cfg.getLastCheck() : Map.of();

        Map<String, Object> config = new TreeMap<>();
        config.put("ambiente", ambiente(cfg));
        config.put("cep_origem", cfg.cepOrigem() != null ? cfg.cepOrigem() : "");
        config.put("cotacao_pausada", cfg.isEnvioPausado());
        String servicos = String.valueOf(cfg.getConfig().getOrDefault("servicos", ""));
        if (!servicos.isBlank() && !"null".equals(servicos)) config.put("servicos", servicos);

        Map<String, Object> view = new TreeMap<>();
        view.put("provedor", "melhorenvio");
        view.put("categoria", "logistica");
        view.put("ambiente", ambiente(cfg));
        view.put("provider_ativo", cfg.isEnabled() && cfg.credenciaisMelhorEnvioCompletas()
                ? MelhorEnvioProvider.NAME : "");
        view.put("nome_conta", cfg.getNomeConta() != null ? cfg.getNomeConta() : "");
        view.put("conta_id", cfg.getExternalId() != null ? cfg.getExternalId() : "");
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
        if (!cfg.credenciaisMelhorEnvioCompletas()) return "pendente";
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

        var novaConfig = new TreeMap<String, Object>(cfg.getConfig());
        if (c.containsKey("cep_origem")) {
            String cep = c.get("cep_origem") != null
                    ? c.get("cep_origem").toString().replaceAll("\\D", "") : "";
            if (!cep.isEmpty() && cep.length() != 8) {
                throw ApiException.validacao("cep_origem inválido — 8 dígitos");
            }
            if (cep.isEmpty()) novaConfig.remove("cep_origem");
            else novaConfig.put("cep_origem", cep);
        }
        if (c.containsKey("servicos")) {
            Object s = c.get("servicos");
            if (s == null || s.toString().isBlank()) novaConfig.remove("servicos");
            else novaConfig.put("servicos", s.toString().trim());
        }

        cfg.atualizarMelhorEnvio(
                req.nomeConta(),
                cfg.isEnabled(),
                baseUrl,
                cfg.getExternalId(),
                Boolean.TRUE.equals(c.get("cotacao_pausada")),
                novaConfig,
                actor.tipo() + ":" + actor.id());

        if (req.segredos() != null && req.segredos().containsKey("token")) {
            String token = req.segredos().get("token");
            cfg.definirApiKey(token == null || token.isBlank()
                    ? null : cipher.encrypt(token.trim()));
        }
        settings.save(cfg);
        audit.record("integracao.melhorenvio.salvar", "integration_settings",
                IntegrationSettings.MELHOR_ENVIO_FRETE,
                Map.of("tokenDefinido", cfg.getApiKeyEnc() != null));
        return view();
    }

    @Transactional
    public Map<String, Object> habilitar(boolean habilitado) {
        IntegrationSettings cfg = load();
        var actor = AuditService.currentActor();
        cfg.atualizarMelhorEnvio(cfg.getNomeConta(), habilitado, cfg.getBaseUrl(),
                cfg.getExternalId(), cfg.isEnvioPausado(), cfg.getConfig(),
                actor.tipo() + ":" + actor.id());
        settings.save(cfg);
        audit.record("integracao.melhorenvio.habilitacao", "integration_settings",
                IntegrationSettings.MELHOR_ENVIO_FRETE, Map.of("habilitado", habilitado));
        return view();
    }

    /**
     * "Testar conexão" — `GET /me` valida o token e atualiza
     * `external_id`/`nome_conta` com a conta resolvida.
     */
    @Transactional
    public Map<String, Object> testarConexao() {
        IntegrationSettings cfg = load();
        boolean ok;
        String detail;
        try {
            JsonNode me = client.me();
            String nome = me.path("firstname").asString(null);
            if (nome == null) nome = me.path("name").asString(null);
            String id = me.hasNonNull("id") ? me.path("id").asString() : null;
            ok = true;
            detail = nome != null ? "conta acessível — " + nome : "conta acessível";
            if (id != null || nome != null) {
                cfg.atualizarMelhorEnvio(
                        nome != null ? nome : cfg.getNomeConta(),
                        cfg.isEnabled(), cfg.getBaseUrl(),
                        id != null ? id : cfg.getExternalId(),
                        cfg.isEnvioPausado(), cfg.getConfig(), "sync:melhorenvio");
            }
        } catch (Exception e) {
            ok = false;
            detail = e.getMessage();
        }
        cfg.registrarCheck(ok, detail);
        settings.save(cfg);
        audit.record("integracao.melhorenvio.testar_conexao", "integration_settings",
                IntegrationSettings.MELHOR_ENVIO_FRETE, Map.of("ok", ok));
        Map<String, Object> out = new TreeMap<>();
        out.put("verificacao_status", ok ? "ok" : "falha");
        out.put("mensagem", detail);
        return out;
    }

    private static String ambiente(IntegrationSettings cfg) {
        String u = cfg.getBaseUrl();
        if (u == null || u.isBlank()) return "";
        return u.contains("sandbox") ? "homologacao" : "producao";
    }

    private static String baseUrlDoAmbiente(Object ambiente) {
        if (!(ambiente instanceof String a) || a.isBlank()) return null;
        return switch (a.trim().toLowerCase()) {
            case "homologacao", "sandbox" -> MelhorEnvioClient.URL_SANDBOX;
            case "producao", "production" -> MelhorEnvioClient.URL_PRODUCAO;
            default -> throw ApiException.validacao(
                    "ambiente inválido — use homologacao (sandbox) ou producao");
        };
    }

    private IntegrationSettings load() {
        return settings.findById(IntegrationSettings.MELHOR_ENVIO_FRETE)
                .orElseGet(() -> settings.save(
                        IntegrationSettings.criar(IntegrationSettings.MELHOR_ENVIO_FRETE)));
    }
}
