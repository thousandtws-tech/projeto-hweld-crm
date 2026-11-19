package com.hweld.operations.shared.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Endpoints `/api/v1/webhooks/**` são públicos (auth por assinatura dentro
 * do handler) — sem limite de corpo, um POST gigante anônimo esgotaria
 * memória lendo o raw body. Payloads reais dos provedores ficam muito
 * abaixo de 64 KiB; acima disso rejeita antes de materializar o body.
 */
@Component
public class WebhookPayloadLimitFilter extends OncePerRequestFilter {

    private static final long MAX_BYTES = 64 * 1024;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
            FilterChain chain) throws ServletException, IOException {
        long length = req.getContentLengthLong();
        if (length > MAX_BYTES) {
            res.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            res.setContentType("application/json");
            res.getWriter().write("{\"erro\":{\"codigo\":\"payload_grande\",\"mensagem\":\"payload excede o limite\"}}");
            return;
        }
        chain.doFilter(req, res);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !req.getRequestURI().startsWith("/api/v1/webhooks/");
    }
}
