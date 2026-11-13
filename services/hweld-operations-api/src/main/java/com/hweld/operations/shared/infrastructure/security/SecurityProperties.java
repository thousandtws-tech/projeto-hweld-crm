package com.hweld.operations.shared.infrastructure.security;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hweld.security")
public record SecurityProperties(String jwtSecret, String internalServiceToken,
        List<String> corsAllowedOrigins, String edgeToken) {
    public SecurityProperties {
        if (corsAllowedOrigins == null) corsAllowedOrigins = List.of();
    }
}
