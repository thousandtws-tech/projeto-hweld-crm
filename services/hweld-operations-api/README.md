# hweld-operations-api

Serviço de operações de negócio do `projeto-hweld-crm`: pagamentos (PSP),
cobrança/faturamento, orquestração fiscal e notificações transacionais por
e-mail. Java 25 + Spring Boot + PostgreSQL (Flyway) + arquitetura hexagonal.

O **core-api (Rust)** continua sendo a fonte da verdade de domínio (pedidos,
parcelas `pagamentos`, `notas_fiscais`, inbox `notificacoes`, caixa). Este
serviço é dono apenas do estado operacional externo: transações no PSP,
webhooks, orquestração fiscal e histórico de entrega de e-mails.

Arquitetura e fronteiras: [`docs/business-operations-architecture.md`](../../docs/business-operations-architecture.md).

## Subir local

```bash
# infra compartilhada (postgres) + este serviço
docker compose -f services/hweld-core-api/docker-compose.yml \
               -f services/hweld-operations-api/docker-compose.yml up -d

# ou sem docker (postgres local em :5432, db hweld)
cd services/hweld-operations-api
JWT_SECRET=dev-jwt-secret-hweld-32bytes-minimum!! ./mvnw spring-boot:run
```

Porta **8090**. Health: `GET /actuator/health` · OpenAPI: `GET /api-docs` ·
Swagger UI: `/swagger-ui.html`.

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `PORT` | `8090` | porta HTTP |
| `DB_HOST`/`DB_PORT`/`DB_NAME` | `localhost`/`5432`/`hweld_ops` | PostgreSQL (compose usa `hweld`, compartilhado) |
| `DB_USER`/`DB_PASSWORD` | `hweld`/`hweld` | credenciais |
| `DB_MAX_CONNECTIONS` | `10` | pool Hikari |
| `FLYWAY_ENABLED` | `true` | migrações no boot |
| `JWT_SECRET` | — **obrigatório** | segredo HS256 compartilhado com o core-api (≥32 bytes) |
| `INTERNAL_SERVICE_TOKEN` | `dev-internal-token` | `X-Service-Token` p/ `/api/v1/internal/**` — deve ser igual no core-api |
| `CORE_API_URL` | `http://localhost:8080` | base do core-api Rust |
| `CORE_API_TIMEOUT_MS` | `4000` | timeout das chamadas ao Rust |
| `MOTOR_URL` / `MOTOR_INGEST_TOKEN` | `http://localhost:4100` / vazio | fan-out realtime (Phoenix `/ingest`); sem token = desligado |
| `PAYMENT_PROVIDER` | `stub` | PSP padrão (`stub` = adapter de teste) |
| `PAYMENT_STUB_WEBHOOK_SECRET` | `dev-stub-webhook-secret` | segredo HMAC do webhook stub |
| `PAYMENT_STUB_ALLOW_UNSIGNED` | `false` | **dev only**: aceita webhook stub sem assinatura |
| `FISCAL_PROVIDER` / `FISCAL_AUTO_EMIT` / `FISCAL_AMBIENTE` | `auto`/`false`/`homologacao` | orquestração fiscal (`spedy` = adapter real, credenciais do cliente no painel) |
| `FISCAL_NFE_{NATUREZA_OPERACAO,CFOP,UNIDADE,ICMS_*,PIS_*,COFINS_*}` | — | defaults fiscais NF-e dos itens/nota |
| `FISCAL_RECONCILE_{INTERVAL,MIN_AGE,BATCH_SIZE}*` | `120s`/`60s`/`20` | reconciliador de docs não-terminais |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | allowlist CORS (dev) |
| `MINIO_*` | — | object storage dos XML/DANFE (vazio = noop dev) |
| `EMAIL_PROVIDER` | `log` | `log` (dev) ou `smtp` |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`/`SMTP_AUTH`/`SMTP_STARTTLS` | `localhost`/`1025`/… | SMTP transacional |
| `MAIL_FROM` / `MAIL_FROM_NAME` | `noreply@hweld.com.br`/`HWeld` | remetente |
| `SMS_PROVIDER` | `auto` | `auto` (Infobip com credenciais no banco, senão `log`), `log`, `infobip` |
| `APP_PUBLIC_URL` | — | base pública do serviço — compõe a URL do DLR `/api/v1/webhooks/infobip/sms/dlr/{segredo}` exibida no card de Integrações |
| `INTEGRATION_SECRETS_KEY` | derivada de `JWT_SECRET` | chave AES-256 dos segredos de integração no banco (hex-64/base64/texto) |
| `INFOBIP_TIMEOUT_MS` | `10000` | timeout das chamadas à API Infobip |
| `SMS_DLR_RECONCILE_AGE_MS` | `6h` | SENT sem DLR vira UNKNOWN (sem reenvio automático) |

Credenciais Infobip (Base URL, API key, remetente) são configuradas pelo
cliente no painel (**Administração → Integrações**), cifradas em
`integration_settings` — nunca por env. O segredo do webhook DLR é gerado
pelo servidor na primeira gravação e compõe o path público do callback.
| `OTEL_ENABLED` / `OTEL_EXPORTER_OTLP_ENDPOINT` | `false`/NR US | tracing OTLP |

## APIs (prefixo `/api/v1`)

| Endpoint | Auth | Descrição |
|---|---|---|
| `POST /payments` | JWT staff/portal | cria cobrança para um pedido (idempotente) |
| `GET /payments` · `GET /payments/{id}` · `GET /payments/{id}/transactions` | JWT | consulta + histórico |
| `POST /payments/{id}/cancel` · `/{id}/refund` | JWT staff | cancela/estorna |
| `POST /payments/{id}/reconcile` | JWT staff | reconcilia com o PSP |
| `POST /webhooks/{provider}` | assinatura HMAC | webhook do PSP (não é JWT) |
| `POST /billing/invoices` · `GET /billing/invoices` | JWT staff | faturas/recebíveis |
| `POST /fiscal-documents` · `GET /fiscal-documents` | JWT staff | emissão/consulta fiscal |
| `POST /fiscal-documents/{id}/{refresh,cancel,carta-correcao,webhook-resend}` | JWT staff | ciclo de vida no provedor |
| `GET /fiscal-documents/{id}/{historico,xml,pdf}` | JWT staff | timeline + artefatos |
| `POST/GET/DELETE /fiscal-documents/hooks` | JWT staff | gatilhos `/v2/hooks` do provedor |
| `POST /webhooks/fiscal/focus` | segredo no header | webhook Focus NFe (não é JWT) |
| `GET /notifications/deliveries` | JWT staff | histórico de envio de e-mail |
| `POST /internal/events` | `X-Service-Token` | inbound Rust→Java |

Exemplos:

```bash
# Cobrança PIX do pedido 42 (JWT do portal ou staff — posse validada no Rust)
curl -X POST localhost:8090/api/v1/payments \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"pedidoId":42,"method":"PIX","idempotencyKey":"pix-pedido-42"}'

# Webhook assinado (stub): X-Signature = "sha256=" + HMAC-SHA256(segredo, body)
curl -X POST "localhost:8090/api/v1/webhooks/stub" \
  -H "X-Signature: sha256=$SIG" -H "Content-Type: application/json" \
  -d '{"eventId":"evt-1","externalId":"stub_42_...","status":"CONFIRMED"}'

# Evento interno (simula Rust→Java)
curl -X POST localhost:8090/api/v1/internal/events \
  -H "X-Service-Token: dev-internal-token" -H "Content-Type: application/json" \
  -d '{"eventType":"OrderCreated","eventId":"<uuid>","payload":{"pedidoId":42}}'
```

## Eventos (envelope padrão)

`{eventId, eventType, eventVersion, aggregateId, correlationId, occurredAt, payload}`

**Publicados** (outbox → core-api `/api/v1/internal/eventos-financeiros` e/ou realtime):
`PaymentRequested`, `PaymentConfirmed`, `PaymentFailed`, `PaymentCancelled`,
`PaymentExpired`, `RefundCompleted`, `InvoiceIssued`, `InvoicePaid`,
`InvoiceOverdue`, `InvoiceCancelled`, `InvoiceAuthorized`, `InvoiceRejected`,
`FiscalDocumentCancelled`, `NotificationSent`, `NotificationFailed`.

**Consumidos** (`POST /internal/events` ou webhooks): `OrderCreated`,
`PaymentRequested` (dispara cobrança), eventos de PSP.

## Testes

```bash
./mvnw test      # unitários (sem Docker)
./mvnw verify    # + integração Testcontainers (requer Docker)
```

## Pendências explícitas

- PSP real (Mercado Pago/Asaas/Pagar.me): `StubPaymentProvider` implementa o
  contrato; produção exige adapter real + credenciais + homologação.
- Provedor fiscal: `SpedyProvider` implementa a API v1 da Spedy (NF-e:
  emissão, consulta, cancelamento, carta de correção, XML/DANFE). A
  `X-Api-Key` é do cliente — cifrada no banco e gerenciada pelo painel
  (Administração → Integrações → Spedy); emitente, certificado e série
  vivem no backoffice Spedy. Regras tributárias não são calculadas aqui
  (defaults via `hweld.fiscal.nfe.*`).
- E-mail real: configure `EMAIL_PROVIDER=smtp` + `SMTP_*`.
