package com.hweld.operations.fiscal.interfaces;

import com.hweld.operations.fiscal.application.FiscalService;
import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.shared.infrastructure.coreapi.OrderGateway;
import com.hweld.operations.shared.infrastructure.security.AuthPrincipal;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/fiscal-documents")
@Tag(name = "Fiscal", description = "Orquestração de emissão fiscal via provedor configurado")
public class FiscalController {

    private final FiscalService service;
    private final OrderGateway orderGateway;

    public FiscalController(FiscalService service, OrderGateway orderGateway) {
        this.service = service;
        this.orderGateway = orderGateway;
    }

    public record EmitRequest(
            @NotNull Long pedidoId,
            @NotNull FiscalDocument.DocType docType,
            Long notaFiscalId,
            UUID billingInvoiceId,
            Map<String, Object> dados) {}

    @PostMapping
    public ResponseEntity<FiscalDocument> emit(@Valid @RequestBody EmitRequest req,
            Authentication auth) {
        // empresa vem do pedido no core-api (staff JWT repassado) — nunca do body
        var order = orderGateway.getOrder(req.pedidoId(), bearer(auth), false);
        FiscalDocument doc = service.requestEmission(req.pedidoId(), order.empresaId(),
                req.billingInvoiceId(), req.notaFiscalId(), req.docType(),
                req.dados() != null ? req.dados() : Map.of());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(doc);
    }

    @GetMapping
    public Page<FiscalDocument> list(@RequestParam(required = false) Long pedidoId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int porPagina) {
        return service.list(pedidoId, status,
                PageRequest.of(Math.max(pagina, 0), Math.min(porPagina, 100),
                        Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    @GetMapping("/{id}")
    public FiscalDocument get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping("/{id}/cancel")
    public FiscalDocument cancel(@PathVariable UUID id,
            @RequestBody(required = false) Map<String, String> body) {
        String motivo = body != null ? body.getOrDefault("motivo", "cancelamento solicitado") : "cancelamento solicitado";
        return service.cancel(id, motivo);
    }

    @PostMapping("/{id}/refresh")
    public FiscalDocument refresh(@PathVariable UUID id) {
        return service.refresh(id);
    }

    private static String bearer(Authentication auth) {
        if (auth instanceof JwtAuthenticationToken jwt) return jwt.getToken().getTokenValue();
        return null;
    }
}
