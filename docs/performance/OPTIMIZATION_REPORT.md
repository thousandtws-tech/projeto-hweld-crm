# Relatório de Otimizações — Frontend

Data: 2026-10-21. Todas as mudanças validadas com `tsc --noEmit`, `eslint` (apenas prettier/CRLF pré-existente), builds de produção e testes unitários verdes.

## Comparativo medido

| Área | Antes | Depois | Δ |
| --- | --- | --- | --- |
| Angular: initial total (raw / transfer) | 720.48 kB / 173.88 kB | 720.98 kB / 176.42 kB | +0.5 kB (+imports rxjs-interop) — neutro, como previsto (ganhos são de runtime) |
| Angular: lazy `home` (raw / transfer) | 223.74 kB / 62.41 kB | 123.87 kB / 33.07 kB | **−44.6% raw / −47% transfer** |
| Angular: `styles` global (raw) | ~37 kB | 28.40 kB | **−23%** |
| Angular: componentes em `OnPush` | 0 / 51 | 51 / 51 | detecção de mudanças sob demanda |
| Angular: specs | 0 (`ng test` quebrado) | 7 testes verdes | gate de regressão ativo |
| React: entry `index` (raw / gzip) | 339.20 kB / 105.39 kB | 383.17 kB / 118.96 kB | +44 kB raw — TanStack Query agora efetivamente usado (estava instalado e ocioso) |
| React: lazy `dashboard` | 407.41 kB / 115.24 kB | 408.05 kB / 115.41 kB | neutro |
| React: requests por mount do Dashboard | 10 em 2 ondas (waterfall) | 8–9 em 1 onda paralela + cache | −1 request morta, waterfall eliminado |
| React: `AppShell` mounts por sessão | 1 por navegação (~28 páginas) | 1 por sessão | + elimina 2 requests de sino por troca de rota |
| React: refetches por rajada SSE | N eventos → N reloads | coalescido (trailing 400ms) | storm eliminado |
| Ambos: instâncias `Intl.NumberFormat` | 1 por transform/célula | 2 por módulo | alocação por render eliminada |
| Build Angular | ~6 s | ~4.8 s | — |
| Build React (incremental) | ~14.4 s (cold) | ~3.7 s (warm) | — |

**Não medido (backend offline):** LCP/INP/CLS, latência de navegação, long tasks, contagem de requests em runtime. Ver `BASELINE.md` para o protocolo de medição pendente.

## Mudanças implementadas — Angular

1. **OnPush em massa** (`apps/web/src/app/**`): 51 componentes via script, revisão manual de mutações fora do framework — todos os estados já eram signal-based → adoção segura.
2. **Swiper otimizado** (`slider-pro.ts`, `brands-slider.ts`, `category-grid.ts`): init único dentro de `effect`, construção/destruição via `NgZone.runOutsideAngular` — autoplay/timer do Swiper não acorda mais a CD a cada frame.
3. **GSAP removido** da home (import morto) — origem direta da queda de ~100 kB no lazy chunk.
4. **`RealtimeService.reagirA`** (`core/realtime.ts`): reconcile coalesced — predicado em `untracked` (sem loop), trailing edge 300ms, timer limpo no `DestroyRef`. 11 call sites migrados (home, carrinho, pedidos, checkout, produto, categoria, busca, notificações, cms.store, categorias.store).
5. **`@defer (on viewport)`** nas seções below-the-fold de `home.html` com placeholders estáveis.
6. **Fonts não bloqueantes** (`index.html`): `media="print" onload` + `<noscript>` fallback.
7. **Zoom da PDP fora da zona** com throttle rAF — `mousemove` não satura a main thread com CD.
8. **`Intl.NumberFormat` memoizado** (`core/pipes.ts`).
9. **`takeUntilDestroyed`** nas subscriptions de rota/form (`produto`, `categoria`, `busca`, `seguranca`).
10. **CSS Swiper deduplicado** (`angular.json`/`styles.scss`) e âncoras aninhadas corrigidas (`mobile-bottom-nav.html`).
11. **Specs criadas**: `realtime.spec.ts` (coalescing/destroy) + `pipes.spec.ts` — `ng test` agora passa (7 testes).
12. **Budgets** apertados no `angular.json`: initial 800 kB warn / 1.2 MB error.

## Mudanças implementadas — React

1. **Shell persistente** (`routes/__root.tsx`): `AppShell` montado uma vez acima do `<Outlet>` (exceção `/login`). Removido o wrapper de todas as ~28 páginas + `ProdutoForm`. Sidebar, topbar, sino, SSE-status e listener Ctrl+K não remontam — fim dos 2 requests de notificações por navegação e da reconstrução do chrome.
2. **TanStack Query ativado** (`router.tsx`): `staleTime 30s`, `gcTime 5min`, `retry 1`, `refetchOnWindowFocus: false`.
3. **Prefetch por intenção**: `defaultPreload: 'intent'` + `defaultPreloadStaleTime: 30s` — hover/focus baixa chunk + loader antes do clique.
4. **SSE coalescido** (`use-realtime.ts`): `useRealtimeEvent` agora debounce trailing-edge 400ms embutido — os 21 call sites passam a coalescer sem mudança de código.
5. **Dashboard por widget** (`dashboard.tsx`): 9 `useQuery` independentes (paralelas, `enabled` por perfil), `Map` derivado por `useMemo`, invalidação direcionada — `pedido.*` toca só queries de pedidos, `pagamento.*` só financeiro, etc. Removida a request `dashboardService.produtos()` cujo resultado era descartado.
6. **`ListaPage` com cache** (`lista.tsx`): `queryKey` por (recurso, página, busca, filtro), `keepPreviousData` entre páginas — sem skeleton nem layout shift na paginação; SSE invalida por recurso.
7. **Sino via query** (`use-notificacoes.ts`): cache + invalidação por `notificacao.nova`, `setQueryData` otimista nas ações.
8. **Micro-alocações**: `Intl.NumberFormat` de módulo (`format.ts`), JWT memoizado por token (`session.ts`).
9. **Tema sem flash**: script inline pré-paint em `index.html` (chave `hweld-theme`, migra `finpay-theme`) + init síncrono do hook.
10. **`ProdutoForm` PATCH-diff**: snapshot do produto carregado → só campos alterados no PATCH; sem request se nada mudou.
11. **Omnibox**: `busca: q` no endpoint de oportunidades (filtro local mantido como fallback) e SSE reconecta imediato ao voltar para a aba (`visibilitychange` em `realtime.ts`).
12. **Budget de bundle**: `scripts/check-bundle.mjs` (JS ≤130 kB gzip/chunk, CSS ≤20 kB) + `npm run perf:budget` + step no `ci.yml` após o build.

## Riscos conhecidos das mudanças

- `useRealtimeEvent` passou a atrasar callbacks ~400ms (design: reconcile silencioso). Nenhum call site exige resposta imediata.
- Entry React +44 kB raw: preço de ativar o cache instalado; compensa ao eliminar refetches por navegação.
- `media="print" onload` requer JS para ativar a fonte — `<noscript>` cobre o fallback.
