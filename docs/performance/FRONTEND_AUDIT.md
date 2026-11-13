# Auditoria de Performance — Frontend (Angular + React)

Escopo: `apps/web` (Angular 22, portal B2B) e `apps/painel-admin` (React 19 + Vite + TanStack, CRM interno).
Cada achado lista evidência, impacto e o que foi feito. Status: **corrigido** · **parcial** · **diferido** (ver `REMAINING_BOTTLENECKS.md`).

## Angular (`apps/web`)

| # | Achado | Evidência | Impacto | Status |
| --- | --- | --- | --- | --- |
| A1 | Zero `OnPush` — qualquer evento patchado pelo Zone.js varria a árvore inteira | 51 componentes sem `changeDetection`; eventos de mousemove/timer/SSE disparavam CD global | ALTO | corrigido (51/51 → OnPush) |
| A2 | Zoom da PDP lia layout em `(mousemove)` dentro da zona | `produto.ts` `onZoomMove` por pixel | ALTO (long tasks/INP) | corrigido (rAF + `runOutsideAngular`) |
| A3 | GSAP importado na home sem uso efetivo | `slider-pro.ts` import GSAP; home chunk 223.7 kB | ALTO | corrigido (removido; home → 123.9 kB) |
| A4 | Múltiplos Swipers reinicializando e autoplay dentro da zona | `brands-slider.ts`, `category-grid.ts`, `slider-pro.ts` | MÉDIO | corrigido (init único fora da zona + destroy) |
| A5 | CSS do Swiper duplicado global (`angular.json` + `styles.scss`) | build `styles` | MÉDIO | corrigido |
| A6 | Google Fonts + Material Symbols render-blocking | `index.html` `<link rel=stylesheet>` | MÉDIO (FCP/LCP) | corrigido (`media=print onload` + noscript) |
| A7 | Seções below-the-fold da home renderizadas no mount | `home.html` | MÉDIO | corrigido (`@defer on viewport` + placeholder) |
| A8 | SSE → refetch por evento: rajada = storm | `realtime.ts` consumidores com `effect` + reload direto (11 call sites) | ALTO | corrigido (`reagirA` coalesced 300ms, 11 migrados) |
| A9 | `Intl.NumberFormat` instanciado por transform de pipe | `pipes.ts` | BAIXO | corrigido (instâncias de módulo) |
| A10 | Subscriptions sem cleanup | `produto.ts`, `categoria.ts`, `busca.ts`, `seguranca.ts` | BAIXO (leak latente) | corrigido (`takeUntilDestroyed`) |
| A11 | Âncoras aninhadas/full reload em nav | `mobile-bottom-nav.html` | MÉDIO | corrigido |
| A12 | Filtro do FAQ com mismatch signal/form | `faq.ts` | BAIXO | corrigido |
| A13 | Sem specs — `ng test` quebrava por ausência | `angular.json` test target | MÉDIO (regressão) | corrigido (7 specs adicionadas) |

## React (`apps/painel-admin`)

| # | Achado | Evidência | Impacto | Status |
| --- | --- | --- | --- | --- |
| R1 | `AppShell` remontava a cada navegação — sidebar/topbar/sino/listeners destruídos e recriados, +2 requests de notificações por troca de rota | `AppShell` importado e renderizado em ~28 páginas | ALTO | corrigido (shell persistente acima do `<Outlet>` no `__root`) |
| R2 | TanStack Query instalado + Provider ativo e **zero** `useQuery` — nenhum cache, dedupe ou stale-while-revalidate; todo mount refazia requests | grep `useQuery` = 0 | ALTO | corrigido (QueryClient configurado; dashboard, sino e ListaPage migrados — ver R9) |
| R3 | SSE → reload por evento sem coalescência (21 call sites) | `useRealtimeEvent` disparava callback a cada frame | ALTO | corrigido (debounce trailing-edge 400ms embutido no hook — todos os consumidores) |
| R4 | Dashboard: 10 requests/mount com waterfall sequencial (financeiro→operação) + 1 request descartada (`produtos()`) | `dashboard.tsx` `carregar` | ALTO | corrigido (`useQuery` por widget, tudo paralelo, invalidação direcionada por tipo de evento) |
| R5 | `ListaPage` refazia fetch e skeleton a cada mount/página | `lista.tsx` | MÉDIO | corrigido (cache por recurso+página+filtro, `keepPreviousData`) |
| R6 | `Intl.NumberFormat` por célula de tabela | `format.ts` | BAIXO | corrigido (instâncias de módulo) |
| R7 | JWT decodificado por request/menu item | `session.ts` `decodificar` | BAIXO | corrigido (memo por token) |
| R8 | Tema aplicado após o mount → flash; chave `finpay-theme` legada | `use-theme.tsx`, `index.html` | MÉDIO (perceptível) | corrigido (script inline pré-paint + init síncrono + migração de chave) |
| R9 | Sem prefetch de rota | router sem `defaultPreload` | MÉDIO | corrigido (`defaultPreload: 'intent'` + `preloadStaleTime 30s`) |
| R10 | Fonts render-blocking + `lang="en"` | `index.html` | BAIXO | corrigido |
| R11 | `PATCH` de produto enviava os 20 campos sempre | `ProdutoForm.tsx` `salvar` | BAIXO | corrigido (PATCH-diff; sem PATCH se nada mudou) |
| R12 | SSE não resumia ao voltar à aba visível | `realtime.ts` | BAIXO | corrigido (`visibilitychange` → resync imediato) |
| R13 | Listas com `por_pagina: 100` + filtro client-side (pedidos, orçamentos, pagamentos, caixa, OS, auditoria) | várias rotas | MÉDIO | **parcial** — padrão novo definido em `ListaPage`; migração das páginas custom fica como follow-up |
| R14 | Sem budget de bundle no CI | `ci.yml` | MÉDIO (regressão) | corrigido (`perf:budget` + step no CI; Angular budgets apertados) |

## Causa raiz dos sintomas reportados

- **"Travamentos"/perda de fluidez**: A1+A2 (CD global por evento, zoom na zona) e R1 (remount do shell).
- **"Skeletons demorados"**: R2+R5 (zero cache — cada mount refazia tudo) e A6/R10 (fonts bloqueando o primeiro paint).
- **"Lentidão em navegações"**: R1+R9 (remount + sem preload) e A7 (seções pesadas eager).
- **Rajadas periódicas**: A8+R3 (SSE→N refetches) amplificando R4 (dashboard inteiro por evento).
