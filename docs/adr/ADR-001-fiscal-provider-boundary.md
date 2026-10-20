# ADR-001 — Orquestração fiscal no operations-api, registro de negócio no core-api

- Status: aceito
- Data: 2026-02-09 (retificada com a integração Focus NFe)

## Contexto

A emissão de NF-e/NFS-e exige um provedor externo (Focus NFe API v2). O
monorepo já dividia responsabilidades: `hweld-core-api` (Rust) guarda o
domínio (pedidos, `notas_fiscais`, empresas); `hweld-operations-api`
(Java) já mantinha `fiscal_documents`, o port `FiscalProvider` e a
infra de outbox/webhooks/object-storage para integrações externas.

## Decisão

- **Java orquestra o provedor**: `FocusNFeProvider` implementa
  `FiscalProvider`; `FiscalService` detém a máquina de estados,
  idempotência por `ref`, reconciliação e artefatos.
- **Rust compõe os dados fiscais**: endpoint interno
  `GET /internal/pedidos/{id}/dados-fiscais` (X-Service-Token) monta o
  conjunto autoritativo — o Java nunca aceita payload fiscal do frontend
  nem lê o banco do core.
- **Resultados voltam por eventos**: `InvoiceAuthorized`,
  `InvoiceRejected`, `FiscalDocumentCancelled` via outbox →
  `POST /internal/eventos-financeiros` → `ServicoIntegracao` aplica em
  `notas_fiscais` com dedupe por `event_id`.
- **Segredos só no Java**: token Focus, segredo de webhook e credenciais
  de storage vivem exclusivamente no operations-api.
- **Guard de produção em dupla chave**: `FOCUS_NFE_ENV=producao` +
  `FOCUS_NFE_PRODUCTION_ENABLED=true` + token de produção.
- **Timeout de POST ≠ falha**: emissão inconclusiva vai a
  `REQUIRES_RECONCILIATION` e resolve por `GET /v2/{doc}/{ref}`.

## Consequências

- Frontend fica livre de conceitos de provedor — só `fiscal-documents`.
- A Focus pode ser trocada por outro PSP fiscal implementando o port sem
  tocar core-api nem frontend.
- Consistência eventual: `notas_fiscais` reflete o provedor com o
  atraso do ciclo outbox→relay (segundos), não em tempo real.
- NF-e é o caminho coberto pelo `NFeMapper`; NFS-e usa o mesmo provider
  com payload mínimo — particularidades municipais ficam para iteração
  futura dentro do mesmo contrato.
