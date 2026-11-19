package com.hweld.operations.notification.interfaces;

import com.hweld.operations.notification.application.NotificationService;
import com.hweld.operations.notification.application.ZapiIntegrationService;
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
 * Card Z-API do módulo Integrações — configuração gerenciada pelo cliente.
 * `ROLE_STAFF_ADMIN` no `SecurityConfig` (`/api/v1/integracoes/**`).
 * Segredos write-only: a view devolve apenas flags `configurado`.
 */
@RestController
@RequestMapping("/api/v1/integracoes/zapi")
@Tag(name = "Integrações — Z-API", description = "Integração Z-API WhatsApp — configuração do cliente")
public class ZapiIntegrationController {

    private final ZapiIntegrationService service;
    private final NotificationService notifications;

    public ZapiIntegrationController(ZapiIntegrationService service, NotificationService notifications) {
        this.service = service;
        this.notifications = notifications;
    }

    @GetMapping
    public Map<String, Object> view(HttpServletRequest req) {
        return service.view(publicBase(req));
    }

    @PutMapping
    public Map<String, Object> salvar(@RequestBody ZapiIntegrationService.SalvarReq req,
            HttpServletRequest http) {
        return service.salvar(req, publicBase(http));
    }

    @PostMapping("/habilitacao")
    public Map<String, Object> habilitar(@RequestBody Map<String, Boolean> body,
            HttpServletRequest http) {
        return service.habilitar(Boolean.TRUE.equals(body.get("habilitado")), publicBase(http));
    }

    @PostMapping("/testar-conexao")
    public Map<String, Object> testarConexao() {
        return service.testarConexao();
    }

    /** QR Code para conectar o número — `{imagem: data:image/png;base64,...}`. */
    @GetMapping("/qrcode")
    public Map<String, Object> qrcode() {
        return service.qrCode();
    }

    @PostMapping("/desconectar")
    public Map<String, Object> desconectar(HttpServletRequest http) {
        return service.desconectar(publicBase(http));
    }

    /** Gira o segredo do path dos webhooks e re-registra na instância. */
    @PostMapping("/webhook/rotacionar-segredo")
    public Map<String, Object> rotacionarSegredo(HttpServletRequest http) {
        return service.rotacionarSegredo(publicBase(http));
    }

    @PostMapping("/mensagem-teste")
    public Map<String, Object> mensagemTeste(
            @RequestBody ZapiIntegrationService.MsgTesteReq req) {
        return service.mensagemTeste(req);
    }

    /** Últimos eventos de webhook recebidos — "Eventos" do card. */
    @GetMapping("/eventos")
    public List<Map<String, Object>> eventos(
            @RequestParam(defaultValue = "20") int limite) {
        return service.eventos(limite);
    }

    @PostMapping("/deliveries/{id}/reprocessar")
    public NotificationDelivery reprocessar(@PathVariable UUID id) {
        return service.reprocessar(id);
    }

    /** Histórico WhatsApp — mesma fila/contract do histórico SMS. */
    @GetMapping("/historico")
    public Page<NotificationDelivery> historico(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long pedidoId,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int porPagina) {
        return notifications.list(status, null, "WHATSAPP", pedidoId,
                PageRequest.of(Math.max(pagina, 0), Math.max(1, Math.min(porPagina, 100))));
    }

    private static String publicBase(HttpServletRequest req) {
        String proto = req.getHeader("X-Forwarded-Proto");
        String host = req.getHeader("X-Forwarded-Host");
        if (host == null || host.isBlank()) host = req.getHeader("Host");
        if (host == null || host.isBlank()) return null;
        if (proto == null || proto.isBlank()) proto = req.getScheme();
        return proto + "://" + host.split(",")[0].trim();
    }
}
