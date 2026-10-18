# E2E de sistema — HWeld

Suíte ponta-a-ponta **entre serviços** do monorepo. Diferente das suítes
app-level (`apps/painel-admin/e2e`), aqui os testes cruzam fronteiras reais:
portal → core-api (Rust) → operations-api (Java) → realtime-engine (Elixir)
→ webhook PSP → outbox → de volta ao core-api.

```
tests/e2e/
├── api/                          # sem browser — contratos + fluxos cross-service
│   ├── 00-saude.spec.ts          # gate: os 3 serviços respondem /health
│   ├── auth.spec.ts              # login, RBAC, isolamento portal≠staff
│   ├── crm.spec.ts               # empresas/contatos/endereços + unicidade CNPJ
│   ├── catalogo.spec.ts          # estoque, catálogo portal, busca ES (opcional)
│   ├── jornada-pedido-pagamento.spec.ts  # ★ compra → PIX → webhook → pedido confirmado
│   ├── idempotencia.spec.ts      # Idempotency-Key + replay de webhook
│   └── realtime.spec.ts          # /ingest → PubSub → SSE
├── ui/                           # browser real (smoke — detalhe fica nas suítes dos apps)
│   ├── portal-smoke.spec.ts      # apps/web (Angular :4210)
│   └── admin-smoke.spec.ts       # apps/painel-admin (Vite :5173)
└── helpers/
    ├── env.ts                    # config resolvida + probes de disponibilidade
    ├── api.ts                    # REST client, tokens cacheados, pollAte
    ├── dados.ts                  # seed via API (empresa→portal→produto→estoque), CNPJ válido
    ├── webhook.ts                # webhook stub assinado (HMAC-SHA256) + /ingest
    └── sse.ts                    # leitor SSE via fetch streaming
```

## Rodando

```bash
cd tests/e2e
npm install
npm run install:browsers   # só para os specs ui/*

# stack mínima para o projeto `api`:
#   cd services/hweld-core-api && docker compose up -d && cargo run
#   cd services/hweld-operations-api && ./mvnw spring-boot:run
#   cd services/hweld-realtime-engine && mix phx.server   (opcional — specs skipam)
npm run test:api

# ui/* também precisa:
#   cd apps/web && npm start            (:4210)
#   cd apps/painel-admin && npm run dev (:5173)
npm run test:ui

npm test          # tudo
npm run report    # último relatório HTML
```

## Configuração

Copie `.env.e2e.example` → `.env.e2e`. Defaults apontam para dev local;
`ADMIN_*` e `MOTOR_INGEST_TOKEN` caem no `.env` do core-api quando ausentes.

## Convenções

- **Sem mocks**: tudo contra os serviços reais, como `smoke_test.py`.
- **Self-seeding**: cada spec cria seus dados via API staff (CNPJ/e-mail/SKU
  únicos por execução) — base compartilhada é segura, nada é apagado.
- **Skips honestos**: serviço fora do ar ou dependência opcional (ES,
  realtime) → `test.skip` com mensagem de como subir, não falso-verde.
- **Serial** (`workers: 1`): login é rate-limited (429) e os specs dividem
  a mesma base.
- **Assíncrono é poll**: confirmação de pagamento, transição do pedido via
  outbox e indexação ES usam `pollAte` — nunca `sleep` fixo.

## Limites conhecidos

- `webhook sem assinatura → 401` skipa se `PAYMENT_STUB_ALLOW_UNSIGNED=true`.
- Specs semeiam dados de verdade — não apontar para produção (ver
  `.env.e2e.example` para o aviso completo).
- O relay da outbox polla a cada ~2s: a jornada de pagamento pode levar
  ~10s após o webhook — é o sistema real, não lentidão do teste.
