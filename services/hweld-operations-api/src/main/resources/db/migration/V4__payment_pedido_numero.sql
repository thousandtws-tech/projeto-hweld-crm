-- V4 — payments.pedido_numero: denormaliza o número do pedido na criação.
-- Corrige e-mails de confirmação/falha/estorno que saíam com "pedido ,"
-- em branco (templates interpolam {{pedidoNumero}} e o payload dos eventos
-- de transição não tinha o campo — e não volta ao core-api para buscá-lo).
ALTER TABLE payments ADD COLUMN pedido_numero VARCHAR(40);
