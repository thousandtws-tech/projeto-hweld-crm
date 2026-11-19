# Integração PagBank — pagamentos (Pix)

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

## Escopo — fase A

| Recurso | Contrato oficial | Estado |
|---|---|---|
| Cobrança Pix (QR + copia-e-cola) | `POST /orders` `charges[].payment_method.type=PIX` + `pix.expiration_date` | ✅ |
| Reconciliação | `GET /charges/{id}` | ✅ |
| Cancelamento / estorno | `POST /charges/{id}/cancel` (sem `amount` = total; com `amount.value` em centavos = parcial) | ✅ |
| Webhook Orders API | `notification_urls` no pedido → payload = objeto Order completo | ✅ |
| Teste de conexão | `GET /public-keys` | ✅ |
| Cartão (tokenização/3DS) | `payment_method.card` cifrado com public-key | fase B |
| Boleto | `payment_method.type=BOLETO` + `holder` (tax_id/endereço) | fase B |
| Checkout hospedado, recorrência, Connect/split | APIs separadas | fase B |

## Status mapping

| PagBank `charges[].status` | Interno `PaymentStatus` |
|---|---|
| `WAITING` | `PENDING` |
| `IN_ANALYSIS`, `AUTHORIZED` | `PROCESSING` |
| `PAID` | `CONFIRMED` |
| `DECLINED` | `FAILED` |
| `CANCELED` | `CANCELLED` |
| desconhecido | `PENDING` (nunca retrocede) |

## Webhook — autenticidade por fetch-back

O PagBank **não assina** notificações. O mecanismo oficial é confirmar a
transação consultando a API — `verifyWebhookSignature` implementa isso:

1. Extrai `id` (ORDE_*) e `charges[0].id` (CHAR_*) do corpo.
2. `GET /charges/{id}` com o token da conta.
3. Aceita **somente** se `metadata.ps_order_id` == order do corpo **e**
   `status` real == status alegado.

Corpo forjado (status inventado com ids reais) → 401. Charge inexistente ou
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
- Nenhum PAN/CVV — cartão entra só na fase B via tokenização do PSP.
- Webhook é endpoint público autenticado por fetch-back; payload persistido
  em `payment_webhook_events.payload` (auditoria).
- `payment` audit: `integracao.pagbank.{salvar,habilitacao,testar_conexao}`.

## Variáveis de ambiente

| Var | Default | Uso |
|---|---|---|
| `PAYMENT_PROVIDER` | `auto` | `auto`=PSP credenciado→stub; `stub`; `pagbank` |
| `PAGBANK_TIMEOUT_MS` | `10000` | timeout do client PagBank |
| `PAYMENT_PIX_EXPIRATION_MINUTES` | `30` | validade do QR Pix |
| `APP_PUBLIC_URL` | — | base do `notification_urls` (obrigatória p/ webhook) |

## Homologação

1. Criar conta sandbox PagBank → Portal do Desenvolvedor → copiar token.
2. Painel → Integrações → PagBank: ambiente **Sandbox** + token → Salvar →
   **Testar conexão** → ligar **Cobranças habilitadas**.
3. Criar cobrança Pix por pedido (Financeiro → Pagamentos ou fluxo da loja).
4. Pagar no simulador sandbox → webhook `PAID` → status `CONFIRMED` +
   `payment.confirmed` na outbox → baixa no pedido.
5. Sem token sandbox real: `PAYMENT_PROVIDER=stub` mantém o fluxo local.
