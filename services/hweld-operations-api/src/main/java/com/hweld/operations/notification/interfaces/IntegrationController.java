package com.hweld.operations.notification.interfaces;

import com.hweld.operations.notification.application.IntegrationService;
import com.hweld.operations.notification.application.NotificationService;
import com.hweld.operations.notification.domain.NotificationDelivery;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Módulo Integrações do painel — estado e ações da integração Infobip SMS.
 * Restrito a `ROLE_STAFF_ADMIN` no `SecurityConfig`. Nenhum segredo é
 * devolvido: flags `*Configurada` indicam presença, nunca o valor.
 */
@RestController
@RequestMapping("/api/v1/integracoes/infobip")
@Tag(name = "Integrações", description = "Estado e ações da integração Infobip SMS")
public class IntegrationController {

    public record ConfigReq(Boolean enabled, String sender, Integer maxSegments,
            List<String> testRecipients, Map<String, Boolean> events) {}
    public record SmsTesteReq(String destinatario) {}

    private final IntegrationService service;
    private final NotificationService notifications;

    public IntegrationController(IntegrationService service, NotificationService notifications) {
        this.service = service;
        this.notifications = notifications;
    }

    @GetMapping
    public Map<String, Object> status() {
        return service.status();
    }

    @PutMapping("/config")
    public Map<String, Object> configurar(@RequestBody ConfigReq req) {
        return service.atualizarConfig(
                Boolean.TRUE.equals(req.enabled()),
                req.sender(),
                req.maxSegments() != null ? req.maxSegments() : 3,
                req.testRecipients(),
                req.events());
    }

    @PostMapping("/testar-conexao")
    public Map<String, Object> testarConexao() {
        return service.testarConexao();
    }

    @PostMapping("/sms-teste")
    public NotificationDelivery smsTeste(@RequestBody SmsTesteReq req) {
        return service.enviarSmsTeste(new IntegrationService.SmsTesteCmd(req.destinatario()));
    }

    @PostMapping("/deliveries/{id}/reprocessar")
    public NotificationDelivery reprocessar(@PathVariable UUID id) {
        return service.reprocessar(id);
    }

    /** Histórico SMS — filtros período/status/pedido, pendências inclusas. */
    @GetMapping("/historico")
    public Page<NotificationDelivery> historico(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long pedidoId,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int porPagina) {
        return notifications.list(status, null, "SMS", pedidoId,
                PageRequest.of(Math.max(pagina, 0), Math.min(porPagina, 100)));
    }
}
