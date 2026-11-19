# Integração — Mercado Pago (pagamentos)

Adapter do port universal `PaymentProvider` para o Mercado Pago. Mesmo
padrão do `PagBankProvider`: credenciais do cliente cifradas em
`integration_settings`, `PAYMENT_PROVIDER=auto` resolve o PSP credenciado,
nenhuma regra HWeld dentro do adapter.

## Escopo entregue

| Capacidade | Endpoint oficial | Estado |
|---|---|---|
| Pix (QR copia-e-cola + base64) | `POST /v1/payments` (`payment_method_id=pix`) | implementado |
| Cartão — Checkout Pro (hospedado) | `POST /checkout/preferences` → `init_point`/`sandbox_init_point` | implementado |
| Consulta/reconciliação | `GET /v1/payments/{id}` · `GET /checkout/preferences/{id}` | implementado |
| Cancelamento | `PUT /v1/payments/{id}` `{status:"cancelled"}` | implementado |
| Estorno total/parcial | `POST /v1/payments/{id}/refunds` (`amount` em **reais**) | implementado |
| Webhook HMAC-SHA256 | `x-signature` + `x-request-id` (manifest oficial) | implementado |
| Teste de conexão | `GET /users/me` | implementado |
| Boleto (`ticket`) | exige `payer.first_name/last_name/identification/address` | fase seguinte — erro tipado |
| Cartão transparente (Bricks) | `card_token` — coleta PCI no frontend | fase seguinte — erro tipado |
| Assinaturas, Point, OAuth, chargebacks | — | fora do escopo |

## Autenticação

`Authorization: Bearer {access_token}` — token gerado pelo cliente no
painel Mercado Pago Developers → Suas integrações → Credenciais.
`api_key_enc` cifrado, resolvido por chamada (trocar o token não exige
reinício). Uma única base `https://api.mercadopago.com`: teste/produção
separam-se pelo prefixo do token (`TEST-` × `APP_USR-`) e por
`config.ambiente` (`teste`|`producao`) — que também escolhe
`sandbox_init_point` × `init_point` no checkout.

**Idempotência**: escritas enviam `X-Idempotency-Key` (obrigatório no MP)
com a chave lógica da operação (`req.idempotencyKey`; estornos usam
`refund-{paymentId}-total|parcial`). Falha de transporte em escrita =
`MercadoPagoException.Kind.INCONCLUSIVE` — nunca reenviar sem reconciliar.

## Webhook — assinatura oficial

`POST /api/v1/webhooks/mercadopago` — público; a autenticidade é a
assinatura, não JWT.

1. `x-signature` → extrai `ts` e `v1`; `x-request-id` separado.
2. `data.id` do payload (id do recurso, não o notification id).
3. Manifest: `id:{data.id em minúsculo};request-id:{x-request-id};ts:{ts};`
   — pares vazios são omitidos.
4. `HMAC-SHA256(manifest, segredo)` — segredo gerado no painel MP
   (Suas integrações → Webhooks → Assinatura), cifrado em
   `webhook_secret_enc`.
5. Comparação em tempo constante; `ts` tolerância **±300s** (anti-replay).
6. Sem segredo configurado → **rejeita tudo** (fail-closed).

O payload é apenas sinal: `type=payment` dispara `GET /v1/payments/{data.id}`
e o status REAL é aplicado — `external_reference` (= idempotency key)
resolve a correlação preference→payment. `type!=payment` (merchant_order
etc.) vira evento de registro que cai em `IGNORED` pelo lookup. Dedupe:
`notif-{id}` (notification id oficial), fallback `{data.id}|{status}`.

### Mapeamento de status

`pending`→PENDING · `authorized`/`in_process`/`in_mediation`→PROCESSING
(authorized **não** é capturado) · `approved`→CONFIRMED · `rejected`→FAILED
· `cancelled`→CANCELLED (`status_detail=expired`→EXPIRED) ·
`refunded`→REFUNDED · `charged_back`→FAILED.

### Correlação preference→payment

Checkout Pro cria a preferência com id `123-abc…`; ao pagar, o MP gera um
**payment numérico novo**. O `external_reference` da preferência propaga
para o payment → `WebhookService` cai no fallback `findByIdempotencyKey` e
`Payment.relinkExternalId` migra o `external_id` no primeiro evento —
cancel/estorno/reconciliação passam a operar no pagamento real.
`cancelCharge`/`refundCharge` em id não-numérico (preferência) = conflito
tipado; a preferência expira sozinha (`expires` + `expiration_date_to`).

## Payloads (contratos confirmados)

**Pix** — `POST /v1/payments`:
```json
{
  "transaction_amount": 199.90,
  "description": "Pedido 42",
  "payment_method_id": "pix",
  "payer": {"email": "cli@x.com"},
  "external_reference": "<idempotencyKey>",
  "notification_url": "<APP_PUBLIC_URL>/api/v1/webhooks/mercadopago",
  "date_of_expiration": "<now + PAYMENT_PIX_EXPIRATION_MINUTES (30)>"
}
```
Resposta: `id` (numérico), `point_of_interaction.transaction_data`
→ `qr_code` (copia-e-cola), `qr_code_base64`, `ticket_url`.

**Cartão** — `POST /checkout/preferences`: `items[{id,title,quantity:1,
unit_price,currency_id:BRL}]`, `external_reference`, `notification_url`,
`expires:true` + `expiration_date_to`, `payment_methods` (exclui
`ticket/bank_transfer/atm/debit_card/account_money`, `installments` =
`config.parcelas_max`, padrão 12, clamp 1–24), `payer.email` opcional,
`back_urls` opcional via `metadata.returnUrl`.

## Configuração do cliente (painel)

Integrações → Mercado Pago → Configurações:

| Campo | Onde gerar |
|---|---|
| Ambiente | `teste` (token `TEST-`) ou `producao` (`APP_USR-`) — **tokens diferentes por ambiente** |
| Access Token | MP Developers → Suas integrações → Credenciais → Access Token |
| Segredo do webhook | Suas integrações → Webhooks → cadastrar a URL exibida no painel → Assinatura |
| Parcelas máx. | `installments` do Checkout Pro (1–24, padrão 12) |

"Testar conexão" = `GET /users/me` → resolve id + nickname da conta
(`external_id`/`nome_conta`). Aviso: sem segredo configurado os webhooks
são todos rejeitados — configure junto com a URL no painel MP.

`PAYMENT_PROVIDER=auto`: prioridade determinística PagBank → Mercado Pago
→ stub (ambos credenciados → PagBank atende). `PAYMENT_PROVIDER=mercadopago`
fixa o MP.

## Homologação sugerida (sandbox)

1. Conta de teste MP + token `TEST-` no painel → "Testar conexão" OK.
2. Pix: criar cobrança → `qr_code`/`qr_code_base64` na resposta; pagar
   com o app MP do comprador de teste → webhook `approved` → CONFIRMED.
3. Cartão: criar cobrança → `sandbox_init_point` abre o checkout →
   cartão de teste MP → webhook → relink preference→payment → CONFIRMED.
4. Estorno parcial → `refunded`; cancelamento de Pix pendente → `cancelled`.
5. Webhook forjado (v1 inválido / ts velho) → 401.

## Não-homologado

Tudo implementado contra a documentação oficial, mas **nenhuma chamada
real foi executada** contra contas MP ainda — a homologação depende das
credenciais do cliente.
