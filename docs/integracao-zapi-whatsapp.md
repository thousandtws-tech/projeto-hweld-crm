# Integração Z-API — WhatsApp (Fase A)

Integração WhatsApp via [Z-API](https://developer.z-api.io), gerenciada pelo
cliente no painel (**Administração → Integrações → card Z-API**), no mesmo
padrão da integração Infobip SMS: credenciais cifradas no servidor, segredos
write-only, fila transacional compartilhada e auditoria.

## O que entra nesta fase

- Envio de texto transacional (`send-text`) pela mesma fila de notificações
  (dedup, retry exponencial, estados terminais, reprocessamento manual)
- Credenciais do cliente: `instance_id` + token da instância + Client-Token
  da conta — cifrados em `integration_settings` (`api_key_enc`,
  `client_token_enc`), nunca devolvidos pela API (só flags `configurado`)
- Conexão do número por QR Code (`GET /qr-code/image`) e status da sessão
  (`GET /status`) — o card mostra conectado/aguardando
- Webhooks auto-registrados na instância ao salvar
  (`PUT /update-webhook-{received,delivery,disconnected}`), autenticados por
  segredo gerado no servidor no path da URL — controle compensatório, pois a
  Z-API não assina payloads (comparação constant-time, fail-closed 503/401)
- Eventos inbound em `zapi_events` (dedup por instância+tipo+zaapId) —
  base da futura central de conversas
- Toggles por evento de negócio — reusa os corpos de texto `sms_*`
- Pausa de envio sem gastar tentativa; lista de destinatários de teste

## Endpoints

Painel (admin): `GET|PUT /api/v1/integracoes/zapi`, `POST /habilitacao`,
`/testar-conexao`, `/desconectar`, `/mensagem-teste`,
`/deliveries/{id}/reprocessar`, `GET /qrcode`, `/eventos`, `/historico`.

Webhooks (públicos, segredo no path):
`POST /api/v1/webhooks/zapi/{segredo}/{received|delivery|disconnected|connected}`

## Canal e entregas

`NotificationService` despacha `channel=WHATSAPP` para
`ZapiWhatsAppProvider`; o handler de eventos (`notification-whatsapp`)
espelha o de SMS com dedup `wa:{eventId}` e supressão de cobranças
obsoletas por canal.

## Pendências de fase posterior

Central de conversas (threads), recebimento com resposta, templates
WhatsApp aprovados, mídia/botões, campanhas e opt-out granular.
