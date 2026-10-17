package com.hweld.operations.shared.infrastructure.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hweld.security")
public record SecurityProperties(String jwtSecret, String internalServiceToken) {}
