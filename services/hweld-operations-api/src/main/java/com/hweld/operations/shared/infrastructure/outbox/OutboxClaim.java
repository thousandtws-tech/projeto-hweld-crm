package com.hweld.operations.shared.infrastructure.outbox;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Claim atômico de eventos da outbox — permite N réplicas do serviço.
 *
 * `FOR UPDATE SKIP LOCKED` garante que dois workers nunca claman a mesma
 * linha. O claim escreve `status='CLAIMED'` + `next_retry_at = now()+lease`:
 * se o worker morrer no meio do dispatch, o lease expira e outra réplica
 * re-clama a linha (a cláusula `CLAIMED expirado` do WHERE). Efeitos
 * externos continuam protegidos pela idempotência por handler em
 * `processed_events`.
 */
@Component
public class OutboxClaim {

    @PersistenceContext
    private EntityManager em;

    @Transactional
    @SuppressWarnings("unchecked")
    public List<OutboxEventEntity> claim(int limite, Instant agora, Instant leaseExpira) {
        return em.createNativeQuery("""
                UPDATE outbox_events
                SET status = 'CLAIMED', next_retry_at = :lease
                WHERE id IN (
                    SELECT id FROM outbox_events
                    WHERE (status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= :agora))
                       OR (status = 'CLAIMED' AND next_retry_at <= :agora)
                    ORDER BY occurred_at
                    FOR UPDATE SKIP LOCKED
                    LIMIT :limite
                )
                RETURNING *
                """, OutboxEventEntity.class)
                .setParameter("lease", leaseExpira)
                .setParameter("agora", agora)
                .setParameter("limite", limite)
                .getResultList();
    }
}
