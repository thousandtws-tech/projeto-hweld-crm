package com.hweld.operations.shared.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Guarda de borda — exige `X-Edge-Token` injetado pelo Worker Cloudflare em
 * todo request. O hostname `*.up.railway.app` é público: sem a guarda, quem
 * descobrir a origem bate direto na API sem passar pelas políticas da edge.
 *
 * Isentos: `/actuator/**` (healthcheck do Railway + smoke pós-deploy) e
 * `/api/v1/internal/**` (service-to-service com `X-Service-Token` próprio).
 * Webhooks ficam protegidos — o PSP chama a URL pública da edge, que injeta
 * o token no proxy.
 *
 * Token vazio/ausente = filtro desligado (dev local). Comparação em tempo
 * constante — o token é segredo simétrico, não JWT.
 */
public class EdgeTokenFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Edge-Token";

    private final byte[] expected;

    public EdgeTokenFilter(String token) {
        this.expected = (token == null || token.isBlank())
                ? null
                : token.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (expected == null) {
            return true;
        }
        String uri = request.getRequestURI();
        return uri.equals("/actuator")
                || uri.startsWith("/actuator/")
                || uri.startsWith("/api/v1/internal/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String token = request.getHeader(HEADER);
        if (token != null && MessageDigest.isEqual(expected, token.getBytes(StandardCharsets.UTF_8))) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"erro\":{\"codigo\":\"fora_da_borda\",\"mensagem\":\"acesso direto à origem não permitido — use a edge\"}}");
    }
}
