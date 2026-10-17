/**
 * Worker de borda do portal HWeld (apps/web).
 *
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
}

const API_PREFIX = "/api";
const REALTIME_PREFIXES = ["/events", "/socket"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (matchesPrefix(pathname, API_PREFIX)) {
      return proxy(request, env.CORE_API_ORIGIN);
    }
    if (REALTIME_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
      return proxy(request, env.REALTIME_ORIGIN);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function proxy(request: Request, origin: string): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(`${url.pathname}${url.search}`, stripSlash(origin));

  const proxied = new Request(target.toString(), request);
  proxied.headers.delete("host");

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
