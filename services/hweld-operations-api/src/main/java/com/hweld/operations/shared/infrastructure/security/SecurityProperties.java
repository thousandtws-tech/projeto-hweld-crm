package com.hweld.operations.shared.infrastructure.security;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hweld.security")
public record SecurityProperties(String jwtSecret, String internalServiceToken,
        List<String> corsAllowedOrigins, String edgeToken,
        String jwtIssuer, String jwtAudience) {
    public SecurityProperties {
        if (corsAllowedOrigins == null) {
            corsAllowedOrigins = List.of();
        } else {
            // `${CORS_ALLOWED_ORIGINS:}` vazio vira lista com "" — filtra
            // blanks para que vazio signifique CORS inativo de verdade.
            corsAllowedOrigins = corsAllowedOrigins.stream()
                    .filter(o -> o != null && !o.isBlank()).toList();
        }
    }
}
