package com.hweld.operations.shared.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rate limit dos webhooks públicos — janela fixa de 1 minuto.
 *
 * Por que dois tetos: o PagBank autentica webhook por fetch-back (cada
 * POST válido-em-formato gera uma chamada real à API do PSP) — flood
 * anônimo queimaria nossa quota no provedor mesmo com IPs rotativos,
 * então o teto GLOBAL segura o custo de I/O; o por-IP segura ruído
 * concentrado. Volume real de eventos fica em dezenas/minuto no pico.
 *
 * Baldes chaveados por `ip:janela` — janelas expiradas são varridas na
 * própria contagem (mapa nunca cresce além do tráfego do minuto corrente).
 */
@Component
public class WebhookRateLimitFilter extends OncePerRequestFilter {

    private static final long JANELA_MS = 60_000;
    private static final int LIMITE_IP = 60;
    private static final int LIMITE_GLOBAL = 300;

    private final Map<String, AtomicInteger> baldes = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
            FilterChain chain) throws ServletException, IOException {
        long janela = System.currentTimeMillis() / JANELA_MS;
        if (estourou("", janela, LIMITE_GLOBAL)
                || estourou(req.getRemoteAddr(), janela, LIMITE_IP)) {
            res.setStatus(429);
            res.setContentType("application/json");
            res.getWriter().write("{\"erro\":{\"codigo\":\"rate_limit\",\"mensagem\":\"muitas requisições\"}}");
            return;
        }
        chain.doFilter(req, res);
    }

    private boolean estourou(String ip, long janela, int limite) {
        int n = baldes.computeIfAbsent(ip + ":" + janela,
                k -> new AtomicInteger()).incrementAndGet();
        // Limpeza oportunista: remove janelas passadas para o mapa não
        // acumular um balde por IP por minuto para sempre.
        if ((n & 0x3F) == 0) {
            limpar(janela);
        }
        return n > limite;
    }

    private void limpar(long janelaAtual) {
        Iterator<String> it = baldes.keySet().iterator();
        while (it.hasNext()) {
            String k = it.next();
            long j = Long.parseLong(k.substring(k.lastIndexOf(':') + 1));
            if (j < janelaAtual) {
                it.remove();
            }
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !req.getRequestURI().startsWith("/api/v1/webhooks/");
    }
}
