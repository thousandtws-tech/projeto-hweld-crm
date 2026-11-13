package com.hweld.operations.billing.interfaces;

import com.hweld.operations.billing.application.BillingService;
import com.hweld.operations.billing.domain.BillingInvoice;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/billing")
@Tag(name = "Billing", description = "Faturas/contas a receber vinculadas a pagamentos")
public class BillingController {

    private final BillingService service;

    public BillingController(BillingService service) {
        this.service = service;
    }

    @GetMapping
    public Page<BillingInvoice> list(@RequestParam(required = false) Long pedidoId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int porPagina) {
        return service.list(pedidoId, status,
                PageRequest.of(Math.max(pagina, 0), Math.min(porPagina, 100),
                        Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    @GetMapping("/{id}")
    public BillingInvoice get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping("/{id}/cancel")
    public BillingInvoice cancel(@PathVariable UUID id) {
        return service.cancel(id);
    }
}
