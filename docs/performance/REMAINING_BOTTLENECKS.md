# Gargalos Remanescentes e Trabalho Adiado

Itens conhecidos que NÃO foram resolvidos nesta rodada, com justificativa e caminho.

## Medição pendente (bloqueante para fechar o relatório final)

- **Web Vitals, navegação e long tasks não foram medidos** — backend local `:8080`/`:4100` indisponível. Protocolo pronto em `BASELINE.md`. Após medir, atualizar `OPTIMIZATION_REPORT.md` com antes/depois real.

## Angular

1. **Initial bundle ~721 kB raw** — não reduziu (ganhos foram runtime + lazy chunks). Maiores componentes: framework + Material/CDK. Caminho: migrar o tema prebuilt `@angular/material` para tema custom com apenas os componentes usados (est. −10–30 kB), revisar `MatTabs`/`MatTooltip` na PDP e zoneless quando Angular + libs internas estiverem prontas. **Risco: refatoração de tema afeta visual — fazer com review visual.**
2. **`por_pagina: 24` no catálogo** — paginação server-side já ok; virtual scroll desnecessário hoje. Se um dia houver "scroll infinito", usar CDK `cdkVirtualScroll` com `itemSize` fixo.
3. **`AuthStore`/stores em signals + Zone.js** — candidato a zoneless (`provideZonelessChangeDetection`) quando a stack 22.x estabilizar; exige auditoria de todos os eventos DOM customizados. Adiado por compatibilidade, não por falta de benefício.
4. **SSR/prerender** — benéfico para o catálogo público (SEO/LCP); **não introduzir indiscriminadamente** nas telas privadas (conta/checkout). Depende de decisão de infra (servidor Node ou prerender estático por rota).

## React

1. **Páginas de listagem custom** (`vendas/pedidos`, `vendas/orcamentos`, `financeiro/pagamentos`, `financeiro/caixa`, `operacao/ordens-servico`, `auditoria`, `admin/usuarios`, `estoque`, `fiscal/notas`, `tabelas-preco`) ainda fazem fetch manual com `por_pagina: 100` + filtro/paginação client-side. **Caminho: extrair para o padrão `ListaPage`+`useQuery` (cache, `keepPreviousData`, paginação server-side) ou criar um `useResourceList(recurso, params)` compartilhado.** Estimativa de esforço: média por página (mesma mecânica da `lista.tsx` convertida). Sem backend, não foi possível validar se os endpoints aceitam filtro server-side equivalente em todos os recursos — checar `services/hweld-core-api` antes de migrar.
2. **Entry chunk 383 kB raw** — contém React+TanStack+Radix+base do app. Próximos cortes possíveis: `manualChunks` separando `recharts` (só dashboard usa), `react-kanban-kit` (só oportunidades) e `jet-sdk` se não essencial no boot. Validar que o Vite já lazy-carrega esses pelos chunks de rota — `dashboard` e `oportunidades` já saem como chunks separados, então o ganho seria fino; medir antes de mexer.
3. **`por_pagina: 100` no Kanban** — o board precisa de todas as oportunidades abertas por design; se o volume crescer, mover para carregamento por coluna/estágio com queries por estágio.
4. **Dashboard: datasets calculados no cliente** (curva ABC, série de receita, saúde de negócio) — com volumes reais grandes, considerar endpoints agregados no `hweld-core-api` (ex.: `/dashboard/receita?meses=6`) para reduzir payload e CPU. Requer contrato novo no backend — alinhar antes.
5. **React Compiler** — avaliar quando estável para a toolchain atual; eliminaria parte dos memos manuais. Adiado: ainda não é default do ecossistema TanStack/Vite neste repo.

## Compartilhado

- **Fonts**: ainda externas (Google Fonts, não bloqueantes). Auto-hospedar Inter/Material Symbols com subset corta DNS+TLS do caminho de renderização — quick win futura.
- **Service Worker/HTTP cache** dos assets versionados — os chunks já têm hash no nome; garantir `Cache-Control: immutable` no servidor estático (decisão de infra, fora do front).
- **E2E de performance** (`tests/performance`) mede API, não browser — adicionar spec Playwright de jornada crítica com budget de `longtask`/LCP quando houver ambiente com backend no CI.
- **Observabilidade de produção**: sem RUM — Web Vitals reais do campo exigem beacon (`web-vitals` → endpoint). Recomendado para fechar o loop "usuário real", depende de endpoint de telemetria.
