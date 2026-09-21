/**
 * Contexto GraphQL por request — carrega o Bearer token do caller e o
 * gateway REST já vinculado a ele. O BFF não persiste sessão: o token é
 * apenas repassado ao backend Actix.
 */
import { createRestApi, type RestApi } from "@/server/rest";

export interface GraphQLContext {
  token: string | null;
  api: RestApi;
}

export function buildContext(request: Request): GraphQLContext {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return { token, api: createRestApi(token) };
}
