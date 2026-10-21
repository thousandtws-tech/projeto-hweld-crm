package com.hweld.operations.shared.interfaces.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.filter.ShallowEtagHeaderFilter;

/**
 * Cache HTTP para GETs — ETag + revalidação (304) e Cache-Control.
 *
 * <p>Restrições do {@link ShallowEtagHeaderFilter}: buffering da resposta
 * (aceitável — payloads são JSON paginados), ETag fraco por hash do corpo.
 *
 * <p>Todas as rotas são tenant-scoped/autenticadas → {@code private, no-cache}:
 * o browser pode armazenar, mas sempre revalida — o 304 transforma a
 * revalidação em ~0 bytes. {@code Vary: Authorization} impede que caches
 * compartilhados sirvam dados de um tenant para outro.
 */
@Configuration
public class HttpCachingConfig {

    @Bean
    FilterRegistrationBean<ShallowEtagHeaderFilter> etagFilter() {
        FilterRegistrationBean<ShallowEtagHeaderFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new ShallowEtagHeaderFilter());
        bean.addUrlPatterns("/api/*");
        bean.setName("shallowEtagFilter");
        bean.setOrder(Ordered.LOWEST_PRECEDENCE - 10);
        return bean;
    }

    @Bean
    FilterRegistrationBean<CacheControlHeaderFilter> cacheControlFilter() {
        FilterRegistrationBean<CacheControlHeaderFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new CacheControlHeaderFilter());
        bean.addUrlPatterns("/api/*");
        bean.setName("cacheControlHeaderFilter");
        bean.setOrder(Ordered.LOWEST_PRECEDENCE - 20);
        return bean;
    }

    /** {@code private, no-cache} + Vary em GETs sem Cache-Control próprio. */
    static class CacheControlHeaderFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(
                HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            chain.doFilter(req, res);
            if (!HttpMethod.GET.matches(req.getMethod()) || res.containsHeader(HttpHeaders.CACHE_CONTROL)) {
                return;
            }
            res.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-cache");
            String vary = res.getHeader(HttpHeaders.VARY);
            if (vary == null || vary.isBlank()) {
                res.setHeader(HttpHeaders.VARY, "Authorization");
            } else if (!vary.toLowerCase().contains("authorization")) {
                res.setHeader(HttpHeaders.VARY, vary + ", Authorization");
            }
        }
    }
}
