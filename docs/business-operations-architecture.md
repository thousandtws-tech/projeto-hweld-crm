# Business Operations — Arquitetura e Integração

Status: **proposto/implementado em fases** · Serviço: `services/hweld-operations-api` (Java 25 + Spring Boot 4.1)
Data: 2026-10-17

## 1. Contexto descoberto (Fase 1 — Discovery)

O prompt assumia `services/core-api` + `services/realtime-engine`; a realidade do monorepo:

| Componente | Stack | Responsabilidade atual |
|---|---|---|
| `services/hweld-core-api` | Rust, Actix-web, sqlx, PostgreSQL `hweld` | Todo o domínio: auth JWT HS256, CRM, catálogo, carrinho/checkout, pedidos, parcelas (`pagamentos` = contas a receber), caixa PDV, `notas_fiscais` (+`GatewayFiscal` **stub** SEFAZ), `notificacoes` (inbox do sino), auditoria, busca Elasticsearch |
| `services/hweld-realtime-engine` | Elixir/Phoenix 1.8 | Fan-out de eventos para as UIs: `POST /ingest` (Bearer `MOTOR_INGEST_TOKEN`) → PubSub → SSE `/events/staff`, `/events/portal` e WS `/socket`. **Efêmero (fire-and-forget), sem durabilidade — não é fila de trabalho** |
| `services/hweld-operations-api` | Java 25, Spring Boot 4.1.1 | **Skeleton vazio — é o lar deste serviço** (não se cria `services/business-operations` para não duplicar) |
| `apps/web` | Angular | Portal B2B (`apiUrl: localhost:8080/api/v1`, `realtimeUrl: localhost:4100`) |
| `apps/painel-admin` | React + Vite + TanStack | Backoffice staff, mesma API |

Não existem: RabbitMQ/Kafka, gateway/reverse proxy dedicado, CI pipelines, Redis.

### Sobreposições encontradas (importante)

- `pagamentos` (Rust) = **parcelas/contas a receber** de pedidos, com baixa manual via caixa — **não** são transações de gateway. Fica no Rust.
- `notas_fiscais` (Rust) = registro do documento fiscal; a emissão real depende do port `GatewayFiscal` hoje implementado como stub (`sefaz_stub.rs`, autoria explícita: "em produção, substituir por cliente NF-e").
- `notificacoes` (Rust) = inbox in-app (sino). E-mail transacional **não existe** — é gap que o módulo de Notificações do Java preenche.
- `configuracao_fiscal` (Rust) = credenciais SEFAZ (ambiente, CSC, certificado A1) — permanece no Rust; o módulo fiscal Java consome via referência/operação, nunca lê a tabela diretamente.

## 2. Decisão de fronteira (ownership de dados)

| Dado | Dono | Motivo |
|---|---|---|
| Pedidos, itens, carrinho, CRM, catálogo, estoque | **Rust** | Domínio principal já implementado |
| `pagamentos` (parcelas), caixas, `notas_fiscais` (registro), `notificacoes` (inbox) | **Rust** | Tabelas e use cases existentes — Java **nunca escreve** nelas |
| `payments`, `payment_transactions`, `payment_webhook_events` (transações PSP: PIX/cartão, webhooks, reconciliação) | **Java** | Gap: não existe integração com PSP |
| `billing_invoices` (cobranças/faturas a receber geradas de pedidos) | **Java** | Cobrança via PSP é nova responsabilidade |
| `fiscal_documents` (orquestração de emissão via provedor: Focus NFe/Nuvem Fiscal/etc.) | **Java** | `GatewayFiscal` do Rust é stub; Java assume a orquestração real e devolve o resultado por evento |
| `notification_templates`, `notification_deliveries` (e-mail transacional) | **Java** | Canal e-mail não existe hoje |
| `outbox_events`, `processed_events`, `audit_logs` | **Java** | Garantias transacionais internas do serviço |

**Regra inegociável:** nenhuma FK cruzada, nenhuma escrita na base `hweld` (Rust) a partir do Java.
Referências são identificadores (`pedido_id`, `empresa_id`, `nota_fiscal_id`) gravados como
colunas simples no schema do Java.

Banco: **PostgreSQL dedicado `hweld_ops`** no mesmo servidor Postgres do compose dev
(isolamento de ownership sem novo serviço de infra). Flyway no Java gerencia só esse banco;
as migrations sqlx do Rust ficam intocadas.

## 3. Autenticação e autorização

- JWT **HS256** com o mesmo `JWT_SECRET` do core-api (≥32 bytes, fail-fast). Claims:
  `sub` (id), `tipo` (`staff`|`portal`), `perfil` (`admin|vendedor|financeiro|estoque|tecnico`, só staff), `exp/iat/jti/sid`.
- RBAC no Java:
  - staff `admin`/`financeiro` → operações financeiras administrativas (cancelamentos, estornos, fiscal, billing, auditoria);
  - staff `vendedor` → consulta de pagamentos;
  - `portal` → criar pagamento/consultar **somente de pedidos próprios** — a posse é verificada
    **repassando o JWT ao core-api** (`GET /api/v1/portal/pedidos/{id}` responde 404/403 se não for do contato);
- Endpoints internos service-to-service: header `X-Service-Token` (comparação em tempo constante), nunca JWT de usuário;
- Webhooks de PSP: endpoint público **sem** JWT, autenticidade garantida por validação de assinatura HMAC do provedor + idempotência por `event_id`.

## 4. Comunicação Rust ↔ Java

Não há broker; a escolha é **REST síncrono + Transactional Outbox com relay HTTP** —
simples, compatível com a infra existente, e evolutiva (trocar o sink por RabbitMQ depois
é mudança de adapter, não de contrato).

### 4.1 Inbound (Rust → Java)

1. **REST autenticado por JWT de usuário** (principal): o frontend (portal ou painel) chama
   `POST /api/v1/payments` no Java com o Bearer do usuário. O Java repassa o JWT ao core-api
   para resolver o pedido (`portal` → `/api/v1/portal/pedidos/{id}`; `staff` → `/api/v1/pedidos/{id}`),
   obtendo `empresa_id`, `contato_id`, `total`, `status` **sem banco compartilhado e sem novo endpoint no Rust**.
2. `POST /api/v1/internal/events` (`X-Service-Token`) — canal de eventos assíncronos que o Rust
   pode adotar futuramente para `OrderCreated`/`PaymentRequested` server-to-server.

### 4.2 Outbound (Java → Rust / Java → UIs)

Todo evento de integração nasce na **outbox** na mesma transação da mutação, e um relay
(`@Scheduled`, backoff exponencial, `next_retry_at`, status→DLQ após N tentativas) despacha para:

- **core-api (state sync)** — `POST {CORE_API_URL}/api/v1/internal/eventos-financeiros`
  (`X-Service-Token`): `PaymentConfirmed` → baixa da parcela/status do pedido; `RefundCompleted` → estorno.
  Endpoint **aditivo** no Rust (ver §7).
- **realtime-engine (UI fan-out)** — `POST {MOTOR_URL}/ingest` (Bearer `MOTOR_INGEST_TOKEN`),
  mesmo envelope do Rust: `{tipo, audiencia:{escopo,empresa_id?}, dados}`.
  Tipos emitidos: `pagamento.confirmado`, `pagamento.falhou`, `pagamento.estornado`,
  `fatura.emitida`, `nf.autorizada`, `nf.rejeitada`.

### 4.3 Envelope de evento de integração (padrão)

```json
{
  "eventId": "uuid",
  "eventType": "PaymentConfirmed",
  "eventVersion": 1,
  "aggregateId": "uuid-do-payment",
  "correlationId": "uuid",
  "occurredAt": "ISO-8601",
  "payload": { "...": "específico do evento" }
}
```

| Evento | Produtor | Consumidor | Transporte |
|---|---|---|---|
| `OrderCreated` | Rust (futuro) | Java `internal/events` | REST service-token |
| `PaymentRequested` | Java | Java (self/on-write) | outbox |
| `PaymentConfirmed` | Java | Rust `internal/eventos-financeiros` + realtime | outbox → HTTP |
| `PaymentFailed` | Java | Rust + realtime | outbox → HTTP |
| `RefundCompleted` | Java | Rust + realtime | outbox → HTTP |
| `InvoiceIssued`/`InvoiceOverdue` | Java | realtime | outbox → HTTP |
| `InvoiceAuthorized`/`InvoiceRejected` (fiscal) | Java | Rust + realtime | outbox → HTTP |
| `NotificationRequested`/`NotificationSent`/`NotificationFailed` | Java | realtime/audit | outbox → HTTP |

Idempotência de ponta a ponta: `processed_events(event_id, processor)` no inbound;
`outbox_events` + `X-Event-Id`/`eventId` no outbound; unique `(provider, external_event_id)` em webhooks.

## 5. Fluxo operacional (pagamento PIX — caminho feliz)

```
Portal/Painel            Java ops-api                    Rust core-api            PSP (stub hoje)
     │  POST /payments        │                              │                        │
     │  (JWT usuário)         │  GET pedido (JWT repassado)  │                        │
     │───────────────────────▶│─────────────────────────────▶│                        │
     │                        │◀── pedido (total, empresa) ──│                        │
     │                        │── createCharge(idempotente) ─────────────────────────▶│
     │◀── 201 {pixQr, pixCopiaCola, expiresAt} ──│            │                        │
     │                        │  outbox: PaymentRequested    │                        │
     │                        │                              │   webhook confirmado   │
     │                        │◀───────────────────────────────────────────────────────│
     │                        │ valida assinatura + dedupe + payment_transaction       │
     │                        │  outbox: PaymentConfirmed    │                        │
     │                        │── relay ────────────────────▶│ baixa parcela/pedido   │
     │                        │── relay → realtime /ingest ──┼──▶ UIs atualizam live   │
     │                        │── (se fiscal on) FiscalProvider.emitir ───────────────▶│
     │                        │── NotificationRequested → e-mail confirmação           │
```

Um pedido **nunca** é considerado pago por retorno do navegador — apenas por webhook
assinado e idempotente (ou confirmação explícita do PSP consultada pelo Java).

## 6. Modelo de dados Java (Flyway, banco `hweld_ops`)

`payments`, `payment_transactions`, `payment_webhook_events`, `billing_invoices`,
`fiscal_documents`, `notification_templates`, `notification_deliveries`,
`outbox_events`, `processed_events`, `audit_logs` — DDL completo em
`src/main/resources/db/migration/V1__baseline.sql`.

Convenções herdadas do repo: dinheiro `NUMERIC(14,2)` + coluna `currency CHAR(3)` (`BRL`),
`TIMESTAMPTZ`, enums como `TEXT + CHECK`, ids internos `UUID` (melhor p/ chaves de
idempotência e exposição externa), refs ao Rust como `BIGINT`/`TEXT` sem FK.

Política monetária: `BigDecimal` scale 2, `RoundingMode.HALF_EVEN` (`shared.domain.Money`),
nunca `float`/`double`.

## 7. Mudança aditiva no Rust (única) — implementada

`POST /api/v1/internal/eventos-financeiros` no `hweld-core-api`
(`handlers/interno.rs` + `use_cases/integracao.rs` + `persistence/integracao.rs`
+ migration `0016_integracao.sql`):

- auth: `X-Service-Token` == `INTERNAL_SERVICE_TOKEN` (env, comparação em tempo
  constante no extrator `AuthServico`); sem o env o endpoint responde 503 —
  nunca aberto anonimamente;
- deduplicação por `event_id` (PK + `ON CONFLICT DO NOTHING`) na tabela
  `eventos_integracao` — entrega at-least-once vira processamento exatamente-uma-vez;
- `PaymentConfirmed` → pedido `aguardando_pagamento → confirmado` via
  `ServicoPedidos::transicionar` (reserva estoque, audita, notifica contato e
  realtime). Pedido fora desse status → `202 ignorado` (não prende a outbox);
- `PaymentFailed` → notifica a empresa; `PaymentCancelled`/`PaymentExpired`/
  `RefundCompleted`/`Invoice*` → notificam o staff no sino;
- tipos desconhecidos → `202 ignorado` (forward-compatible);
- conflitos de estado **não** retornam 4xx/5xx — evitam retry infinito da outbox.

Decisão deliberada: **não** baixamos parcela nem mexemos em caixa via evento —
baixa exige `forma_pagamento_id` e caixa aberto, e continua decisão do
financeiro (`ServicoPagamentos::baixar`/`estornar` existentes). Se um fluxo
"baixa automática por PSP" for desejado, é uma regra nova a ser aprovada —
não um detalhe de integração.

Nenhuma rota/tabela/contrato existente é alterado. Rust→Java via REST já funciona
sem mudança no Rust (o chamador é o frontend com JWT do usuário — ver §4.1).

## 8. Segurança

- Secrets só por env (`JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `MOTOR_INGEST_TOKEN`,
  `PAYMENT_*_WEBHOOK_SECRET`, `SMTP_*`, credenciais de PSP/fiscal). Nada hardcoded;
- Nenhum dado de cartão/CVV é recebido ou persistido (cartão sempre via checkout/tokenização do PSP);
- Logs estruturados (JSON via logstash-encoder), `correlationId` propagado
  (`X-Correlation-Id` header ↔ outbox ↔ logs); dados financeiros sensíveis mascarados;
- Auditoria de toda mutação financeira em `audit_logs` (ator, ação, entidade, antes/depois);
- Timeouts explícitos em todo cliente HTTP, retry com backoff+jitter, circuit breaker
  (Resilience4j) nos adapters de PSP/fiscal/e-mail/core-api;
- Rate limit e brute-force continuam no core-api (auth central); o Java confia no JWT.

## 9. Stack efetiva (justificada)

Spring Boot 4.1.1 (já no skeleton) + `webmvc`, `security`, `oauth2-resource-server`,
`data-jpa`, `flyway` (+`flyway-database-postgresql`), `validation`, `actuator`,
`micrometer-tracing-bridge-otel` + `opentelemetry-exporter-otlp` (OTLP alinhado ao
New Relic usado pelo Rust), `logstash-logback-encoder` (JSON), `resilience4j`
(core — instanciado programaticamente, sem depender de autoconfigure para Boot 4),
`springdoc-openapi` (spec + UI), Testcontainers/PostgreSQL, JUnit5/Mockito, RestClient.

**Rejeitados:** RabbitMQ/Kafka (sem infra existente; outbox+relay cobre o volume atual e o
contrato evolui depois), banco compartilhado `hweld` (viola ownership), OAuth2 issuer
externo (o sistema já usa JWT HS256 próprio — Resource Server valida o mesmo segredo).

## 10. Pendências explícitas (não implementadas / dependem de credenciais)

- PSP real (Mercado Pago/Asaas/Pagar.me): adapter `StubPaymentProvider` implementa o
  contrato `PaymentProvider` e aceita webhooks HMAC — produção exige credenciais + adapter real;
- Provedor fiscal real: `StubFiscalProvider` autoriza em memória; emissão real depende de
  credencial/homologação municipal/estadual (regras tributárias **não** foram inventadas);
- SMTP: `EmailProvider` default loga (dev); SMTP real via `SMTP_*` envs;
- Rust: consumo server-side de `PaymentConfirmed` depende do endpoint aditivo do §7 (incluído nesta entrega).

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Evento Java→Rust perdido | outbox persistente + retry + status `dead` p/ intervenção; Rust pode reconciliar por consulta |
| JWT HS256 compartilhado é acoplamento | documentado; migração p/ issuer OIDC é decisão de produto futura |
| Dupla verdade fiscal (notas_fiscais vs fiscal_documents) | Java = orquestração/protocolo; Rust = registro de negócio atualizado por evento — fonte de verdade fiscal continua no Rust |
| Sem broker = perda em janela de indisponibilidade | relay com persistência cobre; se throughput exigir, evoluir p/ RabbitMQ só mudando o sink |
