-- V10 — Integração Z-API (WhatsApp) gerenciada pelo cliente.
-- Canal WHATSAPP na fila de notificações, credenciais Z-API na mesma
-- tabela integration_settings (external_id = instance ID, client_token_enc
-- = Client-Token da conta) e zapi_events para eventos recebidos via
-- webhook (dedup por instância+zaapId+tipo).

ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_channel_check;
ALTER TABLE notification_templates
    ADD CONSTRAINT notification_templates_channel_check CHECK (channel IN ('EMAIL', 'SMS', 'WHATSAPP'));

ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
ALTER TABLE notification_deliveries
    ADD CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('EMAIL', 'SMS', 'WHATSAPP'));

-- Campos extras da linha de integração — NULL nas linhas Infobip.
ALTER TABLE integration_settings
    ADD COLUMN IF NOT EXISTS external_id varchar(80),
    ADD COLUMN IF NOT EXISTS client_token_enc text;

-- Eventos recebidos do WhatsApp via webhook (received/delivery/connection).
-- Persistência mínima e normalizada — a central de conversas completa vem
-- em fase posterior; aqui já há dedup e auditoria.
CREATE TABLE IF NOT EXISTS zapi_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id   varchar(80)  NOT NULL,
    tipo          varchar(40)  NOT NULL,             -- ReceivedCallback | DeliveryCallback | ConnectedCallback | DisconnectedCallback
    zaap_id       varchar(80),                       -- id da mensagem na Z-API (correlação/dedup)
    phone         varchar(40),
    direction     varchar(10)  NOT NULL DEFAULT 'in',-- in | out | sys
    conteudo      text,                              -- texto normalizado (mídia vira [tipo])
    payload       jsonb        NOT NULL,             -- bruto para reprocessamento/forense
    recebido_em   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT zapi_events_dedup UNIQUE (instance_id, tipo, zaap_id)
);
CREATE INDEX IF NOT EXISTS zapi_events_recebido_idx ON zapi_events (recebido_em DESC);
CREATE INDEX IF NOT EXISTS zapi_events_phone_idx    ON zapi_events (phone);
