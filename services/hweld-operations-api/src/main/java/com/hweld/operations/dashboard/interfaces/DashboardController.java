package com.hweld.operations.dashboard.interfaces;

import com.hweld.operations.dashboard.application.DashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * `GET /api/v1/dashboard/resumo` — painel operacional do backoffice:
 * contagens por status e somas sobre payments, billing, fiscal,
 * notificações e a projeção de pedidos. Restrito a `ROLE_STAFF`
 * (SecurityConfig) — nunca exposto ao portal.
 */
@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

    private final DashboardService service;

    public DashboardController(DashboardService service) {
        this.service = service;
    }

    @GetMapping("/resumo")
    public DashboardService.Resumo resumo() {
        return service.resumo();
    }
}
