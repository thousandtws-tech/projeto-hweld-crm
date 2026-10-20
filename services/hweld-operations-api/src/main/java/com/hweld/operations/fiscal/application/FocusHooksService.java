package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeClient;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProperties;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Administração dos gatilhos (webhooks) da Focus NFe — `POST/GET/DELETE
 * /v2/hooks`. O segredo `authorization` registrado no gatilho é o mesmo
 * validado pelo endpoint de recepção (`FOCUS_NFE_WEBHOOK_AUTH_TOKEN`) no
 * header `FOCUS_NFE_WEBHOOK_AUTH_HEADER`.
 */
@Service
public class FocusHooksService {

    private final FocusNFeClient client;
    private final FocusNFeProperties props;

    public FocusHooksService(FocusNFeClient client, FocusNFeProperties props) {
        this.client = client;
        this.props = props;
    }

    /** `POST /v2/hooks` — evento oficial (`nfe`/`nfse`) + URL pública + segredo. */
    public JsonNode criar(String event, String url, String cnpj) {
        exigeEvento(event);
        if (url == null || !url.startsWith("https://")) {
            throw ApiException.validacao("url do gatilho deve ser HTTPS");
        }
        if (!props.webhookConfigurado()) {
            throw ApiException.validacao(
                    "FOCUS_NFE_WEBHOOK_AUTH_TOKEN ausente — configure o segredo antes do gatilho");
        }
        return client.criarHook(event, url, cnpj,
                props.webhookAuthToken(), props.webhookAuthHeader());
    }

    /** `GET /v2/hooks` — inventário de gatilhos do token do ambiente ativo. */
    public JsonNode listar() {
        return client.listarHooks();
    }

    /** `DELETE /v2/hooks/{id}`. */
    public JsonNode excluir(String hookId) {
        return client.excluirHook(hookId);
    }

    private static void exigeEvento(String event) {
        var validos = List.of("nfe", "nfse", "nfce", "nfce_contingencia", "cte",
                "mdfe", "nfe_completa", "nfse_rps", "nfsen", "status_empresa");
        if (event == null || !validos.contains(event)) {
            throw ApiException.validacao(
                    "evento inválido — válidos: " + String.join(", ", validos));
        }
    }

    /** Lista oficial de eventos aceitos — útil para a tela de configuração. */
    public List<String> eventosValidos() {
        return new ArrayList<>(List.of("nfe", "nfse", "nfce", "nfce_contingencia",
                "cte", "mdfe", "nfe_completa", "nfse_rps", "nfsen", "status_empresa"));
    }
}
