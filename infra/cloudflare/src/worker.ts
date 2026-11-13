/**
 * Worker de borda do portal HWeld (apps/web).
 *
 * - `/api/v1/{payments,billing,fiscal-documents,notifications,events,webhooks}*`
 *               → proxy para o operations-api (Java/Spring) — REST
 * - `/api/*`      → proxy para o core-api (Rust/Actix)      — REST
 * - `/events/*`   → proxy para o realtime-engine (Phoenix)  — SSE
 * - `/socket/*`   → proxy para o realtime-engine (Phoenix)  — WebSocket Channels
 * - demais rotas  → static assets do SPA Angular (fallback SPA → index.html)
 *
 */

interface Env {
  ASSETS: Fetcher;
  CORE_API_ORIGIN: string;
  REALTIME_ORIGIN: string;
  OPS_API_ORIGIN: string;
  /**
   * Segredo de borda compartilhado com as origens (`EDGE_TOKEN` nas três).
   * A origem rejeita tráfego direto (`*.up.railway.app`) que não venha com
   * `x-edge-token` — só a edge conhece o segredo. Ausente = header não
   * injetado (dev local, onde a origem também tem a guarda desligada).
   * Configurar com `wrangler secret put EDGE_TOKEN` — nunca em `vars`.
   */
  EDGE_TOKEN?: string;
}

const API_PREFIX = "/api";
const REALTIME_PREFIXES = ["/events", "/socket"];

// Prefixos `/api/v1/*` servidos pelo operations-api (Java) — pagamentos,
// billing, fiscal, notificações e trilha de eventos. Os paths do Java são
// em inglês e não colidem com os do core-api (em português).
const OPS_PREFIXES = [
  "/api/v1/payments",
  "/api/v1/billing",
  "/api/v1/fiscal-documents",
  "/api/v1/notifications",
  "/api/v1/events",
  "/api/v1/webhooks",
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (OPS_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
      return proxy(request, env.OPS_API_ORIGIN, env);
    }
    if (matchesPrefix(pathname, API_PREFIX)) {
      return proxy(request, env.CORE_API_ORIGIN, env);
    }
    if (REALTIME_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
      return proxy(request, env.REALTIME_ORIGIN, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function proxy(request: Request, origin: string, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(`${url.pathname}${url.search}`, stripSlash(origin));

  const proxied = new Request(target.toString(), request);
  proxied.headers.delete("host");

  // `set` sobrescreve um `x-edge-token` forjado pelo cliente — a origem só
  // confia no valor injetado aqui.
  if (env.EDGE_TOKEN) {
    proxied.headers.set("x-edge-token", env.EDGE_TOKEN);
  }

  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) {
    proxied.headers.set("x-forwarded-for", clientIp);
    proxied.headers.set("x-real-ip", clientIp);
  }
  proxied.headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  proxied.headers.set("x-forwarded-host", url.host);

  return fetch(proxied);
}

function stripSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}
