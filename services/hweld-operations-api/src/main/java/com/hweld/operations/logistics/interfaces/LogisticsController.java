package com.hweld.operations.logistics.interfaces;

import com.hweld.operations.logistics.application.LogisticsService;
import com.hweld.operations.logistics.application.ShippingProvider;
import com.hweld.operations.shared.infrastructure.security.AuthPrincipal;
import com.hweld.operations.shared.interfaces.error.ApiException;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/logistica")
@Tag(name = "Logística", description = "Cotação de fretes — Melhor Envio")
public class LogisticsController {

    public record CotacaoManualReq(String cepDestino,
            List<ShippingProvider.ProdutoCotacao> produtos, String servicos) {
    }

    private final LogisticsService service;

    public LogisticsController(LogisticsService service) {
        this.service = service;
    }

    @PostMapping("/cotacoes")
    public Map<String, Object> cotar(@RequestParam(required = false) Long pedidoId,
            @RequestParam(required = false) String servicos,
            @RequestBody(required = false) CotacaoManualReq manual,
            Authentication auth) {
        AuthPrincipal actor = AuthPrincipal.from(auth);
        if (pedidoId != null) {
            return service.cotarPedido(pedidoId, servicos, actor, bearer(auth));
        }
        if (manual == null) {
            throw ApiException.validacao("informe pedido_id ou cep_destino+produtos");
        }
        return service.cotarManual(manual.cepDestino(), manual.produtos(), manual.servicos());
    }

    @GetMapping("/cotacoes")
    public List<Map<String, Object>> historico(@RequestParam(defaultValue = "20") int limite,
            Authentication auth) {
        return service.historico(limite, AuthPrincipal.from(auth), bearer(auth));
    }

    private static String bearer(Authentication auth) {
        if (auth instanceof JwtAuthenticationToken jwt) {
            return jwt.getToken().getTokenValue();
        }
        return null;
    }
}
