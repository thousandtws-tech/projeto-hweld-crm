package com.hweld.operations.logistics.interfaces;

import com.hweld.operations.logistics.application.MelhorEnvioIntegrationService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/integracoes/melhorenvio")
@Tag(name = "Integrações — Melhor Envio", description = "Integração logística Melhor Envio — configuração do cliente")
public class MelhorEnvioIntegrationController {

    private final MelhorEnvioIntegrationService service;

    public MelhorEnvioIntegrationController(MelhorEnvioIntegrationService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> view() {
        return service.view();
    }

    @PutMapping
    public Map<String, Object> salvar(@RequestBody MelhorEnvioIntegrationService.SalvarReq req) {
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
}
