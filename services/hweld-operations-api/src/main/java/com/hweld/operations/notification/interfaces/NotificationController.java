package com.hweld.operations.notification.interfaces;

import com.hweld.operations.notification.application.NotificationService;
import com.hweld.operations.notification.domain.NotificationDelivery;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
@Tag(name = "Notifications", description = "Histórico e reprocessamento de notificações transacionais")
public class NotificationController {

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    @GetMapping
    public Page<NotificationDelivery> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String recipient,
            @RequestParam(required = false) String channel,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int porPagina) {
        return service.list(status, recipient, channel, null,
                PageRequest.of(Math.max(pagina, 0), Math.min(porPagina, 100)));
    }

    @GetMapping("/{id}")
    public NotificationDelivery get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping("/{id}/retry")
    public NotificationDelivery retry(@PathVariable UUID id) {
        service.retry(id);
        return service.get(id);
    }
}
