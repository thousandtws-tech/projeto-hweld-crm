-- V8 — Integração Infobip SMS no contexto `notification` existente.
--
-- Amplia templates/entregas para o canal SMS (fila, retry e DEAD reutilizados),
-- adiciona correlação/idempotência do provider e relatórios DLR, cria a
-- tabela de toggles operacionais (segredos seguem via env — padrão FocusNFe)
-- e propaga o telefone do contato nos pagamentos para os eventos.

-- Canal SMS em templates e entregas.
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_channel_check;
ALTER TABLE notification_templates
    ADD CONSTRAINT notification_templates_channel_check CHECK (channel IN ('EMAIL', 'SMS'));

ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
ALTER TABLE notification_deliveries
    ADD CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('EMAIL', 'SMS'));

-- Ciclo de vida do SMS: ACCEPTED = Infobip recebeu; DELIVERED/EXPIRED/SUPPRESSED
-- vêm do DLR; UNKNOWN = provider não confirmou (timeout ambíguo / sem callback).
ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_status_check;
ALTER TABLE notification_deliveries
    ADD CONSTRAINT notification_deliveries_status_check CHECK
    (status IN ('QUEUED','SENDING','SENT','ACCEPTED','DELIVERED','FAILED','EXPIRED','SUPPRESSED','UNKNOWN','DEAD'));

-- Correlação com o provider, idempotência e auditoria.
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS dedup_key      VARCHAR(190);
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS message_id     VARCHAR(80);
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS bulk_id        VARCHAR(80);
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS segments       INT;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS remote_status  VARCHAR(120);
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(80);
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS pedido_id      BIGINT;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS dlr            JSONB;

-- Um evento origina no máximo uma entrega por dedup_key (re-delivery do relay,
-- re-render, click duplo no admin, etc).
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_dedup_uk
    ON notification_deliveries (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS deliveries_message_idx
    ON notification_deliveries (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deliveries_pedido_idx
    ON notification_deliveries (pedido_id) WHERE pedido_id IS NOT NULL;

-- Telefone do contato no pagamento (mesmo papel do contato_email da V3):
-- congela o destino no momento da cobrança e alimenta o payload dos eventos.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS contato_telefone VARCHAR(20);

-- Toggles operacionais da integração — um registro por código de integração.
CREATE TABLE IF NOT EXISTS integration_settings (
    code            VARCHAR(40) PRIMARY KEY,
    enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    sender          VARCHAR(32),
    max_segments    INT NOT NULL DEFAULT 3,
    test_recipients JSONB NOT NULL DEFAULT '[]',
    events          JSONB NOT NULL DEFAULT '{}',
    last_check      JSONB,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      VARCHAR(120)
);

INSERT INTO integration_settings (code) VALUES ('infobip-sms') ON CONFLICT DO NOTHING;

-- Templates transacionais pt-BR (subject = rótulo exibido no painel).
INSERT INTO notification_templates (code, channel, subject, body_html, body_text) VALUES
('sms_order_created', 'SMS', 'SMS pedido registrado', '',
 'HWeld: pedido {{pedidoNumero}} registrado em R$ {{amount}}. Pagamento: {{condicaoPagamento}}.'),
('sms_payment_requested', 'SMS', 'SMS instruções de pagamento', '',
 'HWeld: pague o pedido {{pedidoNumero}} (R$ {{amount}}) via {{method}}. PIX: {{pixCopyPaste}} — validade {{expiresAt}}.'),
('sms_payment_confirmed', 'SMS', 'SMS pagamento confirmado', '',
 'HWeld: pagamento do pedido {{pedidoNumero}} confirmado (R$ {{amount}}). Obrigado!'),
('sms_payment_failed', 'SMS', 'SMS pagamento não aprovado', '',
 'HWeld: pagamento do pedido {{pedidoNumero}} não aprovado. Tente novamente pelo portal.'),
('sms_payment_expired', 'SMS', 'SMS pagamento expirado', '',
 'HWeld: cobrança do pedido {{pedidoNumero}} expirou. Solicite uma nova no portal.'),
('sms_invoice_authorized', 'SMS', 'SMS NF-e autorizada', '',
 'HWeld: NF-e do pedido {{pedidoNumero}} autorizada. Obrigado pela preferência.'),
('sms_test', 'SMS', 'SMS de teste da integração', '',
 'HWeld: SMS de teste da integração Infobip. Nenhuma ação necessária.')
ON CONFLICT (code) DO NOTHING;
