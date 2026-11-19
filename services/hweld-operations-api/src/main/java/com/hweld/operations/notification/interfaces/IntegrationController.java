package com.hweld.operations.notification.interfaces;

import com.hweld.operations.notification.application.IntegrationService;
import com.hweld.operations.notification.application.NotificationService;
import com.hweld.operations.notification.domain.NotificationDelivery;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
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
 * Módulo Integrações do painel — configuração da Infobip gerenciada pelo
 * cliente. Restrito a `ROLE_STAFF_ADMIN` no `SecurityConfig`. Segredos são
 * write-only: a view só devolve flags `configurado`, nunca valores; o
 * segredo do webhook DLR é gerado no servidor na primeira gravação.
 */
@RestController
@RequestMapping("/api/v1/integracoes/infobip")
@Tag(name = "Integrações", description = "Integração Infobip SMS — configuração do cliente")
public class IntegrationController {

    private final IntegrationService service;
    private final NotificationService notifications;

    public IntegrationController(IntegrationService service, NotificationService notifications) {
        this.service = service;
        this.notifications = notifications;
    }

    @GetMapping
    public Map<String, Object> view(HttpServletRequest req) {
        return service.view(publicBase(req));
    }

    @PutMapping
    public Map<String, Object> salvar(@RequestBody IntegrationService.SalvarReq req,
            HttpServletRequest http) {
        return service.salvar(req, publicBase(http));
    }

    @PostMapping("/habilitacao")
    public Map<String, Object> habilitar(@RequestBody Map<String, Boolean> body,
            HttpServletRequest http) {
        return service.habilitar(Boolean.TRUE.equals(body.get("habilitado")), publicBase(http));
    }

    /** Gira o segredo do path do webhook DLR — devolve a URL nova na view. */
    @PostMapping("/webhook/rotacionar-segredo")
    public Map<String, Object> rotacionarSegredo(HttpServletRequest http) {
        return service.rotacionarSegredo(publicBase(http));
    }

    @PostMapping("/testar-conexao")
    public Map<String, Object> testarConexao() {
        return service.testarConexao();
    }

    @PostMapping("/sms-teste")
    public Map<String, Object> smsTeste(@RequestBody IntegrationService.SmsTesteReq req) {
        return service.enviarSmsTeste(req);
    }

    /** Últimos DLRs recebidos — "Eventos de webhook" do card. */
    @GetMapping("/eventos")
    public List<Map<String, Object>> eventos(
            @RequestParam(defaultValue = "20") int limite) {
        return service.eventos(limite);
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
                PageRequest.of(Math.max(pagina, 0), Math.max(1, Math.min(porPagina, 100))));
    }

    /** Base pública derivada do request quando `APP_PUBLIC_URL` não está setada. */
    private static String publicBase(HttpServletRequest req) {
        String proto = req.getHeader("X-Forwarded-Proto");
        String host = req.getHeader("X-Forwarded-Host");
        if (host == null || host.isBlank()) host = req.getHeader("Host");
        if (host == null || host.isBlank()) return null;
        if (proto == null || proto.isBlank()) proto = req.getScheme();
        return proto + "://" + host.split(",")[0].trim();
    }
}
