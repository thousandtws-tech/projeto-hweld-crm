# Motor Realtime — HWeld

Motor dedicado de eventos realtime em **Elixir/Phoenix** (OTP 29, Phoenix 1.8,
Bandit). Substitui o broadcast in-process que vivia no backend Actix — o Rust
publica via HTTP `fire-and-forget` e o motor faz o fan-out para os clientes
(SSE hoje, Phoenix Channels para WebSocket).

## Por quê BEAM

Cada conexão SSE/Channel é um **processo leve** (~2 KB) supervisionado pela VM.
Dezenas de milhares de assinantes por nó sem thread pool, e o PubSub distribuído
(`:pg`) já é multi-nó nativo — para cluster multi-máquina basta um backend de
descoberta (`libcluster`/DNSCluster) ou broker externo (Redis/NATS).

## Arquitetura

```
Backend Rust (use cases — NotificadorRealtime port)
   │  POST /ingest   Bearer MOTOR_INGEST_TOKEN — fire-and-forget, ~300µs
   ▼
MotorRealtime (Phoenix + Bandit :4100)
   │
   ├── Phoenix.PubSub — barramento, fan-out por audiência
   │     eventos:staff         ← backoffice escuta tudo
   │     eventos:empresa:{id}  ← portal da empresa
   │     eventos:todos         ← todos os portais
   │
   ├── GET /events/staff    (JWT staff)   → SSE chunked
   ├── GET /events/portal   (JWT portal)  → SSE scoped por empresa
   ├── /socket (Channels)                 → clientes WebSocket futuros
   │
   └── Observabilidade
         ├── /monitor     → painel LiveView (login staff) — feed push via PubSub
         ├── /dashboard   → painel de domínio legado (?token=) — polling JSON
         └── /infra       → Phoenix LiveDashboard (métricas, processos, ETS)
```

## API

### `POST /ingest` — publicação (só o backend Rust)

Header: `Authorization: Bearer $MOTOR_INGEST_TOKEN` (`Plug.Crypto.secure_compare`
— comparação em tempo constante, anti timing-attack).

```json
{
  "tipo": "pedido.status_alterado",
  "audiencia": { "escopo": "empresa", "empresa_id": 7 },
  "dados": { "id": 12, "de": "confirmado", "para": "em_separacao" }
}
```

| Campo | Regra |
|---|---|
| `tipo` | `entidade.acao` — regex `^[a-z0-9_]+(\.[a-z0-9_]+)+$`, máx. 80 bytes |
| `audiencia.escopo` | `staff` \| `empresa` (requer `empresa_id` int > 0) \| `todos` |
| `dados` | objeto JSON livre |

Respostas: `202 {"aceito": true, "entregas": n}` · `401` token inválido ·
`422` envelope malformado.

### `GET /events/staff` / `GET /events/portal` — SSE

Header: `Authorization: Bearer <JWT HS256 do backend>`. Claims: `sub`,
`tipo` (`staff` | `portal`), `exp`. Portal resolve `contato → empresa` via
Postgrex com cache ETS de 60 s — o cliente **não** informa a empresa.

Contrato de frames (idêntico ao antigo backend — fronts trocam só a URL):

```
: hweld-realtime
retry: 3000

event: pedido.status_alterado
data: {"tipo":"pedido.status_alterado","dados":{"id":12,"para":"em_separacao"}}

: ping          ← heartbeat a cada 15s (proxies derrubam conexão inativa)
```

Assinante lento (mailbox > 512 eventos) recebe `: lagged` e é desconectado —
o cliente reconecta e reconcilia via REST (mesma semântica do ring buffer).

### `GET /socket` — Phoenix Channels

Transporte WebSocket para clientes futuros (`phoenix.js`): topics
`eventos:staff`, `eventos:empresa:*`, `eventos:todos` — auth por JWT no connect.

### Observabilidade

| Rota | Auth | Conteúdo |
|---|---|---|
| `GET /monitor` | login staff | **Painel LiveView** — feed de eventos em push (sem polling), KPIs, entregas por tópico, conexões vivas, ranking de tipos, filtro por domínio |
| `GET /monitor/login` | público | Login staff — credencial validada no backend Rust (`/auth/staff/login`), sessão assinada |
| `DELETE /monitor/logout` | sessão | Encerra a sessão do painel |
| `GET /` | público | JSON de descoberta (serviço, versão, endpoints) |
| `GET /health` | público | `{"status":"ok"}` — probe de balanceador |
| `GET /dashboard` + `/api` | `?token=` | Painel de domínio legado (HTML + JSON, polling) |
| `GET /infra` | `?token=`/sessão | **Phoenix LiveDashboard**: gráficos Telemetry, processos, ETS, sockets, OS |

**`/monitor`** é o painel principal: LiveView assina o tópico `monitor:dashboard`
do PubSub e recebe cada evento/consolidação em push — o feed atualiza no mesmo
instante em que o Rust publica. Sessão = JWT staff da mesma conta do painel
administrativo (`admin@hweld.local` em dev).

Painéis por token: `?token=$MOTOR_INGEST_TOKEN` (ou `Authorization: Bearer`).
Na primeira navegação o token grava uma sessão assinada — redirects internos
do LiveDashboard funcionam sem o token na URL.

## Telemetria

| Evento | Medidas | Meta |
|---|---|---|
| `[:motor_realtime, :evento, :publicado]` | `topicos`, `entregas` | `tipo`, `audiencia`, `dados`, `entregas_por_topico` |
| `[:motor_realtime, :conexao, :aberta/fechada]` | — | `audiencia`, `sujeito`, `pid` |
| `[:motor_realtime, :ingest, :rejeitado]` | — | `motivo` |
| `[:motor_realtime, :conexoes, :ativas]` | `staff`, `portal` | — (poller 10 s) |

O `MotorRealtime.Monitor` (GenServer + ETS `:motor_realtime_metricas`) consome
esses eventos: contadores públicos por tipo/motivo, ring buffer dos últimos 150
eventos e mapa de conexões vivas — tudo servido ao `/dashboard`.

## Módulos

```
lib/motor_realtime/
  application.ex        → supervision tree (PubSub → Resolver → Monitor → Postgrex → Endpoint)
  evento.ex             → contrato + validação do envelope
  barramento.ex         → fan-out PubSub + telemetria de entregas por tópico
  empresa_resolver.ex   → contato→empresa: Postgrex + cache ETS (TTL 60 s)
  monitor.ex            → métricas, ring buffer, conexões vivas

lib/motor_realtime_web/
  endpoint.ex           → sockets /live e /socket, CORS, session
  router.ex             → pipelines api/ingest/staff/portal/monitor/livedash/browser
  plugs/autenticacao.ex → TokenServico, AutenticacaoMonitor, AutenticacaoStaff, AuthJwt
  plugs/cors.ex         → allowlist de origens (env)
  components/
    core.ex             → design system (button, badge, panel, stat, input, icon)
    layouts.ex          → root + app (header do painel)
  live/
    login_live.ex       → /monitor/login (form → POST sessão)
    monitor_live.ex     → /monitor — feed push via PubSub
  hooks/auth.ex         → on_mount: revalida sessão staff no socket
  controllers/
    ingest_controller.ex    → POST /ingest
    eventos_controller.ex   → SSE staff/portal (heartbeat, cap de mailbox)
    sessao_controller.ex    → login/logout do /monitor (proxy ao Rust via Req)
    dashboard_controller.ex → painel legado + API JSON
    saude_controller.ex     → / e /health
  channels/             → EventosSocket + channel (clientes WebSocket futuros)
  telemetry.ex          → métricas do motor + VM (consumidas pelo LiveDashboard)

assets/                 → app.js (LiveSocket) + app.css (Tailwind v4)
                          build: `mix assets.build` | watch automático em dev
```

## Configuração

| Var | Default | Uso |
|---|---|---|
| `MOTOR_PORT` | `4100` | Porta HTTP |
| `JWT_SECRET` | dev: `.env` do backend | Verifica JWT staff/portal |
| `MOTOR_INGEST_TOKEN` | dev: `.env` do backend | `/ingest`, `/dashboard`, `/infra` |
| `DATABASE_URL` | dev: `.env` do backend | Postgrex (resolver contato→empresa) |
| `CORS_ORIGINS` | `localhost:4210,4200,4300` | SPAs autorizados no preflight |

Em dev, `runtime.exs` carrega segredos de `server/workspace/.env` — **fonte
única**, nada duplicado. Em prod, envs são obrigatórias (boot falha sem
`JWT_SECRET`/`MOTOR_INGEST_TOKEN`).

## Rodar

```bash
cd server/motor-realtime

mix deps.get
mix phx.server          # http://localhost:4100
mix test                # 30 testes
mix precommit           # compile estrito + format + testes
```

Smoke test do fan-out:

```bash
# terminal 1 — escuta o stream staff
curl -N -H "Authorization: Bearer <JWT_STAFF>" http://localhost:4100/events/staff

# terminal 2 — publica como o backend faria
curl -X POST http://localhost:4100/ingest \
  -H "Authorization: Bearer $MOTOR_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"pedido.criado","audiencia":{"escopo":"empresa","empresa_id":1},"dados":{"id":1}}'
```

## Eventos publicados pelo backend (contrato atual)

| Domínio | Tipos |
|---|---|
| Pedidos | `pedido.criado`, `pedido.status_alterado` |
| Pagamentos | `pagamento.parcelas`, `pagamento.baixado`, `pagamento.estornado` |
| Caixa | `caixa.aberto`, `caixa.movimento`, `caixa.fechado` |
| Estoque | `estoque.movimentado` |
| Fiscal | `fiscal.nota_emitida`, `fiscal.nota_autorizada`, `fiscal.nota_cancelada` |
| Orçamentos | `orcamento.criado`, `orcamento.status_alterado`, `orcamento.convertido` |
| OS | `os.criada`, `os.status_alterada` |
| CRM | `empresa.criada`, `empresa.atualizada`, `empresa.arquivada`, `oportunidade.estagio` |
| Catálogo | `catalogo.produtos`, `catalogo.categorias`, `catalogo.precos` |
| Notificações | `notificacao.nova` |

## Limites e evolução

- **Single-node**: PubSub em-processo. Multi-nó = `libcluster` + `:pg` (nativo)
  ou broker externo — sem mudança de contrato.
- **Sem persistência**: evento não consumido não é re-entregue (by design —
  cliente reconcilia via REST; SSE é gatilho, não fonte de verdade).
- **Guarantee de ingest**: o adapter Rust é fire-and-forget; se entrega
  garantida virar requisito, evoluir para outbox/retry no backend.
- **Dashboard**: stateful no nó (ring buffer em memória) — reiniciar o motor
  zera o histórico; contadores são desde o boot.
