import { API_URL } from "./config";
import { PERFIS, type Perfil, type Tokens } from "./models";

const KEY_ACCESS = "hw_staff_access";
const KEY_REFRESH = "hw_staff_refresh";

interface ClaimsJwt {
  sub: string;
  tipo: "staff" | "portal";
  perfil?: string;
  exp?: number;
  iat?: number;
  jti?: string;
}

/** Decodifica o payload do JWT (base64url) — só para UX; a autorização é do backend.
 *  Memoizado por token: `accessTokenValido()`/`pode()` rodam em toda requisição
 *  HTTP e em cada item do menu — sem cache seriam atob+JSON.parse repetidos. */
let tokenCacheado: string | null = null;
let claimsCacheados: ClaimsJwt | null = null;

function decodificar(token: string): ClaimsJwt | null {
  if (token === tokenCacheado) return claimsCacheados;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as ClaimsJwt;
    tokenCacheado = token;
    claimsCacheados = claims;
    return claims;
  } catch {
    tokenCacheado = null;
    claimsCacheados = null;
    return null;
  }
}

export function claimsSessaoAtual(): {
  id: number | null;
  perfil: Perfil | null;
  emitidoEm: Date | null;
  expiraEm: Date | null;
  jti: string | null;
} {
  const t = accessToken();
  if (!t) {
    return { id: null, perfil: null, emitidoEm: null, expiraEm: null, jti: null };
  }
  const c = decodificar(t);
  if (!c) {
    return { id: null, perfil: null, emitidoEm: null, expiraEm: null, jti: null };
  }
  const id = Number(c.sub);
  return {
    id: Number.isFinite(id) ? id : null,
    perfil: PERFIS.includes(c.perfil as Perfil) ? (c.perfil as Perfil) : null,
    emitidoEm: typeof c.iat === "number" ? new Date(c.iat * 1000) : null,
    expiraEm: typeof c.exp === "number" ? new Date(c.exp * 1000) : null,
    jti: c.jti ?? null,
  };
}

export function accessToken(): string | null {
  return sessionStorage.getItem(KEY_ACCESS);
}

/** Verifica se o access_token existe, é staff e ainda não expirou (margem de 10s). */
export function accessTokenValido(): boolean {
  const t = accessToken();
  if (!t) return false;
  const c = decodificar(t);
  if (!c || c.tipo !== "staff") return false;
  if (typeof c.exp === "number" && c.exp * 1000 <= Date.now() + 10_000) {
    return false;
  }
  return true;
}

export function refreshToken(): string | null {
  return sessionStorage.getItem(KEY_REFRESH);
}

export function setTokens(t: Tokens): void {
  sessionStorage.setItem(KEY_ACCESS, t.access_token);
  sessionStorage.setItem(KEY_REFRESH, t.refresh_token);
  tokenCacheado = null;
  claimsCacheados = null;
  notify();
}

export function clearTokens(): void {
  sessionStorage.removeItem(KEY_ACCESS);
  sessionStorage.removeItem(KEY_REFRESH);
  notify();
}

export function staffAutenticado(): boolean {
  const t = accessToken();
  if (!t) return false;
  const c = decodificar(t);
  if (!c || c.tipo !== "staff") return false;
  // Se o access_token já expirou e também não há refresh_token válido, não está autenticado
  if (typeof c.exp === "number" && c.exp * 1000 <= Date.now() && !refreshToken()) {
    return false;
  }
  return true;
}

export function perfilAtual(): Perfil | null {
  const t = accessToken();
  if (!t) return null;
  const p = decodificar(t)?.perfil;
  return PERFIS.includes(p as Perfil) ? (p as Perfil) : null;
}

export function usuarioIdAtual(): number | null {
  const t = accessToken();
  if (!t) return null;
  const id = Number(decodificar(t)?.sub);
  return Number.isFinite(id) ? id : null;
}

export function pode(...perfis: Perfil[]): boolean {
  const p = perfilAtual();
  return p !== null && perfis.includes(p);
}

/** Listeners para a camada React reagir a login/logout/refresh. */
const listeners = new Set<() => void>();
export function onSessionChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(): void {
  listeners.forEach((fn) => fn());
}

/** POST /auth/staff/login — credenciais da equipe. */
export async function loginStaff(email: string, senha: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error("credenciais");
  setTokens((await res.json()) as Tokens);
}

/** POST /auth/refresh — usado pela fila de 401 do client HTTP. */
export async function refreshTokens(): Promise<boolean> {
  const refresh_token = sessionStorage.getItem(KEY_REFRESH);
  if (!refresh_token) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) throw new Error(String(res.status));
    setTokens((await res.json()) as Tokens);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/** POST /auth/logout — limpa local mesmo se a revogação falhar. */
export async function logoutStaff(): Promise<void> {
  const refresh_token = sessionStorage.getItem(KEY_REFRESH);
  if (refresh_token) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token }),
      });
    } catch {
      /* limpa local mesmo se a revogação falhar */
    }
  }
  clearTokens();
}
