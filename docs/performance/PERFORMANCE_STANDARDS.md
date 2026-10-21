# Padrões de Performance — Engenharia Frontend

Regras obrigatórias para novas features em `apps/web` (Angular) e `apps/painel-admin` (React). Budgets são enforcement, não sugestão.

## Budgets (CI-enforced)

| Alvo | Teto | Onde |
| --- | --- | --- |
| Angular initial bundle | warn 800 kB · error 1.2 MB | `apps/web/angular.json` budgets |
| Angular component style | warn 24 kB · error 48 kB | `angular.json` |
| React qualquer chunk JS | 130 kB gzip | `apps/painel-admin/scripts/check-bundle.mjs` (`npm run perf:budget`) |
| React qualquer CSS | 20 kB gzip | idem |

Metas de lab (medir conforme `BASELINE.md`): LCP ≤ 2.5 s · INP ≤ 200 ms · CLS ≤ 0.1.

## Angular — regras

1. **Todo componente novo nasce `ChangeDetectionStrategy.OnPush`.** Estado via signals; mutation fora do framework só via callback que já roda na zona ou `signal.set`.
2. **Widgets de terceiros (Swiper, charts, mapas, editores)**: construir dentro de `NgZone.runOutsideAngular` + destruir em `ngOnDestroy`/destroyRef. Timers/autoplay dentro da zona acordam CD a cada tick.
3. **`@for` sempre com `track` por id estável.** Listas virtualizadas (CDK) só quando a paginação não resolver (a paginação resolve hoje).
4. **`@defer` para conteúdo abaixo da dobra** com `@placeholder` de dimensão estável (zero CLS).
5. **RxJS**: `takeUntilDestroyed` em toda subscription de componente; `switchMap` para pesquisas; nunca subscribe sem cleanup.
6. **SSE**: sempre `rt.reagirA(predicado, fn)` — nunca refetch direto num `effect` de `ultimo`.
7. **Pipes/transforms**: sem `new Intl.*`, `JSON.parse` ou loop pesado por chamada — memoizar no nível de módulo.

## React — regras

1. **Dados de servidor vivem em `useQuery`/`useMutation`** — nunca `useState + useEffect` para GET/POST. Query key: `[domínio, recurso, ...params]` (`["lista","pedidos",pagina,busca]`, `["dash","pedidos","recentes"]`).
2. **`placeholderData: keepPreviousData`** em paginação/filtro — a página anterior fica na tela até a nova chegar.
3. **SSE**: usar `useRealtimeEvent` (já coalescido 400ms) e dentro do callback **invalidar a query do domínio afetado**, não refazer a página inteira. Mapear prefixo do evento → queryKey.
4. **`AppShell` é singleton no `__root`** — páginas NÃO importam/renderizam `AppShell`; o conteúdo é só o da rota.
5. **Queries condicionais por permissão** usam `enabled:` — não `if` após `await` (waterfall).
6. **Mutations**: PATCH-diff quando o form tem snapshot (padrão `ProdutoForm.montarBody`); atualizar cache via `setQueryData` para feedback instantâneo ou `invalidateQueries` seletivo.
7. **Memoização só com motivo**: `useMemo`/`useCallback` para (a) dados derivados custosos consumidos por outros memos, (b) referências passadas a componentes memoizados/dnd. `?? []` em query data quebra memo — usar constante de módulo (`LISTA_VAZIA`).
8. **Formatters/utilitários quentes**: instâncias `Intl.*` no nível de módulo (`format.ts`), nunca por célula/row.

## Loading / perceived performance

- Skeleton só quando **não há dado** para mostrar; dados em cache/stale renderizam de imediato com indicador sutil (esmaecer/spinner no header), nunca trocar a tabela inteira por skeleton.
- Estados obrigatórios em telas de dados: initial loading · background refreshing · vazio · erro com retry · (offline quando aplicável).
- Dimsões de skeleton = dimensões do conteúdo final (CLS ≈ 0). Respeitar `prefers-reduced-motion`.
- Nunca atraso artificial de loading; nunca "blocker" de tela cheia para atualização de widget único.

## Rede

- Busca/filtro digitado: debounce ≥300ms; `switchMap`/dedupe; `busca` vai ao servidor (param `?busca=`), não filtro client-side em página de 100.
- `por_pagina: 100` + filtro client-side é **anti-padrão proibido** em telas novas — paginar/filtrar no servidor.
- Mutations PATCH preferem diff de campos alterados.
- SSE nunca dispara fetch por evento: coalescer (Angular `reagirA` · React hook) + invalidar domínio.

## Como medir antes de afirmar melhoria

1. Build de produção; servir `dist` local.
2. Backend `:8080` + realtime `:4100` com dataset de homologação.
3. Perf panel/Playwright: gravar navegação e filtrar `longtask`/`largest-contentful-paint`/`event` (INP) via Performance API; comparar mesmo cenário, mesmo dataset, mesma condição de cache.
4. Registrar resultado em `OPTIMIZATION_REPORT.md` — valor não medido entra como "não medido".
