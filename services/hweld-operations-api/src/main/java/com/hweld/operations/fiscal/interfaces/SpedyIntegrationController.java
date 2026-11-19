package com.hweld.operations.fiscal.interfaces;

import com.hweld.operations.fiscal.application.SpedyIntegrationService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Card Spedy do módulo Integrações — credenciais fiscais gerenciadas pelo
 * cliente. `ROLE_STAFF_ADMIN` no `SecurityConfig` (`/api/v1/integracoes/**`).
 * Segredos write-only: a view devolve apenas flags `configurado`.
 */
@RestController
@RequestMapping("/api/v1/integracoes/spedy")
@Tag(name = "Integrações — Spedy", description = "Integração fiscal Spedy — configuração do cliente")
public class SpedyIntegrationController {

    private final SpedyIntegrationService service;

    public SpedyIntegrationController(SpedyIntegrationService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> view(HttpServletRequest req) {
        return service.view(publicBase(req));
    }

    @PutMapping
    public Map<String, Object> salvar(@RequestBody SpedyIntegrationService.SalvarReq req,
            HttpServletRequest http) {
        return service.salvar(req, publicBase(http));
    }

    @PostMapping("/habilitacao")
    public Map<String, Object> habilitar(@RequestBody Map<String, Boolean> body,
            HttpServletRequest http) {
        return service.habilitar(Boolean.TRUE.equals(body.get("habilitado")), publicBase(http));
    }

    @PostMapping("/testar-conexao")
    public Map<String, Object> testarConexao(HttpServletRequest http) {
        return service.testarConexao(publicBase(http));
    }

    /** Últimos eventos de webhook recebidos da Spedy — aba "Eventos". */
    @GetMapping("/eventos")
    public List<Map<String, Object>> eventos(
            @RequestParam(defaultValue = "20") int limite) {
        return service.eventos(limite);
    }

    /** Documentos fiscais emitidos via Spedy — aba "Histórico". */
    @GetMapping("/documentos")
    public List<Map<String, Object>> documentos(
            @RequestParam(defaultValue = "20") int limite) {
        return service.documentos(limite);
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
