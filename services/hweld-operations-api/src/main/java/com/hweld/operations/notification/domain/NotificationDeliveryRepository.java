package com.hweld.operations.notification.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationDeliveryRepository extends JpaRepository<NotificationDelivery, UUID> {

    /**
     * Claim do dispatcher — FOR UPDATE SKIP LOCKED na TX do caller: duas
     * réplicas nunca despacham o mesmo delivery (SMS/WhatsApp duplicado).
     */
    @Query(value = """
            SELECT * FROM notification_deliveries
            WHERE status IN ('QUEUED','FAILED')
              AND (next_retry_at IS NULL OR next_retry_at <= :now)
            ORDER BY created_at
            LIMIT :limite
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<NotificationDelivery> findDispatchable(@Param("now") Instant now,
            @Param("limite") int limite);

    Page<NotificationDelivery> findByRecipientOrderByCreatedAtDesc(String recipient, Pageable pageable);

    Page<NotificationDelivery> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    Page<NotificationDelivery> findByChannelOrderByCreatedAtDesc(String channel, Pageable pageable);

    Page<NotificationDelivery> findByChannelAndStatusOrderByCreatedAtDesc(
            String channel, String status, Pageable pageable);

    Page<NotificationDelivery> findByChannelAndPedidoIdOrderByCreatedAtDesc(
            String channel, Long pedidoId, Pageable pageable);

    java.util.Optional<NotificationDelivery> findByMessageId(String messageId);

    java.util.Optional<NotificationDelivery> findByDedupKey(String dedupKey);

    /** SMS aceito pelo provider sem DLR há muito tempo → reconciliação. */
    List<NotificationDelivery> findByChannelAndStatusAndSentAtBefore(
            String channel, String status, Instant cutoff, Pageable pageable);

    /** Versão multi-canal (SMS + WHATSAPP) para a reconciliação de DLR. */
    List<NotificationDelivery> findByChannelInAndStatusAndSentAtBefore(
            List<String> channels, String status, Instant cutoff, Pageable pageable);

    /** Evento posterior torna pendências obsoletas — ex.: PaymentConfirmed
     *  suprime o sms_payment_requested ainda na fila do mesmo pedido. */
    @Query("""
            SELECT d FROM NotificationDelivery d
            WHERE d.channel = :channel AND d.status = 'QUEUED'
              AND d.pedidoId = :pedidoId AND d.templateCode = :templateCode
            """)
    List<NotificationDelivery> findSupprimable(@Param("channel") String channel,
            @Param("pedidoId") Long pedidoId, @Param("templateCode") String templateCode);

    default List<NotificationDelivery> findSmsSupprimable(Long pedidoId, String templateCode) {
        return findSupprimable("SMS", pedidoId, templateCode);
    }

    long countByChannelAndStatusIn(String channel, List<String> statuses);

    /** Últimos relatórios DLR recebidos — card "Eventos de webhook". */
    @Query("""
            SELECT d FROM NotificationDelivery d
            WHERE d.channel = :channel AND d.remoteStatus IS NOT NULL
            ORDER BY COALESCE(d.deliveredAt, d.sentAt, d.createdAt) DESC
            """)
    Page<NotificationDelivery> findLatestDlr(@Param("channel") String channel, Pageable pageable);
}
