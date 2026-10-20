# Integração fiscal — Focus NFe API v2

Orquestração de documentos fiscais eletrônicos (NF-e/NFS-e) via provedor
Focus NFe. O operations-api (Java) é dono da comunicação com o provedor;
o core-api (Rust) continua dono do registro de negócio (`notas_fiscais`);
o painel só conversa com endpoints internos.

## Fronteira arquitetural

```
painel-admin (React)
  │  JWT staff  POST /api/v1/fiscal-documents {pedidoId, docType, notaFiscalId?}
  ▼
hweld-operations-api (Java :8090)
  │  X-Service-Token  GET /internal/pedidos/{id}/dados-fiscais
  ▼
hweld-core-api (Rust :8080)          hweld-operations-api
  notas_fiscais ◄─ eventos internos ─ outbox relay
                  (InvoiceAuthorized / InvoiceRejected / FiscalDocumentCancelled)

hweld-operations-api ── HTTPS Basic(token:) ──► api.focusnfe.com.br /v2
                    ◄── webhooks ── /api/v1/webhooks/fiscal/focus
```

- **Nunca** o frontend fala com a Focus — nem URL, nem token.
- **Nunca** o Java lê o banco do core-api — os dados fiscais do pedido
  chegam por `GET /internal/pedidos/{id}/dados-fiscais` (service token).
- A `ref` da emissão é persistida **antes** do POST — timeout nunca é
  tratado como falha; a reconciliação consulta `GET /v2/nfe/{ref}`.

## Componentes

| Componente | Papel |
|---|---|
| `FocusNFeProperties` | Config `hweld.fiscal.focus.*` — ambientes isolados, guard de produção, emitente, defaults NF-e |
| `FocusNFeClient` | HTTP da API v2: Basic `Base64(token:)`, timeouts, erro tipado, retry só em GET |
| `FocusNFeException` | Erros oficiais `codigo`/`mensagem`/`erros[]` mapeados para tipos (validacao, autenticacao, nao_encontrado, rate_limit, provedor, transporte/inconclusivo) |
| `NFeMapper` | `DadosFiscaisPedido` → payload `NFeRequest` oficial; valida fail-fast antes do POST |
| `FocusNFeProvider` | Adapter `FiscalProvider`: emissão, consulta, cancelamento, carta de correção, reenvio de hook, download de XML/DANFE → `ObjectStorage` |
| `FiscalDataGateway`/`CoreApiFiscalDataGateway` | Dados fiscais autoritativos vindos do core-api |
| `FiscalService` | Máquina de estados, idempotência, outbox, artefatos, reconciliação |
| `FiscalWebhookService`/`FiscalWebhookDedupe` | Webhook autenticado + dedupe `(provider, event_key)` |
| `FiscalReconciliationWorker` | `@Scheduled` — consulta docs não-terminais pela `ref` |
| `FocusHooksService` | Admin de gatilhos `/v2/hooks` |
| `ServicoNotasFiscais.dados_emissao_pedido` (Rust) | Composição server-side do conjunto fiscal (pedido+itens+produto+empresa+endereço) |
| `ServicoIntegracao` (Rust) | Aplica `InvoiceAuthorized/Rejected/FiscalDocumentCancelled` em `notas_fiscais`, dedupe por `event_id` |

## Ambientes

| | Homologação | Produção |
|---|---|---|
| URL | `https://homologacao.focusnfe.com.br` | `https://api.focusnfe.com.br` |
| Seleção | `FOCUS_NFE_ENV=homologacao` | `FOCUS_NFE_ENV=producao` |
| Token | `FOCUS_NFE_HOMOLOGATION_TOKEN` | `FOCUS_NFE_PRODUCTION_TOKEN` |
| Guard extra | — | `FOCUS_NFE_PRODUCTION_ENABLED=true` |

Sem fallback entre ambientes. `token()` falha no boot da primeira chamada
se o ambiente ativo não tiver token; produção exige habilitação explícita
além do token. O ambiente efetivo é gravado em `fiscal_documents.environment`.

## Máquina de estados interna

`REQUESTED → PROCESSING → AUTHORIZED | REJECTED`, `AUTHORIZED →
CANCELLATION_PENDING → CANCELLED`, mais `REQUIRES_RECONCILIATION` e
`ERROR`. `provider_status` preserva o status bruto da Focus
(`processando_autorizacao`, `autorizado`, `cancelado`, `erro_autorizacao`).

- `REQUIRES_RECONCILIATION`: o POST teve resultado inconclusivo
  (timeout/5xx/transporte). Sai daí **somente** pela consulta por `ref` —
  nunca por reenvio cego. Se a ref não existir no provedor (404), o
  documento vai a `ERROR` e a emissão pode ser refeita com segurança.
- Transições gravam `fiscal_document_events` (histórico append-only).
- Estados terminais publicam no outbox: `InvoiceAuthorized`,
  `InvoiceRejected`, `FiscalDocumentCancelled` → core-api atualiza
  `notas_fiscais` (chave, protocolo, xml/pdf, motivo, status).

## Idempotência e unicidade

- `external_id` = `ref` = UUID do `fiscal_documents.id` (determinística).
- `UNIQUE (provider, environment, external_id)` — emissão duplicada do
  mesmo documento é impossível mesmo com retry de request.
- `requestEmission` retorna o documento existente quando o pedido já tem
  emissão em andamento/autorizada do mesmo `docType`.
- Webhooks: `fiscal_webhook_events` com `UNIQUE (provider, event_key)` —
  `event_key` derivada de `(docPath, ref, status)` + hash do payload
  (a Focus não garante event-id no payload documentado).

## Webhook

`POST /api/v1/webhooks/fiscal/focus` — público no security, autenticado
**dentro** do handler: header `X-Webhook-Token` (nome configurável via
`FOCUS_NFE_WEBHOOK_AUTH_HEADER`) deve bater com
`FOCUS_NFE_WEBHOOK_AUTH_TOKEN`. O mesmo segredo vai no parâmetro
`authorization` do `POST /v2/hooks` na Focus — ela o devolve no header
escolhido a cada notificação.

Fluxo: valida segredo → persiste dedupe em transação isolada
(`DataIntegrityViolationException` = duplicado → 200) → aplica status →
consulta `GET /v2/{doc}/{ref}` quando o payload traz só `ref` (a
notificação é um gatilho; o estado autoritativo vem da consulta).
Retries oficiais da Focus: 1min, 30min, 1h, 3h, 24h — a dedupe cobre
reenvios. Perda total de notificação é coberta pelo reconciliador.

## Endpoints internos

**operations-api (`:8090/api/v1`)** — JWT staff `ADMIN|FINANCEIRO`:

| Endpoint | Ação |
|---|---|
| `POST /fiscal-documents` | Solicita emissão `{pedidoId, docType, notaFiscalId?, dados?}` → 202 |
| `GET /fiscal-documents` · `/{id}` | Lista/consulta documentos |
| `POST /fiscal-documents/{id}/refresh` | Consulta o provedor e aplica |
| `POST /fiscal-documents/{id}/cancel` | Cancela `{motivo}` 15–255 chars |
| `POST /fiscal-documents/{id}/carta-correcao` | Carta de correção `{correcao}` 15–1000 chars |
| `POST /fiscal-documents/{id}/webhook-resend` | Pede reenvio das notificações da ref |
| `GET /fiscal-documents/{id}/historico` | Linha do tempo do documento |
| `GET /fiscal-documents/{id}/xml` · `/{id}/pdf` | Artefatos hospedados no object storage |
| `POST/GET/DELETE /fiscal-documents/hooks` | Admin dos gatilhos `/v2/hooks` |
| `POST /webhooks/fiscal/focus` | Notificação da Focus (segredo no header) |

**core-api (`:8080`)** — `X-Service-Token`:

| Endpoint | Ação |
|---|---|
| `GET /internal/pedidos/{id}/dados-fiscais[?nota_fiscal_id=]` | Conjunto fiscal autoritativo do pedido (itens com NCM/CFOP/unidade, empresa, endereço de faturamento) |
| `POST /internal/eventos-financeiros` | Inbound de eventos do operations-api (existente) |

## Variáveis de ambiente (operations-api)

| Variável | Default | Descrição |
|---|---|---|
| `FISCAL_PROVIDER` | `stub` | `focusnfe` ativa o adapter real |
| `FOCUS_NFE_ENV` | `homologacao` | Ambiente ativo (`homologacao`\|`producao`) |
| `FOCUS_NFE_HOMOLOGATION_URL` / `..._PRODUCTION_URL` | URLs oficiais | Override pontual (ex.: sandbox corporativo) |
| `FOCUS_NFE_HOMOLOGATION_TOKEN` / `..._PRODUCTION_TOKEN` | — | Tokens por ambiente (Basic username) |
| `FOCUS_NFE_PRODUCTION_ENABLED` | `false` | Guard de emissão real |
| `FOCUS_NFE_TIMEOUT_MS` / `..._DOWNLOAD_TIMEOUT_MS` | `30000`/`15000` | Timeouts |
| `FOCUS_NFE_WEBHOOK_AUTH_TOKEN` | — | Segredo do webhook (par `authorization` do hook) |
| `FOCUS_NFE_WEBHOOK_AUTH_HEADER` | `X-Webhook-Token` | Header que a Focus envia com o segredo |
| `FOCUS_NFE_WEBHOOK_URL` | — | URL pública do endpoint (registro do hook) |
| `FOCUS_NFE_EMITENTE_*` | — | CNPJ, razão social, IE, endereço, CRT do emitente |
| `FOCUS_NFE_NATUREZA_OPERACAO` / `..._CFOP` / `..._UNIDADE` | — | Defaults fiscais dos itens/nota |
| `FOCUS_NFE_ICMS_*` / `..._PIS_*` / `..._COFINS_*` | — | Situações tributárias por item |
| `FISCAL_RECONCILE_*` | `120000`/`30000`/`60000`/`20` | Agendamento do reconciliador |

**painel-admin**: `VITE_HW_OPS_API_URL` — `http://localhost:8090/api/v1`
(dev) / `/api/v1` (prod, o Worker roteia `fiscal-documents*` ao ops-api).

## Migrations

`V2__fiscal_focus.sql` (operations-api): colunas `environment`,
`provider_status`, `status_detail`, `numero`, `serie`, `last_sync_at`;
`CHECK` de status ampliado; `UNIQUE (provider, environment, external_id)`;
índice de reconciliação; tabelas `fiscal_document_events` e
`fiscal_webhook_events`.

## Homologação

1. `FISCAL_PROVIDER=focusnfe`, `FOCUS_NFE_ENV=homologacao`,
   `FOCUS_NFE_HOMOLOGATION_TOKEN=<token>`, `FOCUS_NFE_EMITENTE_*` e
   `FOCUS_NFE_NATUREZA_OPERACAO`/`FOCUS_NFE_CFOP`/`FOCUS_NFE_ICMS_*`/
   `FOCUS_NFE_PIS_*`/`FOCUS_NFE_COFINS_*` conforme a empresa.
2. Registrar o hook: `POST /api/v1/fiscal-documents/hooks`
   `{ "event": "nfe", "url": "https://<host>/api/v1/webhooks/fiscal/focus" }`
   (com `FOCUS_NFE_WEBHOOK_AUTH_TOKEN` configurado — vai como
   `authorization` no registro).
3. Emitir pelo painel (Notas fiscais → Emitir NF) ou
   `POST /fiscal-documents`. Acompanhar `GET .../{id}/historico`.

## Ativação em produção — checklist

- [ ] `FOCUS_NFE_ENV=producao` + `FOCUS_NFE_PRODUCTION_TOKEN` +
      `FOCUS_NFE_PRODUCTION_ENABLED=true` (as três, juntas)
- [ ] `FOCUS_NFE_EMITENTE_*` revisado pelo contador/fiscal
- [ ] Situações tributárias (`ICMS`/`PIS`/`COFINS`/`CFOP`) validadas —
      o sistema **não calcula tributos**; defaults errados geram rejeição
      ou nota incorreta
- [ ] `FOCUS_NFE_WEBHOOK_URL` público HTTPS + hook registrado (`GET .../hooks`)
- [ ] `FOCUS_NFE_WEBHOOK_AUTH_TOKEN` rotacionado e igual ao registrado
- [ ] `MINIO_*`/`S3` configurado (XML/DANFE são hospedados; sem storage
      eles ficam só como caminho remoto no payload do provedor)
- [ ] `INTERNAL_SERVICE_TOKEN` igual nos dois serviços; `JWT_SECRET` ≥32B
- [ ] `CORS_ALLOWED_ORIGINS` sem wildcard — produção é same-origin (Worker)
- [ ] Reconciliador ativo (logs `fiscal: reconciliação`) e alerta para
      docs `REQUIRES_RECONCILIATION`/`ERROR` antigos

## Falhas e limitações conhecidas

- **Timeout em POST**: doc vai a `REQUIRES_RECONCILIATION`; o reconciliador
  decide. Não há reenvio automático — por desenho.
- **NFS-e**: adapter implementa emissão/consulta/cancelamento (`/v2/nfse`),
  mas o mapper NFS-e (padrão nacional vs. municipal) ainda é mínimo —
  NF-e é o caminho suportado hoje.
- **NFC-e**: fora de escopo (contrato `DocType` não inclui).
- **Cálculo tributário**: fora de escopo — campos `icms_*`/`pis_*`/
  `cofins_*` vêm de config/`dados`, nunca são inventados.
- Rate limit oficial: 100 req/min/token → lote do reconciliador limitado
  por `FISCAL_RECONCILE_BATCH_SIZE`; 429 aborta o ciclo (retry no próximo).
- O webhook da Focus não traz event-id garantido → dedupe por chave
  derivada; payload completo fica persistido para auditoria.

## Troubleshooting

| Sintoma | Ação |
|---|---|
| `REQUIRES_RECONCILIATION` persistente | `POST .../{id}/refresh`; se 404 contínuo → ref nunca chegou, reemita |
| `401` da Focus | token do ambiente errado/expirado — revise `FOCUS_NFE_*_TOKEN` |
| Webhook 401 | segredo do header ≠ `FOCUS_NFE_WEBHOOK_AUTH_TOKEN` registrado no hook |
| Rejeição "dados fiscais inválidos" | falta NCM/CFOP/endereço — mensagem lista os campos |
| Artefato 404 no download | `MINIO_*` ausente — chaves `fiscal/{id}.{xml,pdf}` não existem |
