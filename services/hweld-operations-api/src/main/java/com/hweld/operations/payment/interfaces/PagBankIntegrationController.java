package com.hweld.operations.payment.interfaces;

import com.hweld.operations.payment.application.PagBankIntegrationService;
import io.swagger.v3.oas.annotations.tags.Tag;
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
 * Card PagBank do módulo Integrações — credenciais do PSP gerenciadas pelo
 * cliente. `ROLE_STAFF_ADMIN` no `SecurityConfig` (`/api/v1/integracoes/**`).
 * Segredos write-only: a view devolve apenas flags `configurado`.
 */
@RestController
@RequestMapping("/api/v1/integracoes/pagbank")
@Tag(name = "Integrações — PagBank",
        description = "Integração de pagamentos PagBank — configuração do cliente")
public class PagBankIntegrationController {

    private final PagBankIntegrationService service;

    public PagBankIntegrationController(PagBankIntegrationService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> view() {
        return service.view();
    }

    @PutMapping
    public Map<String, Object> salvar(@RequestBody PagBankIntegrationService.SalvarReq req) {
        return service.salvar(req);
    }

    @PostMapping("/habilitacao")
    public Map<String, Object> habilitar(@RequestBody Map<String, Boolean> body) {
        return service.habilitar(Boolean.TRUE.equals(body.get("habilitado")));
    }

    @PostMapping("/testar-conexao")
    public Map<String, Object> testarConexao() {
        return service.testarConexao();
    }

    /** Últimos webhooks recebidos do PagBank — aba "Eventos". */
    @GetMapping("/eventos")
    public List<Map<String, Object>> eventos() {
        return service.eventos();
    }

    /** Cobranças criadas via PagBank — aba "Transações". */
    @GetMapping("/transacoes")
    public Map<String, Object> transacoes(
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int tamanho) {
        return service.transacoes(pagina, tamanho);
    }
}
