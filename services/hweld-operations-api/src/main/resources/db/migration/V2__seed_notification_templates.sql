-- V2 — templates transacionais padrão (pt-BR). Variáveis {{nome}} renderizadas
-- com escape HTML. Edição via SQL/endpoint admin futuro — nunca hardcoded no Java.

INSERT INTO notification_templates (code, channel, subject, body_html, body_text) VALUES
('payment_requested', 'EMAIL',
 'Instruções de pagamento — pedido {{pedidoNumero}}',
 '<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
  <h2 style="color:#FF6500">Pagamento do pedido {{pedidoNumero}}</h2>
  <p>Olá! Seu pedido foi registrado. Para concluir, pague <strong>R$ {{amount}}</strong> via {{method}}.</p>
  <p style="background:#f6f6f6;padding:12px;border-radius:8px;word-break:break-all;font-family:monospace">{{pixCopyPaste}}</p>
  <p>Validade: {{expiresAt}}. Após a confirmação você recebe o comprovante por e-mail.</p>
  <p style="color:#666;font-size:12px">HWeld — não responda este e-mail.</p></div>',
 'Pagamento do pedido {{pedidoNumero}} — R$ {{amount}} via {{method}}. PIX copia-e-cola: {{pixCopyPaste}} (validade {{expiresAt}}).'),

('payment_confirmed', 'EMAIL',
 'Pagamento confirmado — pedido {{pedidoNumero}}',
 '<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
  <h2 style="color:#1a7f37">Pagamento confirmado</h2>
  <p>Recebemos o pagamento de <strong>R$ {{amount}}</strong> do pedido {{pedidoNumero}}.</p>
  <p>Você será avisado sobre o faturamento e a entrega.</p>
  <p style="color:#666;font-size:12px">HWeld — não responda este e-mail.</p></div>',
 'Pagamento confirmado: pedido {{pedidoNumero}}, R$ {{amount}}.'),

('payment_failed', 'EMAIL',
 'Pagamento não aprovado — pedido {{pedidoNumero}}',
 '<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
  <h2 style="color:#b3261e">Pagamento não aprovado</h2>
  <p>O pagamento do pedido {{pedidoNumero}} não foi aprovado.</p>
  <p>Motivo: {{failureCode}}. Você pode tentar novamente pelo portal.</p>
  <p style="color:#666;font-size:12px">HWeld — não responda este e-mail.</p></div>',
 'Pagamento do pedido {{pedidoNumero}} não aprovado. Motivo: {{failureCode}}.'),

('invoice_authorized', 'EMAIL',
 'Nota fiscal emitida — pedido {{pedidoNumero}}',
 '<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
  <h2 style="color:#1a7f37">Nota fiscal autorizada</h2>
  <p>A nota fiscal do pedido {{pedidoNumero}} foi autorizada.</p>
  <p>Chave de acesso: <code>{{accessKey}}</code></p>
  <p style="color:#666;font-size:12px">HWeld — não responda este e-mail.</p></div>',
 'Nota fiscal do pedido {{pedidoNumero}} autorizada. Chave: {{accessKey}}.'),

('invoice_rejected', 'EMAIL',
 'Falha na emissão fiscal — pedido {{pedidoNumero}}',
 '<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
  <h2 style="color:#b3261e">Nota fiscal rejeitada</h2>
  <p>A emissão fiscal do pedido {{pedidoNumero}} foi rejeitada: {{rejectionReason}}.</p>
  <p>Nossa equipe foi notificada e entrará em contato se necessário.</p>
  <p style="color:#666;font-size:12px">HWeld — não responda este e-mail.</p></div>',
 'Emissão fiscal do pedido {{pedidoNumero}} rejeitada: {{rejectionReason}}.');
