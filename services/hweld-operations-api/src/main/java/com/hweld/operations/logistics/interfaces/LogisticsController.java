package com.hweld.operations.logistics.interfaces;

import com.hweld.operations.logistics.application.LogisticsService;
import com.hweld.operations.logistics.application.ShippingProvider;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Cotações de frete — provider-neutral (`/api/v1/logistica/**`, `ROLE_STAFF_ADMIN`).
 * Dois modos: `pedido_id` (dados autoritatídicos do core-api) ou manual
 * (cep_destino + produtos) para o sandbox do painel.
 */
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

    /** `POST /cotacoes?pedido_id=…` — cota pelos dados do pedido. */
    @PostMapping("/cotacoes")
    public Map<String, Object> cotar(@RequestParam(required = false) Long pedidoId,
            @RequestParam(required = false) String servicos,
            @RequestBody(required = false) CotacaoManualReq manual) {
        if (pedidoId != null) {
            return service.cotarPedido(pedidoId, servicos);
        }
        if (manual == null) {
            throw com.hweld.operations.shared.interfaces.error.ApiException.validacao(
                    "informe pedido_id ou cep_destino+produtos");
        }
        return service.cotarManual(manual.cepDestino(), manual.produtos(), manual.servicos());
    }

    /** Histórico de cotações — aba "Histórico" do card Melhor Envio. */
    @GetMapping("/cotacoes")
    public List<Map<String, Object>> historico(@RequestParam(defaultValue = "20") int limite) {
        return service.historico(limite);
    }
}
