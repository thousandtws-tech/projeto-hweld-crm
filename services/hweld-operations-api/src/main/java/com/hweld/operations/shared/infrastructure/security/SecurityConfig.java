package com.hweld.operations.shared.infrastructure.security;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Resource server JWT HS256 — mesmo segredo do core-api Rust (claims
 * `sub/tipo/perfil`). Staff tem ROLE_STAFF_<PERFIL>; portal tem ROLE_PORTAL.
 * `/internal/**` usa X-Service-Token; `/webhooks/**` são públicos e
 * autenticados por assinatura do provedor dentro do handler.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder decoder,
            Converter<Jwt, AbstractAuthenticationToken> jwtConverter, SecurityProperties props) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            // Allowlist explícita via `hweld.security.cors-allowed-origins`
            // (dev: Vite :5173). Vazia = CORS inativo — prod vai same-origin
            // pelo Worker de borda.
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health/**", "/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/api/v1/webhooks/**").permitAll()
                .requestMatchers("/api/v1/internal/**").hasAuthority("ROLE_SERVICE")
                .requestMatchers(HttpMethod.POST, "/api/v1/payments/*/cancel", "/api/v1/payments/*/refund",
                        "/api/v1/payments/*/reconcile", "/api/v1/fiscal-documents/**")
                    .hasAnyAuthority("ROLE_STAFF_ADMIN", "ROLE_STAFF_FINANCEIRO")
                .requestMatchers("/api/v1/billing/**", "/api/v1/fiscal-documents/**", "/api/v1/notifications/**",
                        "/api/v1/events/**")
                    .hasAnyAuthority("ROLE_STAFF_ADMIN", "ROLE_STAFF_FINANCEIRO")
                // Métricas operacionais agregadas — qualquer staff, nunca portal.
                .requestMatchers("/api/v1/dashboard/**").hasAuthority("ROLE_STAFF")
                .requestMatchers("/api/v1/**")
                    .hasAnyAuthority("ROLE_STAFF", "ROLE_PORTAL", "ROLE_SERVICE")
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter)))
            // Guarda de borda antes de qualquer auth: tráfego direto à origem
            // morre aqui (403) sem chegar ao JWT nem ao service token.
            .addFilterBefore(new EdgeTokenFilter(props.edgeToken()), BearerTokenAuthenticationFilter.class)
            .addFilterBefore(new ServiceTokenFilter(props.internalServiceToken()), BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    org.springframework.web.cors.CorsConfigurationSource corsConfigurationSource(
            SecurityProperties props) {
        var cfg = new org.springframework.web.cors.CorsConfiguration();
        cfg.setAllowedOrigins(props.corsAllowedOrigins());
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With"));
        cfg.setMaxAge(3600L);
        var src = new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/api/**", cfg);
        return src;
    }

    @Bean
    JwtDecoder jwtDecoder(SecurityProperties props) {
        String secret = props.jwtSecret();
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException("JWT_SECRET ausente ou com menos de 32 bytes — fail-fast");
        }
        SecretKey key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(JwtValidators.createDefault());
        return decoder;
    }

    @Bean
    Converter<Jwt, AbstractAuthenticationToken> jwtConverter() {
        return jwt -> {
            String tipo = jwt.getClaimAsString("tipo");
            String perfil = jwt.getClaimAsString("perfil");
            List<GrantedAuthority> authorities = new ArrayList<>();
            if (AuthPrincipal.TIPO_STAFF.equals(tipo)) {
                authorities.add(new SimpleGrantedAuthority("ROLE_STAFF"));
                if (perfil != null) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_STAFF_" + perfil.toUpperCase()));
                }
            } else if (AuthPrincipal.TIPO_PORTAL.equals(tipo)) {
                authorities.add(new SimpleGrantedAuthority("ROLE_PORTAL"));
            }
            return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
        };
    }
}
