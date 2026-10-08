# Arquitetura — HWeld `cliente-web` + `painel-administrativo`

> Diferença deste projeto vs. replica-architect padrão: **o backend já existe**
> (Rust/Actix + Postgres + Elasticsearch, 94 rotas, 9 migrations). Então aqui
> não se desenha schema nem API do zero — a arquitetura é dos **dois apps
> Angular 22** sobre o contrato real, mais os gaps que o backend precisa cobrir.

## 1. Stack

| Camada | Escolha | Por quê |
| --- | --- | --- |
| Apps | **Angular 22** × 2 (`cliente-web`, `painel-administrativo`) | Definido pelo usuário; dois contextos de auth separados → dois bundles |
| Estilo de código | Standalone components + Signals + `inject()` | Sem NgModules; estado reativo nativo |
| Rotas | Lazy `loadChildren`/`loadComponent` por feature | Admin é bundle grande; portal precisa de first-load leve |
| Forms | Reactive Forms + validadores tipados | Decimal string, máscaras CNPJ/CEP |
| Estilo visual | Design tokens próprios (SCSS vars / CSS custom props) | Tokens saem do `/replica-design`; não copiar tema ML/LdM |
| HTTP | `HttpClient` + interceptors funcionais | auth, refresh-queue, erro, base URL |
| Estado | Services com `signal()` + `computed()` por feature | Sem NgRx no início — o servidor é a fonte de verdade |
| Backend | **Existente**: Actix Web, SQLx/Postgres, Elasticsearch | `server/workspace` — não reescrever |
| Docs da API | `/api-docs/openapi.json` (utoipa, gerada do código) | Fonte da verdade dos DTOs — gerar cliente TS a partir dela |

## 2. Schema

**Não criar `schema.sql` novo** — o schema autoritativo está em
`server/workspace/migrations/0001..0009`. O que este app precisa é o **mapa
TS ↔ DTO**:

| Convenção do backend | Tradução no Angular |
| --- | --- |
| `Pagina<T>` `{itens,total,pagina,por_pagina,total_paginas}` | `interface Pagina<T>` compartilhada em `core/models` |
| `Dinheiro`/`Quantidade` = **string decimal** | `type Dinheiro = string` — nunca `number`/float na UI; formatação via pipe `brl` |
| `Id<T>` int64 | `type Id = number` nos models |
| Enums snake_case (`StatusPedido` etc.) | union types TS + mapa de label/cor por status (StatusChip) |
| Erros `ErroApp` tipados | `ProblemDetails`-like → toast + inline por código |

Arquivos: `core/models/*.model.ts` por domínio (1:1 com schemas do OpenAPI).

## 3. Contrato de API real (base `/api/v1`)

### 3.1 `cliente-web` — contexto `portal:`

| Método + path | Faz | Quem | Input | Output | Fluxo |
| --- | --- | --- | --- | --- | --- |
| POST `/auth/portal/login` | login contato | público | `{email,senha}` | tokens + contato | F01 |
| POST `/auth/refresh` | renova access (rotaciona refresh) | portal | `{refresh_token}` | novos tokens | interceptor |
| POST `/auth/logout` | revoga | portal | — | — | — |
| POST `/auth/senha` | troca senha | portal | `{senha_atual,nova_senha}` | — | F05 |
| GET `/portal/catalogo` | vitrine/listagem c/ `preco_efetivo` (tabela da empresa) | portal | `pagina,por_pagina,categoria_id,busca,destaque` | `Pagina<ItemCatalogoPortal>` | F01–F03 |
| GET `/portal/busca/produtos` | full-text + facetas | portal | `q,categoria_id,marca,preco_min,preco_max,pag` | hits + aggs | F02 |
| GET `/portal/busca/sugestoes` | autocomplete | portal | `q,limite` | `[{nome,sku}]` | F02 |
| GET `/portal/carrinho` | carrinho aberto | portal | — | carrinho+itens | F01 |
| POST `/portal/carrinho/itens` | add item | portal | `{produto_id,quantidade}` | item | F01 |
| PUT `/portal/carrinho/itens/{produto_id}` | muda qtd | portal | `{quantidade}` | — | F01 |
| DELETE `/portal/carrinho/itens/{produto_id}` | remove | portal | — | — | F01 |
| POST `/portal/checkout` | cria pedido (origem=ecommerce) | portal | `{endereco_faturamento_id,endereco_entrega_id,condicao_pagamento?,observacoes?}` | pedido | F01 |

### 3.2 Gaps do portal — **endpoints que o backend precisa adicionar**

O wireframe assume telas que hoje não têm rota. São pequenos e seguem o padrão
existente (extrator `AuthPortal`). **Spec implementável completa:
[`backend-gaps.md`](./backend-gaps.md)** — a maioria dos ports/repos já existe,
só faltam handlers + use cases finos:

| Endpoint faltante | Serve a tela | Nota |
| --- | --- | --- |
| `GET /portal/me` | S11 conta | dados do contato + empresa + tabela |
| `GET /portal/enderecos` | S07 checkout, S11 | contato precisa escolher IDs de endereço |
| `GET /portal/pedidos` | S09 meus pedidos | por contato/empresa do token |
| `GET /portal/pedidos/{id}` | S10 detalhe | validar ownership pelo `sub` |
| `GET /portal/produtos/{id}` (ou `?slug=`) | S05 PDP | hoje só existe listagem; PDP por slug precisa de lookup com `preco_efetivo` |
| `GET /portal/categorias` | mega-menu | `/categorias` é staff; portal precisa da árvore ativa |

### 3.3 `painel-administrativo` — contexto `staff:`

| Método + path | Faz | Perfil mínimo | Fluxo |
| --- | --- | --- | --- |
| POST `/auth/staff/login` · `/auth/refresh` · `/auth/logout` · `/auth/senha` | auth | todos | — |
| GET/POST `/usuarios`, GET/PATCH `/usuarios/{id}`, PATCH `/usuarios/{id}/ativo` | CRUD staff | admin | F13 |
| GET/POST `/empresas`, GET/PATCH/DELETE `/empresas/{id}` | CRM empresas (DELETE=arquivar) | vendedor | F06 |
| GET/POST `/contatos`, GET/PATCH/DELETE `/contatos/{id}`, POST/DELETE `/contatos/{id}/portal` | contatos + ativa portal | vendedor | F06 |
| GET `/empresas/{id}/enderecos`, POST/PATCH/DELETE `/enderecos*` | endereços | vendedor | F06 |
| GET/POST `/oportunidades`, GET/PATCH `/oportunidades/{id}`, PATCH `/oportunidades/{id}/estagio` | funil | vendedor | F06 |
| GET/POST `/interacoes` | timeline CRM | vendedor | F06 |
| GET/POST `/orcamentos`, GET `/orcamentos/{id}`, PUT `/orcamentos/{id}/itens`, PATCH `/orcamentos/{id}/status`, POST `/orcamentos/{id}/converter` | orçamento completo | vendedor | F06 |
| GET `/categorias`, POST `/categorias`, PATCH `/categorias/{id}` | árvore catálogo | admin/estoque | F12 |
| GET/POST `/produtos`, GET/PATCH/DELETE `/produtos/{id}` | produtos (DELETE=soft) | estoque | F12 |
| GET/POST `/tabelas-preco`, GET/PATCH `/tabelas-preco/{id}`, POST `/tabelas-preco/{id}/itens`, DELETE `.../itens/{produto_id}` | preço B2B | admin/financeiro | F12 |
| GET/POST `/pedidos`, GET `/pedidos/{id}`, PATCH `/pedidos/{id}/status` | pedidos + máquina de estados | vendedor/estoque | F07/F08 |
| GET `/estoque/saldo/{produto_id}`, GET/POST `/estoque/movimentacoes`, GET `/estoque/abaixo-do-minimo` | estoque | estoque | F10 |
| GET/POST `/ordens-servico`, GET `/ordens-servico/{id}`, POST `/{id}/materiais`, PATCH `/{id}/status` | OS | tecnico | F11 |
| GET/POST `/notas-fiscais`, GET `/{id}`, POST `/{id}/autorizar`, `/{id}/cancelar` | fiscal | financeiro | F08 |
| GET `/pagamentos`, POST `/pagamentos/parcelas`, `/{id}/baixar`, `/{id}/estornar` | recebíveis | financeiro | F09 |
| GET `/caixas/aberto`, GET `/caixas`, GET `/caixas/{id}/movimentacoes`, POST `/caixas/abrir|lancar|fechar` | caixa | financeiro | F09 |
| GET `/busca/produtos`, POST `/busca/reindexar` | busca staff / admin | staff / admin | F13 |
| GET `/auditoria` | logs append-only | admin | F13 |

**RBAC no front**: `perfilGuard('admin','financeiro')` esconde rota/menu; a
autoridade final é sempre o backend (o front nunca decide sozinho).

## 4. Estrutura dos apps

```
cliente-web/                         painel-administrativo/
└── src/app/                         └── src/app/
    ├── core/                            ├── core/          (mesmo desenho)
    │   ├── auth/                        │   ├── auth/      (staff + perfis)
    │   │   ├── auth.store.ts            │   ├── http/      (interceptors)
    │   │   ├── auth.interceptor.ts      │   ├── guards/
    │   │   └── portal.guard.ts          │   └── models/    (DTOs ↔ OpenAPI)
    │   ├── http/                        ├── shared/
    │   │   ├── api.interceptor.ts       │   ├── ui/        (DataTable, StatusChip,
    │   │   └── error.interceptor.ts     │   │              Drawer, ConfirmDialog…)
    │   └── models/                      │   └── forms/     (CurrencyField, DocField)
    ├── shared/                          ├── layout/       (shell: sidebar+topbar)
    │   └── ui/                          └── features/
    ├── layout/  (shell: header+megamenu+footer)  ├── dashboard/      A02
    └── features/                              ├── crm/             A03–A08
        ├── auth/      S01,S12                   ├── orcamentos/      A09–A10
        ├── home/      S02                       ├── pedidos/         A11–A13
        ├── catalogo/  S03–S05                   ├── catalogo/        A14–A18
        ├── carrinho/  S06                       ├── estoque/         A19–A22
        ├── checkout/  S07,S08                   ├── operacao/        A23–A24
        └── conta/     S09–S11                   ├── fiscal/          A25–A26
                                                 ├── financeiro/      A27–A29
                                                 ├── admin/           A30–A31
                                                 └── busca/           A32
```

Regras de dependência (mesma disciplina do backend): `features → shared → core`;
feature nunca importa feature; HTTP só em `core/http` + services de feature;
formatação só em pipes (`brl`, `qty`, `doc`, `statusLabel`).

## 5. Autenticação e sessão (a parte que morde)

- **Access token** em memória (`signal` no `AuthStore`) — nunca `localStorage`
  (XSS). **Refresh token**: preferir `HttpOnly Secure SameSite=Strict` cookie
  (requer `credentials` + CORS com credentials no Actix); fallback
  `sessionStorage` se cookie não for possível agora.
- **Refresh interceptor com fila**: primeiro 401 dispara `/auth/refresh`;
  demais requisições esperam o `Subject` completar — sem stampede; reuso de
  refresh revogado (backend detecta) → logout forçado + `/login?expired=1`.
- **Dois apps, dois contextos**: o interceptor do portal nunca chama
  `/auth/staff/*` e vice-versa — se receber 401 de contexto errado, logout.
- Guards: `portalGuard` (cliente-web), `staffGuard` + `perfilGuard(...)`
  (admin). `data: { perfis: ['admin'] }` na rota.

## 6. Decisões de URL/rotas (segurança — requisito do usuário)

- Portal: `/p/{id}-{slug}`, `/c/{id}-{slug}`, `/busca?q=` — slug cosmético,
  id resolve; canonical + 301 se divergir. Ids são int64 internos; autorização
  sempre server-side (anti-IDOR).
- Admin: `/vendas/pedidos/123` ok — app não indexável (`robots` deny all,
  `noindex`, idealmente host/subdomínio separado + allowlist de IP no proxy).
- Query params via `HttpParams` tipado (whitelist); `q=` sanitizado.
- Nenhum dado sensível (CNPJ, email, valores) em path/query.

## 7. As partes que mordem

- **Refresh rotation**: implementado como fila única no interceptor; testar
  corrida de 401s (duas requests expirando juntas).
- **Decimal string**: `Dinheiro`/`Quantidade` trafegam como string — inputs
  usam máscara que emite string; nunca `parseFloat` para dinheiro.
- **Máquinas de estado**: o front não reimplementa `transicionar()` — renderiza
  botões a partir da **matriz de transições** (espelhada em `core/models`, e
  o backend rejeita inválidas com erro tipado que vira toast).
- **Paginação**: tudo server-side via `Pagina<T>` — a UI nunca pagina array
  local de lista grande.
- **Elasticsearch off**: `503` em `/busca/*` e `/portal/busca/*` → UI cai para
  `GET /produtos?busca=` (staff) ou mostra estado "busca indisponível" (portal).
- **Imagens de produto**: tabela `produto_imagens` existe, mas **não há
  endpoint de upload** — decisão pendente: upload multipart novo vs. URL
  externa (admin cola URL). Registrar no backlog do backend.
- **Idempotência**: checkout/carrinho — double-click protegido por disable +
  requisição única; `pedidos.carrinho_uk` já garante 1 pedido por carrinho.
- **Conversão 1:1 orçamento→pedido**: `orcamentos_convertido_uk` — a UI trata
  409 como "já convertido" e navega ao pedido.
- **Soft delete / arquivar**: `deleted_at` em produtos — listas filtram
  `ativo`/`deleted` consistentemente; não confundir "inativo" com "arquivado".

## 8. Ordem de build

**M0 — Fundação (os dois apps, ~setup)**
- `ng new` ×2 standalone, environments (`apiUrl`), tokens, interceptors,
  guards, `Pagina<T>` + models gerados do OpenAPI, shell layout, ErrorPages.

**M1 — Fatia vertical portal F01** (telas S01,S02,S05,S06,S07,S08;
endpoints portal existentes + `GET /portal/enderecos` — gap pequeno)
- login → vitrine → PDP → carrinho → checkout → confirmação.
  Prova: auth portal, `preco_efetivo`, carrinho uuid, máquina de pedido.

**M2 — Portal completo**: S03,S04 (busca+facetas+autocomplete), S09–S12
(depende dos gaps `portal/pedidos`, `portal/me`), S13.

**M3 — Admin fatia de vendas**: A01,A02(mínimo),A11,A12,A13 + A27/A28/A29
(financeiro do pedido) — cobre F07–F09.

**M4 — Admin CRM + catálogo**: A03–A10 (funil F06), A14–A18 (F12).

**M5 — Admin operação**: A19–A24 (F10,F11), A25–A26 (fiscal), A30–A32 (F13).

**M6 — Should/Could** do `features.csv` + polish (skeletons, empty states,
toasts, a11y) e integrações reais (SEFAZ, frete, gateway) quando decididas.

## 9. Resumo

- **Stack**: Angular 22 standalone/signals ×2 apps, sobre Actix/Postgres/ES existente.
- **Tabelas**: 0 novas (schema autoritativo em `migrations/`); ~18 models TS.
- **Rotas**: 94 existentes usadas; **6 endpoints novos** pedidos ao backend (portal: me, endereços, pedidos, pedido, produto por slug, categorias).
- **3 mais arriscadas**: refresh-queue sem race; matriz de transições espelhada; gaps do portal fechando no backend a tempo do M2.
- **Próximo passo**: `/replica-design` — tokens + componentes (StatusChip, DataTable, ItemsEditor, ProductCard) que este wireframe já nomeou.
