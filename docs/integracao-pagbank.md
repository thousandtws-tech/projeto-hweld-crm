# Integração PagBank — pagamentos (Pix + Cartão)

Adapter da Orders API PagBank no módulo `payment` do operations-api — o
**cliente** cadastra o próprio token no painel (nunca via variável de
ambiente), cifrado em AES-256-GCM na `integration_settings`
(`pagbank-pagamentos`).

## Arquitetura

- Port universal existente: `PaymentProvider` (`createCharge`/`getCharge`/
  `cancelCharge`/`refundCharge`/`verifyWebhookSignature`/`parseWebhook`).
- `PagBankProvider` — adapter em `payment/infrastructure/pagbank/`.
- `PagBankClient` — `RestClient` por chamada; Bearer token decifrado a cada
  request (troca de token no painel não exige restart).
- `ProviderRegistry.defaultProvider()`: `PAYMENT_PROVIDER=auto` resolve para
  o PSP real **credenciado** (PagBank) ou, sem credenciais, para o `stub`.
- Dinheiro sempre vem do pedido no core-api (`PaymentService`) — a UI nunca
  envia valor nem confirma pagamento.

## Credenciais (cliente-gerenciadas)

Painel → **Integrações → PagBank → Configurações**:

- **Ambiente**: `Sandbox` → `https://sandbox.api.pagseguro.com` |
  `Produção` → `https://api.pagseguro.com`.
- **Token Bearer** (write-only, `api_key_enc`):
  - Produção: PagBank → Vendas → Integrações → **Gerar Token**.
  - Sandbox: Portal do Desenvolvedor → aba **Tokens**.
- **Pausar cobranças** (`envio_pausado`): bloqueia novas cobranças; webhooks,
  consultas, cancelamentos e estornos seguem ativos.
- **Cobranças habilitadas** (`enabled`): switch separado do salvar —
  habilitar cobrança de verdade é um ato explícito.

**Testar conexão** faz `GET /public-keys` — leitura autenticada segura que
prova token + ambiente sem efeito colateral (a Orders API não expõe "me").

## Escopo

| Recurso | Contrato oficial | Estado |
|---|---|---|
| Cobrança Pix (QR + copia-e-cola) | `POST /orders` `charges[].payment_method.type=PIX` + `pix.expiration_date` | ✅ |
| Cartão — link de pagamento hospedado | `POST /checkouts` `payment_methods=[CREDIT_CARD]` → `links[rel=PAY]` em `checkoutUrl` | ✅ |
| Parcelamento do checkout | `payment_methods_configs.config_options` — `INSTALLMENTS_LIMIT` (`config.parcelas_max`, padrão 12) e `INTEREST_FREE_INSTALLMENTS` (`config.parcelas_sem_juros`, padrão 0 = juros do comprador) | ✅ |
| Reconciliação | `GET /charges/{id}` (CHAR_*) · `GET /checkouts/{id}` (CHEC_*) | ✅ |
| Cancelamento / estorno | `POST /charges/{id}/cancel` (sem `amount` = total; com `amount.value` em centavos = parcial) · checkout não pago → `POST /checkouts/{id}/inactivate` | ✅ |
| Webhook Orders API | `notification_urls` no pedido → payload = objeto Order completo | ✅ |
| Webhook Checkout API | `notification_urls` (eventos do checkout: EXPIRED/INACTIVE) + `payment_notification_urls` (transacional) — ambos na mesma rota | ✅ |
| Teste de conexão | `GET /public-keys` | ✅ |
| Boleto | `payment_method.type=BOLETO` + `holder` (tax_id/endereço) | fase seguinte |
| Cartão transparente (tokenização/3DS), recorrência, Connect/split | APIs/dedicadas | fase seguinte |

### Cartão — fluxo e correlação

1. `createCharge(CREDIT_CARD)` → `POST /checkouts` com `reference_id` =
   **idempotency key** do payment. Resposta `id` CHEC_* vira `external_id`;
   `links[rel=PAY]` vira `checkout_url` (expiração = mesma regra do Pix:
   `PAYMENT_PIX_EXPIRATION_MINUTES`).
2. Cliente paga na página PagBank (cartão/débito/Pix — PAN/CVV **nunca**
   trafegam por nós). `customer_modifiable=true` → PagBank coleta nome/tax_id.
3. O PagBank gera uma Order + Charge **com ids novos** (CHAR_*). O webhook
   transacional chega com `reference_id` = idempotency key → fallback
   `findByIdempotencyKey` no `WebhookService` reencontra o payment →
   `Payment.relinkExternalId` migra `external_id` CHEC→CHAR — daí cancel/
   estorno/reconciliação operam na cobrança real.
4. Reconciliação sem webhook: `GET /checkouts/{id}` com status `PAID`
   também confirma (rede de segurança se a correlação falhar).
5. Eventos do próprio checkout (`EXPIRED`/`INACTIVE`) chegam como payload
   CHEC_* — `id` casa direto com `external_id` (sem fallback).
6. `metadata.returnUrl` opcional no `ChargeRequest` → `redirect_url` do
   checkout (retorno do cliente pós-pagamento).

## Status mapping

| PagBank `charges[].status` | Interno `PaymentStatus` |
|---|---|
| `WAITING` | `PENDING` |
| `IN_ANALYSIS`, `AUTHORIZED` | `PROCESSING` |
| `PAID` | `CONFIRMED` |
| `DECLINED` | `FAILED` |
| `CANCELED` | `CANCELLED` |
| desconhecido | `PENDING` (nunca retrocede) |

| Checkout `status` | Interno |
|---|---|
| `ACTIVE` | `PENDING` |
| `PAID` | `CONFIRMED` |
| `INACTIVE` | `CANCELLED` |
| `EXPIRED` | `EXPIRED` |

## Webhook — autenticidade por fetch-back

O PagBank **não assina** notificações. O mecanismo oficial é confirmar a
transação consultando a API — `verifyWebhookSignature` implementa isso
para **os dois formatos** de payload:

1. `id` ORDE_* (transacional): `GET /charges/{charges[0].id}` — aceita só se
   `metadata.ps_order_id` == order do corpo **e** `status` real == alegado.
2. `id` CHEC_* (evento do checkout): `GET /checkouts/{id}` — aceita só se
   `status` real == alegado.

Corpo forjado (status inventado com ids reais) → 401. Recurso inexistente ou
API fora → 401 (PagBank reenvia). A confirmação nunca depende de retorno de
navegador/checkout.

**Dedupe**: sem event-id oficial → chave `orderId|chargeId|status` em
`payment_webhook_events (provider,event_id)` — reenvio do mesmo estado =
`duplicado`; cada transição tem chave própria.

**notification_urls**: enviada por pedido na criação =
`{APP_PUBLIC_URL}/api/v1/webhooks/pagbank`. Sem `APP_PUBLIC_URL` a cobrança
é criada sem notificação (confirmação só por reconciliação — aviso no painel).

## Erros tipados (`PagBankException.Kind`)

`VALIDATION`(4xx) · `AUTH`(401/403) · `NOT_FOUND` · `RATE_LIMIT`(429) ·
`PROVIDER`(5xx) · `TRANSPORT`(leitura, retriável) · `INCONCLUSIVE`(escrita —
nunca reenviar sem reconciliar; o PagBank pode ter recebido).

## Segurança

- Token só cifrado (`api_key_enc`); a view devolve apenas `token: true|false`.
- Nenhum PAN/CVV trafega — cartão só via página hospedada do PagBank
  (checkout); tokenização transparente fica para fase posterior com 3DS.
- Webhook é endpoint público autenticado por fetch-back; payload persistido
  em `payment_webhook_events.payload` (auditoria).
- `payment` audit: `integracao.pagbank.{salvar,habilitacao,testar_conexao}`.

## Variáveis de ambiente

| Var | Default | Uso |
|---|---|---|
| `PAYMENT_PROVIDER` | `auto` | `auto`=PSP credenciado→stub; `stub`; `pagbank` |
| `PAGBANK_TIMEOUT_MS` | `10000` | timeout do client PagBank |
| `PAYMENT_PIX_EXPIRATION_MINUTES` | `30` | validade do QR Pix e do link de checkout |
| `APP_PUBLIC_URL` | — | base do `notification_urls` (obrigatória p/ webhook) |

## Homologação

1. Criar conta sandbox PagBank → Portal do Desenvolvedor → copiar token.
2. Painel → Integrações → PagBank: ambiente **Sandbox** + token → Salvar →
   **Testar conexão** → ligar **Cobranças habilitadas**.
3. Criar cobrança Pix por pedido (Financeiro → Pagamentos ou fluxo da loja).
4. Pagar no simulador sandbox → webhook `PAID` → status `CONFIRMED` +
   `payment.confirmed` na outbox → baixa no pedido.
5. Sem token sandbox real: `PAYMENT_PROVIDER=stub` mantém o fluxo local.
