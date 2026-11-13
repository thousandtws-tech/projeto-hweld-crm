package com.hweld.operations.shared.infrastructure.audit;

import com.hweld.operations.shared.infrastructure.security.AuthPrincipal;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Auditoria de operações críticas — ator resolvido do SecurityContext. */
@Service
public class AuditService {

    private final AuditLogRepository repository;

    public AuditService(AuditLogRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(String action, String entityType, String entityId, Map<String, Object> details) {
        AuthPrincipal actor = currentActor();
        repository.save(new AuditLogEntity(
                actor.tipo(), String.valueOf(actor.id()), action, entityType, entityId, details, null));
    }

    public static AuthPrincipal currentActor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return new AuthPrincipal(AuthPrincipal.TIPO_SERVICE, 0L, "system");
        }
        return AuthPrincipal.from(auth);
    }
}
