import { CFG } from "./env";

/**
 * Cliente REST mínimo sobre fetch — devolve `{ status, body }` sem throw,
 * para specs asserterem códigos negativos (401/403/409) com a mesma API.
 */

export interface Resp<T = unknown> {
  status: number;
  body: T;
}

export interface ReqOpts {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Envia o corpo como string crua (webhooks precisam do payload exato p/ HMAC). */
  rawBody?: string;
}

export async function req<T = unknown>(
  base: string,
  metodo: string,
  path: string,
  opts: ReqOpts = {},
): Promise<Resp<T>> {
  const headers: Record<string, string> = { ...opts.headers };
  // Guarda de borda: requests diretas às origens Railway precisam do
  // `x-edge-token` (as URLs de front passam pelo Worker, que injeta ele mesmo).
  if (CFG.edgeToken) headers["x-edge-token"] ??= CFG.edgeToken;
  let data: BodyInit | undefined;
  if (opts.rawBody !== undefined) {
    data = opts.rawBody;
    headers["content-type"] ??= "application/json";
  } else if (opts.body !== undefined) {
    data = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;

  // O rate limit do /auth agora é por IP real — suítes que logam em
  // sequência esgotam o burst (429). Respeita retry-after e tenta de novo
  // em vez de falhar testes por tráfego legítimo.
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const resp = await fetch(`${base}${path}`, { method: metodo, headers, body: data });
    const texto = await resp.text();
    if (resp.status === 429 && tentativa < 3) {
      const esperaSeg =
        Number(resp.headers.get("retry-after")) ||
        Number(resp.headers.get("x-ratelimit-after")) ||
        Number(/retry in (\d+)s/.exec(texto)?.[1]) ||
        2;
      await new Promise((r) => setTimeout(r, esperaSeg * 1000 + 500));
      continue;
    }
    let body: T;
    try {
      body = texto ? (JSON.parse(texto) as T) : ({} as T);
    } catch {
      body = { raw: texto.slice(0, 500) } as T;
    }
    return { status: resp.status, body };
  }
  throw new Error("unreachable");
}

// ── Auth — tokens cacheados por worker (login é rate-limited: 429) ──────────

interface TokenResp {
  access_token: string;
  refresh_token?: string;
}

let _staffSessao: Promise<TokenResp> | undefined;

/** Login staff com refresh — para injetar sessão em browser (sessionStorage). */
export function staffSessao(): Promise<TokenResp> {
  _staffSessao ??= req<TokenResp>(CFG.coreApi, "POST", "/api/v1/auth/staff/login", {
    body: { email: CFG.adminEmail, senha: CFG.adminSenha },
  }).then((r) => {
    if (r.status !== 200 || !r.body.refresh_token) {
      throw new Error(`sessão staff falhou (${r.status}): ${JSON.stringify(r.body)}`);
    }
    return r.body;
  });
  return _staffSessao;
}

let _staff: Promise<string> | undefined;

/** Login staff (admin seed) — 1 chamada por worker, reusada por todos os specs. */
export function staffToken(): Promise<string> {
  _staff ??= req<TokenResp>(CFG.coreApi, "POST", "/api/v1/auth/staff/login", {
    body: { email: CFG.adminEmail, senha: CFG.adminSenha },
  }).then((r) => {
    if (r.status !== 200) {
      throw new Error(
        `login staff falhou (${r.status}) — SEED_ADMIN rodou? ` +
          `E2E_ADMIN_EMAIL/E2E_ADMIN_SENHA estão corretos? ${JSON.stringify(r.body)}`,
      );
    }
    return r.body.access_token;
  });
  return _staff;
}

export interface PortalCreds {
  email: string;
  senha: string;
}

const _portalTokens = new Map<string, Promise<string>>();

/** Login portal — cacheado por e-mail (cada contato tem token próprio). */
export function portalToken(creds: PortalCreds): Promise<string> {
  let p = _portalTokens.get(creds.email);
  if (!p) {
    p = req<TokenResp>(CFG.coreApi, "POST", "/api/v1/auth/portal/login", {
      body: { email: creds.email, senha: creds.senha },
    }).then((r) => {
      if (r.status !== 200) {
        throw new Error(`login portal ${creds.email} falhou (${r.status}): ${JSON.stringify(r.body)}`);
      }
      return r.body.access_token;
    });
    _portalTokens.set(creds.email, p);
  }
  return p;
}

/**
 * Poll até `fn` satisfazer `ok` — para transições assíncronas
 * (relay da outbox ~2s, indexação ES best-effort, entrega de e-mail).
 */
export async function pollAte<T>(
  fn: () => Promise<T>,
  ok: (v: T) => boolean,
  { timeoutMs = 30_000, intervaloMs = 1_000, descricao = "condição" } = {},
): Promise<T> {
  const limite = Date.now() + timeoutMs;
  let ultimo: T | undefined;
  let ultimoErro: unknown;
  while (Date.now() < limite) {
    try {
      ultimo = await fn();
      ultimoErro = undefined;
      if (ok(ultimo)) return ultimo;
    } catch (e) {
      ultimoErro = e;
    }
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  const detalhe = ultimoErro
    ? `último erro: ${String(ultimoErro)}`
    : `último valor: ${JSON.stringify(ultimo)?.slice(0, 400)}`;
  throw new Error(`pollAte: timeout de ${timeoutMs}ms esperando ${descricao} — ${detalhe}`);
}

export function uuid(): string {
  return crypto.randomUUID();
}
