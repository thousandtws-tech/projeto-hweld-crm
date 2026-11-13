-- E-mail do contato capturado na criação do pagamento: os eventos de
-- domínio (PaymentConfirmed etc.) precisam do destinatário sem depender
-- de chamada síncrona ao core-api durante o relay da outbox.
ALTER TABLE payments ADD COLUMN contato_email varchar(320);
