package com.hweld.operations.shared.infrastructure.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Identidade tipada extraída do JWT HS256 do core-api:
 * claims `sub` (id), `tipo` ("staff"|"portal"), `perfil` (só staff).
 */
public record AuthPrincipal(String tipo, long id, String perfil) {

    public static final String TIPO_STAFF = "staff";
    public static final String TIPO_PORTAL = "portal";
    public static final String TIPO_SERVICE = "service";

    public boolean isStaff() { return TIPO_STAFF.equals(tipo); }
    public boolean isPortal() { return TIPO_PORTAL.equals(tipo); }
    public boolean isService() { return TIPO_SERVICE.equals(tipo); }

    public static AuthPrincipal from(Authentication auth) {
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            return from(jwtAuth.getToken());
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof AuthPrincipal p) {
            return p;
        }
        // service-token auth
        return new AuthPrincipal(TIPO_SERVICE, 0L, auth.getName());
    }

    public static AuthPrincipal from(Jwt jwt) {
        String tipo = jwt.getClaimAsString("tipo");
        String perfil = jwt.getClaimAsString("perfil");
        long id;
        try {
            id = Long.parseLong(jwt.getSubject());
        } catch (NumberFormatException e) {
            id = 0L;
        }
        return new AuthPrincipal(tipo, id, perfil);
    }
}
