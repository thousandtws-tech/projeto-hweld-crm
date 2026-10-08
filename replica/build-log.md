# Build log

## Sessão 1 — scaffold + fatia vertical portal

- `ng new` Angular 22 (standalone, SCSS) nos dois apps: `cliente-web`, `painel-administrativo`.
- `cliente-web`: tokens `--hw-*` em `styles.scss`; environments dev/prod; fileReplacements
  production configurado.
- Core: `models.ts` (DTOs 1:1 OpenAPI; Dinheiro/Quantidade = string), `AuthStore` portal
  (sessionStorage; token `portal:`), `portalGuard`, `auth.interceptor` com fila
  single-flight de refresh, pipes `brl`/`qty`/`statusLabel`.
- UI kit: `button[hwButton]`, `hw-field`, `hw-price`, `hw-qty`, `hw-status-chip`,
  `hw-empty`, `hw-skeleton`, `hw-toast-host`.
- Fatia F01 completa: login → catálogo/home → PDP → carrinho → checkout → confirmação;
  conta com pedidos/detalhe/segurança; 404.
- Fixes: `node_modules` corrompido por installs interrompidos → reinstall limpo;
  `CarrinhoService` retornando `void`; `routerLinkActive` faltando; imports não usados;
  `ngTemplateOutlet` sem import em checkout.
- Build dev: verde, 0 warnings.

## Sessão 2 — fundação do painel administrativo

- `painel-administrativo`: mesmo design system (styles.scss copiado + aliases
  backoffice: superfícies, `.card`, `table`, `.chip-*` para todos os enums, `.skeleton`,
  inputs globais).
- `AuthStore` staff: **perfil decodificado do claim JWT** (`perfil` no payload do
  access token — confirmado em `infrastructure/src/seguranca/tokens.rs`), sem precisar
  de endpoint `/me`. `autenticado` exige `tipo === 'staff'`. Logout envia
  `{ refresh_token }` (corpo exigido pelo backend).
- `auth.interceptor` com mesma fila de refresh; `staffGuard` + `perfilGuard(...perfis)`
  via `data`/CanActivateFn.
- Shell com sidebar por seções (Vendas/Catálogo/Operação/Financeiro/Administração) com
  itens filtrados por perfil; mobile vira barra horizontal scrollável.
- Login staff (A01) + Dashboard (A02) com KPIs compostos no front + pedidos recentes +
  pipeline.
- `StubPage` genérica: rota declara `data: { titulo, recurso }` e lista o endpoint real
  — cobre todas as listas admin como wireframe navegável até as telas dedicadas.
- Rotas de todas as áreas com `perfilGuard` correto; `sem-permissao` e `404`.
- `angular.json`: fileReplacements production adicionado.
- Build dev: verde, 0 warnings.

## Descobertas relevantes

- `POST /auth/staff/login` retorna **só tokens** — perfil vem no claim JWT. Sem endpoint
  `GET /usuarios/me`: nome do usuário não está disponível no front (mostra `#id`).
  Candidato a 8º gap: `GET /staff/me` ou incluir usuário no login response.
- `POST /auth/logout` exige corpo `{ refresh_token }` (não é vazio).
- `hw-field` renderiza o `<input>` internamente (não projeta); `hwButton` é seletor de
  atributo, não elemento.

## Sessão 3 — telas dedicadas do painel (ng-bootstrap)

- Stack de UI fixada em **ng-bootstrap 21 + Bootstrap 5** (Onsen descartado — wrapper
  Angular morreu no Ng7; PrimeNG testado mas trocado a pedido do usuário).
  `@ng-bootstrap/ng-bootstrap@^21` + `bootstrap@^5` instalados; `@angular/localize`
  no polyfill do `angular.json`; CSS do bootstrap importado globalmente.
- `StubPage` promovida a `ListaPage` (`shared/lista.ts`): listagem server-side
  config-driven com `ListaCfg` (colunas tipadas texto/dinheiro/qtd/status/bool/data,
  busca com debounce, filtro extra, paginação `ngb-pagination`, botão "Novo",
  link de detalhe). Rotas declaram `data: { cfg }` + `perfilGuard`.
- **CRM**: `EmpresaNovaPage`; `Empresa360Page` com ngbNav (dados/contatos/endereços/
  oportunidades/timeline), modais de contato+portal (ativar/desativar), endereço e
  interação; `OportunidadesPage` kanban CDK drag/drop nas 6 colunas — drop em
  `perdida` abre modal de `motivo_perda` obrigatório antes do PATCH.
- **Vendas**: `OrcamentoPage` (lista embutida + editor de itens com select de produto
  que preenche descrição/preço; transições só válidas; conversão só em `aprovado`);
  `PedidoDetalhePage` (stepper 8 status + transições da máquina de domínio);
  `PedidoNovoPage` (manual com itens snapshot).
- **Catálogo**: `ProdutoFormPage` (sku/nome/categoria/marca/UM/fiscal/dims/preços/
  flags), `CategoriasPage` (árvore + form), `TabelaPrecoPage` (itens por produto).
- **Estoque**: `EstoquePage` com abas saldos/movimentações/lançamento/abaixo-mínimo.
- **Operação**: `OsDetalhePage` com transições válidas + consumo de material.
- **Fiscal**: `FiscalPage` — emitir por pedido, autorizar (stub SEFAZ), cancelar
  com motivo obrigatório.
- **Financeiro**: `PagamentosPage` (gerar parcelas, baixar com forma, estornar com
  motivo) e `CaixaPage` (abrir/lançar/fechar com conferência + extrato).
- **Admin**: `UsuariosPage` (CRUD + ativo), `BuscaPage` (busca ES + reindexar,
  503 gracioso), `AuditoriaPage` (diff antes/depois expansível), `SenhaPage`
  (`POST /auth/senha`) em `/conta`, linkado no topbar.
- Fixes: ng-bootstrap sumiu do `node_modules` no reinstall → instalado `^21`;
  `PedidosService.detalhe` tipado com `ItemPedido[]`; movimentações de caixa tipadas;
  `CdkDragDrop` genérico correto; RouterLink/pipes não usados removidos.
- Build dev: **verde, 0 warnings** (`main.js` 2.42 MB dev).
- Dev server em `:4211` funcionando; backend na `:8080` com dados seed.

## Sessão 4 — upgrade visual "profissional" do painel

- `bootstrap-icons@^1` instalado (webfont via `angular.json` styles).
- Shell novo: sidebar dark com logo-marc (ícone gradiente), seções com ícones,
  item ativo com barra lateral de accent, scroll custom; topbar com blur,
  **busca global funcional** → `/admin/busca?q=`, dropdown de usuário
  (avatar+perfil → Minha conta / Sair) via `ngbDropdown`.
- Login em split layout: brand panel dark com gradientes + bullets de produto;
  form-card à direita. Colapsa para form-only no mobile.
- Dashboard: KPI cards com ícone colorido + hover raise + seta; pipeline com
  mini-funil em barras (contagem por estágio) + "ver todos/abrir kanban".
- `styles.scss` polish: app bg `#f4f6f8`, scrollbar estilizada, `.page-header`
  utilitário, overrides Bootstrap sobre tokens `--hw-*` (cards, tabelas com
  header uppercase/sticky-look, botões accent, inputs com focus ring suave,
  modais radius), fade-in de páginas (respeitando reduced-motion).
- `BuscaPage` aceita `?q=` da topbar.
- Build dev: verde, 0 warnings.

## Pendente

- Implementar os 7 endpoints do portal no backend (`replica/backend-gaps.md`) —
  checkout/pedidos/conta dependem deles para dados reais.
- Telas dedicadas admin concluídas (sessão 3); restando: criar tabela de preço,
  reorder de categorias, gestão de imagens (G7).
- Páginas 403/503 dedicadas no portal; mega-menu real; autocomplete; facetas.
- Screenshots de comparação em `replica/clone-screens/`; testes Angular; /replica-test.

## 2026-10-08 — Backend portal G1–G7 implementado (Rust)

- `ServicoPortal` novo: me/enderecos/pedidos/pedido/categorias com escopo
  `contato.empresa_id` do token; cross-tenant = 404 (verificado).
- PDP `GET /portal/produtos/{id|id-slug|slug}` com preço efetivo +
  disponibilidade binária; sanitização `ProdutoPortal` (corrigido leak de
  `preco_custo`/`estoque_minimo` que existia no catálogo).
- Checkout agora retorna `PedidoDetalhePortal` sanitizado (antes: `Pedido`
  cru com ids internos).
- G7: CRUD de imagens por URL (`Admin`/`Estoque`; `vendedor` → 403).
- Gates: build/test/clippy/fmt verdes; frontend `models.ts` alinhado ao
  contrato sanitizado; build do `cliente-web` verde.

## Sessão 5 — Realtime (SSE) + Elasticsearch + categorias

**Backend**
- `ports/realtime.rs`: `NotificadorRealtime` (port), `EventoRealtime`, `Audiencia::{Staff,Empresa,Todos}` — fire-and-forget.
- `infrastructure/realtime.rs`: `BroadcasterRealtime` sobre `tokio::sync::broadcast` (cap 256, lagged→perde antigos).
- `api/handlers/realtime.rs`: `GET /realtime/staff` + `GET /realtime/portal` — SSE com saudação, `retry: 3000`, heartbeat `: ping` 15s, `X-Accel-Buffering: no`. Portal resolve `empresa_id` pelo contato do token.
- Eventos publicados: `pedido.criado` (checkout→Empresa), `pedido.status_alterado` (Empresa), `oportunidade.estagio` (Staff), `catalogo.categorias|produtos|precos` (Todos).
- Fix segurança: `ItemBuscaPortal` fazia flatten de `Produto` cru → vazava `preco_custo`/`estoque_minimo`/`controla_estoque` na busca. Agora usa `ProdutoPortal` sanitizado.

**Elasticsearch**
- Container `hweld-elasticsearch` (docker compose) + `ELASTICSEARCH_URL` no `.env`.
- Índice `hweld_produtos` garantido no boot; `POST /busca/reindexar` (Admin) indexou 6 produtos.
- Live: `/portal/busca/produtos?q=eletrodo` OK, `/portal/busca/sugestoes?q=sol` OK, sanitizado.

**Frontend**
- `RealtimeService` nos dois apps: `fetch`+`ReadableStream` (EventSource não envia Authorization), parser SSE incremental, reconexão honrando `retry:` com backoff até 30s, abort no logout.
- Admin: badge live na topbar, toasts em `pedido.*`/`oportunidade.estagio`; `ListaPage` ganhou `cfg.eventos` (reload silencioso); kanban reconcilia em `oportunidade.estagio`.
- Portal: toasts em `pedido.*`; Home/Categoria/Pedidos/PedidoDetalhe reconciliam via `effect(rt.ultimo)`.
- Fix: `categorias()` chamava `lista()` (Pagina) mas o endpoint devolve array → nova `listaArray()`; página de categorias do admin voltou a funcionar (CRUD já existia).

**Validado ao vivo**
- SSE staff: `text/event-stream`, retry, heartbeat, `catalogo.produtos` e `pedido.criado` entregues.
- SSE portal: recebe `Todos` + `Empresa` própria; `pedido.criado` do checkout chegou.
- Contextos: staff→portal 401, portal→staff 401, anônimo 401.
- `cargo build`/`clippy -D warnings`/`fmt`/`test` (13 pass) verdes; builds Angular 0 warnings.

## 2026-10-08 — Notificações persistentes + sino nos dois apps

**Backend**
- Migration `notificacoes` (destinatário staff/portal, tipo, título, mensagem, link interno, lida_em).
- `ServicoNotificacoes` (app layer) + `CaixaDeEntrada` port — fan-out staff→todos usuários / empresa→contatos com portal.
- API: `GET /notificacoes`, `GET /notificacoes/nao-lidas`, `POST /{id}/lida`, `POST /ler-todas` + espelho `/portal/notificacoes/*`.
- Publicadores: checkout (staff + empresa), `pedido.status_alterado` (empresa), oportunidade ganha/perdida (staff).
- Cada insert publica `notificacao.nova` no barramento SSE (escopo por destinatário).

**Frontend**
- `NotificacoesService` nos dois apps: badge = count autoritativo do servidor, lista mesclada por id, refetch em `notificacao.nova`.
- Admin: `app-sino` (ngbDropdown) na topbar — badge, painel, marcar lida ao clicar (navega pro link), "marcar todas".
- Portal: sino 🔔 no header com dropdown custom (mesmo padrão do mega-menu).
- Toasts migrados: só `notificacao.nova` dispara toast — eventos de negócio servem só de gatilho REST (sem duplicar sino).

**Validado ao vivo**
- Checkout PV-000004 → staff recebe "Novo pedido PV-000004" (/vendas/pedidos/4), portal recebe "Pedido PV-000004 registrado" (/conta/pedidos/4).
- PATCH status → portal recebe `pedido.status_alterado` + `notificacao.nova` via SSE; inbox persistiu.
- Marcar lida 204 → count 0; ler-todas 200 → count 0; cross-contexto 401/404.
- `cargo clippy -D warnings`/`fmt`/`test` (13) verdes; builds Angular 0 warnings (budgets ajustados para o shell).
