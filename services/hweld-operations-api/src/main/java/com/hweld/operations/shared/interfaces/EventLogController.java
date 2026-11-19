package com.hweld.operations.shared.interfaces;

import com.hweld.operations.shared.infrastructure.outbox.OutboxEventEntity;
import com.hweld.operations.shared.infrastructure.outbox.OutboxEventRepository;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Listagem dos eventos de integração (outbox) — PENDING/PUBLISHED/DEAD,
 * tentativas, último erro e payload. Restrito a staff admin/financeiro.
 */
@RestController
@RequestMapping("/api/v1/events")
@Tag(name = "Events", description = "Trilha de eventos de integração (outbox)")
public class EventLogController {

    private final OutboxEventRepository outbox;

    public EventLogController(OutboxEventRepository outbox) {
        this.outbox = outbox;
    }

    @GetMapping
    public Page<OutboxEventEntity> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String eventType,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int porPagina) {
        return outbox.search(status, eventType,
                PageRequest.of(Math.max(pagina, 0), Math.max(1, Math.min(porPagina, 100))));
    }
}
