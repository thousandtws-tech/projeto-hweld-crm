# Baseline de Performance — Frontend

Coletado em: 2026-10-21 · Branch de trabalho local · Ambiente: Windows 11, Node 22, build de produção local.

## Metodologia

- **Bundles**: saída dos builds de produção (`ng build --configuration production` e `vite build`), colunas "raw" e "estimated transfer" (gzip estimado pelo builder).
- **Web Vitals / long tasks / navegação**: exigem backend (`:8080`) + realtime (`:4100`) rodando com dataset representativo. **Backend indisponível no momento da medição — métricas marcadas como `não medido`, não estimadas.**

## Angular (`apps/web`) — antes

| Métrica | Valor |
| --- | --- |
| Initial total (raw) | 720.48 kB |
| Initial total (transfer) | 173.88 kB |
| Lazy `home` (raw / transfer) | 223.74 kB / 62.41 kB |
| Lazy `produto` (raw / transfer) | ~81 kB / ~18 kB |
| `styles` global (raw / transfer) | ~37 kB / ~5.8 kB |
| Build de produção | ~6 s |
| `ChangeDetectionStrategy` explícita | 0 componentes (todos Default) |
| Testes unitários | 0 specs (`ng test` falhava por ausência) |

## React (`apps/painel-admin`) — antes

| Métrica | Valor |
| --- | --- |
| Entry `index` (raw / gzip) | 339.20 kB / 105.39 kB |
| Lazy `dashboard` (raw / gzip) | 407.41 kB / 115.24 kB |
| Lazy `oportunidades` (raw / gzip) | 157.77 kB / 46.17 kB |
| CSS global (raw / gzip) | 93.81 kB / 15.69 kB |
| Build de produção | ~14.4 s (primeira execução, cold) |
| `useQuery`/`useMutation` em uso | 0 (TanStack Query instalado e Provider ativo, sem queries) |
| `AppShell` | renderizado por página — remontava a cada navegação |

## Métricas não coletadas (backend offline)

| Métrica | Estado |
| --- | --- |
| LCP / INP / CLS (ambos apps) | não medido |
| Latência de navegação p75/p95 | não medido |
| Long tasks (contagem/duração) | não medido |
| Requisições duplicadas em runtime | não medido (causas corrigidas por evidência estática) |
| Tempo de tabela/dashboard com dados | não medido |

### Como reproduzir as medições pendentes

1. Subir `hweld-core-api` em `:8080` e realtime em `:4100` com o dataset de homologação.
2. `npm run build && npm run preview` (React) / `ng build + static server` (Angular).
3. Playwright/Lighthouse: cold load, warm load, navegação `/` → `/dashboard` → `/vendas/pedidos` → detalhe; registrar `navigation`/`largest-contentful-paint`/`longtask` via Performance API.
4. Repetir em CPU 4x throttle + Fast 3G (perfil lab definido em `PERFORMANCE_STANDARDS.md`).
