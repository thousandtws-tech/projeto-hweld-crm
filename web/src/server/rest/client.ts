/**
 * Gateway REST do BFF — único ponto que fala HTTP com o backend Actix.
 * Executa somente no servidor Next.js (route handler); o token Bearer do
 * caller é propagado 1:1, sem persistência no BFF.
 */
import { GraphQLError } from "graphql";

import { serverEnv } from "@/server/env";
import type { ErroApiBody } from "@/server/rest/types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface RestRequest {
  method?: HttpMethod;
  path: string;
  query?: QueryParams;
  body?: unknown;
}

export type RestCall = <T>(req: RestRequest) => Promise<T>;

/** Erro da API traduzido para GraphQLError com extensions estruturadas. */
function toGraphQLError(status: number, body: ErroApiBody | null): GraphQLError {
  const erro = body?.erro;
  const codigo = erro?.codigo ?? (status === 401 ? "nao_autenticado" : "interno");
  return new GraphQLError(erro?.mensagem ?? `API respondeu HTTP ${status}`, {
    extensions: {
      code: codigo.toUpperCase(),
      httpStatus: status,
      ...(erro?.campos ? { campos: erro.campos } : {}),
    },
  });
}

/** Serializa query params ignorando `undefined`/`null`. */
function buildQuery(query?: QueryParams): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function createRestCall(token: string | null): RestCall {
  return async function call<T>({
    method = "GET",
    path,
    query,
    body,
  }: RestRequest): Promise<T> {
    const url = `${serverEnv.apiUrl}${path}${buildQuery(query)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(serverEnv.apiTimeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      const timeout =
        err instanceof DOMException && err.name === "TimeoutError";
      throw new GraphQLError(
        timeout ? "API excedeu o tempo limite" : "API indisponível",
        {
          extensions: {
            code: timeout ? "TIMEOUT" : "INDISPONIVEL",
            httpStatus: 503,
          },
          originalError: err instanceof Error ? err : undefined,
        },
      );
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ErroApiBody | null;
      throw toGraphQLError(response.status, body);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };
}
