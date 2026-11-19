import { API_URL, OPS_API_URL } from "./config";
import type { Pagina } from "./models";
import {
  accessToken,
  accessTokenValido,
  clearTokens,
  refreshToken,
  refreshTokens,
} from "./session";

export interface CampoErroApi {
  campo: string;
  mensagem: string;
}

export interface ErroDetalheApi {
  codigo: string;
  mensagem: string;
  campos?: CampoErroApi[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly campos: CampoErroApi[];

  constructor(status: number, message?: string, codigo = "erro_http", campos: CampoErroApi[] = []) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

/** Extrai a mensagem semântica do `ApiError` do backend ou retorna o fallback. */
export function msgErro(err: unknown, fallback = "Operação recusada pelo servidor."): string {
  if (err instanceof ApiError && err.message && !err.message.startsWith("HTTP ")) {
    return err.message;
  }
  return fallback;
}

export type Filtros = Record<string, string | number | boolean | undefined>;

function queryString(filtros: Filtros): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ---------------------------------------------------------------------------
 * Algoritmo 1: Single-Flight Token Refresh Queue (Coalescência de 401/Expiração)
 * ------------------------------------------------------------------------- */
let refreshing: Promise<boolean> | null = null;
function requestRefresh(): Promise<boolean> {
  refreshing ??= refreshTokens().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/* ---------------------------------------------------------------------------
 * Algoritmo 2: In-Flight GET Deduplication (Coalescência de Leitura Concorrente)
 * Se dois componentes pedirem o mesmo GET ao mesmo tempo, compartilham a mesma
 * Promise de rede, eliminando tráfego duplicado e rajadas no backend.
 * ------------------------------------------------------------------------- */
const inflightGets = new Map<string, Promise<unknown>>();

const isAuthCall = (path: string) =>
  path.includes("auth/staff/login") || path.includes("auth/refresh") || path.includes("auth/senha");

function goLogin(): void {
  clearTokens();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign("/login?expired=1");
  }
}

/** Lê e interpreta o envelope `{ erro: { codigo, mensagem, campos } }` do backend Rust. */
async function extrairApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { erro?: ErroDetalheApi };
    if (body?.erro) {
      const { codigo, mensagem, campos } = body.erro;
      const detalheCampos =
        campos && campos.length > 0
          ? ` (${campos.map((c) => `${c.campo}: ${c.mensagem}`).join(", ")})`
          : "";
      return new ApiError(res.status, `${mensagem}${detalheCampos}`, codigo, campos ?? []);
    }
  } catch {
    /* corpo vazio ou não-JSON */
  }
  return new ApiError(res.status);
}

/* ---------------------------------------------------------------------------
 * Algoritmo 3: Retry com Exponential Backoff + Full Jitter para falhas
 * transitórias de rede em leituras idempotentes (GET).
 * ------------------------------------------------------------------------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OpcoesRequest {
  params?: Filtros;
  body?: unknown;
  /** Bytes brutos (upload binário) — substitui `body` quando presente. */
  bytes?: BodyInit;
  /** Headers extras (ex.: metadados de upload via X-*). */
  headers?: Record<string, string>;
  /** Resposta binária (download de artefato) — devolve `Blob` em vez de JSON. */
  download?: boolean;
}

async function executeRequest<T>(
  method: string,
  urlCompleta: string,
  path: string,
  options: OpcoesRequest,
  retriedAuth = false,
  tentativaRede = 0,
): Promise<T> {
  if (!isAuthCall(path) && !retriedAuth && !accessTokenValido() && refreshToken()) {
    const ok = await requestRefresh();
    if (!ok) {
      goLogin();
      throw new ApiError(401, "Sessão expirada.", "nao_autenticado");
    }
  }

  const token = accessToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  Object.assign(headers, options.headers);
  if (token && !path.includes("auth/staff/login") && !path.includes("auth/refresh")) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(urlCompleta, {
      method,
      headers,
      body:
        options.bytes ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch (err) {
    // Falha de rede pura em leitura idempotente → até 2 retries com backoff + jitter
    if (method === "GET" && tentativaRede < 2) {
      const baseMs = 200 * 2 ** tentativaRede;
      const jitterMs = Math.floor(Math.random() * 120);
      await sleep(baseMs + jitterMs);
      return executeRequest<T>(method, urlCompleta, path, options, retriedAuth, tentativaRede + 1);
    }
    throw err;
  }

  if (res.status === 401 && !isAuthCall(path) && !retriedAuth) {
    const ok = await requestRefresh();
    if (!ok) {
      goLogin();
      throw new ApiError(401, "Sessão expirada.", "nao_autenticado");
    }
    return executeRequest<T>(method, urlCompleta, path, options, true, tentativaRede);
  }

  // 502 / 504 transitórios em GET
  if (method === "GET" && (res.status === 502 || res.status === 504) && tentativaRede < 2) {
    const baseMs = 250 * 2 ** tentativaRede;
    await sleep(baseMs);
    return executeRequest<T>(method, urlCompleta, path, options, retriedAuth, tentativaRede + 1);
  }

  if (!res.ok) throw await extrairApiError(res);
  if (res.status === 204) return undefined as T;
  if (options.download) return (await res.blob()) as T;
  return (await res.json()) as T;
}

/** Envelope de página do Spring Data (`Page<T>`) — distinto do `Pagina` do core-api. */
export interface PaginaSpring<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

function criarApi(base: string) {
  function request<T>(method: string, path: string, options: OpcoesRequest = {}): Promise<T> {
    const urlCompleta = `${base}/${path}${queryString(options.params ?? {})}`;

    if (method === "GET") {
      const existente = inflightGets.get(urlCompleta) as Promise<T> | undefined;
      if (existente) return existente;

      const promessa = executeRequest<T>(method, urlCompleta, path, options).finally(() => {
        inflightGets.delete(urlCompleta);
      });
      inflightGets.set(urlCompleta, promessa);
      return promessa;
    }

    return executeRequest<T>(method, urlCompleta, path, options);
  }

  return {
    lista<T>(recurso: string, filtros: Filtros = {}): Promise<Pagina<T>> {
      return request<Pagina<T>>("GET", recurso, { params: filtros });
    },
    /** Endpoints que devolvem array puro (ex.: `/categorias` retorna `T[]`, não `Pagina`). */
    listaArray<T>(recurso: string, filtros: Filtros = {}): Promise<T[]> {
      return request<T[]>("GET", recurso, { params: filtros });
    },
    /** Página Spring (`{content,totalElements,...}`) — operations-api Java. */
    pagina<T>(recurso: string, filtros: Filtros = {}): Promise<PaginaSpring<T>> {
      return request<PaginaSpring<T>>("GET", recurso, { params: filtros });
    },
    get<T>(recurso: string, id: number | string): Promise<T> {
      return request<T>("GET", `${recurso}/${id}`);
    },
    /** GET em recurso sem id (singletons, ex.: `/integracoes/spedy`). */
    getRecurso<T>(recurso: string): Promise<T> {
      return request<T>("GET", recurso);
    },
    post<T>(recurso: string, body: unknown): Promise<T> {
      return request<T>("POST", recurso, { body });
    },
    /** POST de bytes brutos com headers extras (ex.: certificado .pfx). */
    postBytes<T>(recurso: string, bytes: BodyInit, headers: Record<string, string>): Promise<T> {
      return request<T>("POST", recurso, { bytes, headers });
    },
    /** PUT em recurso sem id (singletons). */
    putRecurso<T>(recurso: string, body: unknown): Promise<T> {
      return request<T>("PUT", recurso, { body });
    },
    postAcao<T>(
      recurso: string,
      id: number | string,
      acao: string,
      body: unknown = {},
    ): Promise<T> {
      return request<T>("POST", `${recurso}/${id}/${acao}`, { body });
    },
    patchAcao<T>(
      recurso: string,
      id: number | string,
      acao: string,
      body: unknown = {},
    ): Promise<T> {
      return request<T>("PATCH", `${recurso}/${id}/${acao}`, { body });
    },
    put<T>(recurso: string, id: number | string, body: unknown): Promise<T> {
      return request<T>("PUT", `${recurso}/${id}`, { body });
    },
    patch<T>(recurso: string, id: number | string, body: unknown): Promise<T> {
      return request<T>("PATCH", `${recurso}/${id}`, { body });
    },
    del<T = void>(recurso: string, id?: number | string, sub?: string): Promise<T> {
      const path = id === undefined ? recurso : `${recurso}/${id}`;
      return request<T>("DELETE", `${path}${sub ? `/${sub}` : ""}`);
    },
    /** GET binário autenticado (XML/DANFE hospedados no object storage). */
    baixar(recurso: string): Promise<Blob> {
      return request<Blob>("GET", recurso, { download: true });
    },
    url(): string {
      return base;
    },
  };
}

/** API genérica — paginação server-side `{itens,total,pagina,por_pagina,total_paginas}`. */
export const api = criarApi(API_URL);

/**
 * hweld-operations-api (Java/Spring) — mesmo JWT do staff, mesmo envelope de
 * erro `{erro:{codigo,mensagem}}`. Nunca fala com o provedor fiscal: só com
 * os endpoints internos de orquestração.
 */
export const apiOps = criarApi(OPS_API_URL);
