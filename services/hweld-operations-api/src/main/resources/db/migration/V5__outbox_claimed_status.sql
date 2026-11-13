-- V5 — outbox: status CLAIMED para consumo concorrente por múltiplas réplicas.
-- O relay clama linhas com UPDATE ... SELECT ... FOR UPDATE SKIP LOCKED,
-- então dois workers nunca despacham o mesmo evento. O claim grava
-- next_retry_at = now() + lease: se o worker morrer antes de despachar, o
-- lease expira e a linha é re-clamada automaticamente (sem coluna extra).
ALTER TABLE outbox_events DROP CONSTRAINT outbox_events_status_check;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_status_check
    CHECK (status IN ('PENDING','CLAIMED','PUBLISHED','DEAD'));
