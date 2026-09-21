import type { QueryParams, RestCall } from "@/server/rest/client";
import type {
  Pagina,
  PortalLoginResp,
  TokensResp,
  Usuario,
} from "@/server/rest/types";

export function createAuthApi(call: RestCall) {
  return {
    loginStaff: (body: { email: string; senha: string }) =>
      call<TokensResp>({ method: "POST", path: "/api/v1/auth/staff/login", body }),
    loginPortal: (body: { email: string; senha: string }) =>
      call<PortalLoginResp>({
        method: "POST",
        path: "/api/v1/auth/portal/login",
        body,
      }),
    refresh: (refresh_token: string) =>
      call<TokensResp>({
        method: "POST",
        path: "/api/v1/auth/refresh",
        body: { refresh_token },
      }),
    logout: (refresh_token: string) =>
      call<void>({
        method: "POST",
        path: "/api/v1/auth/logout",
        body: { refresh_token },
      }),
    trocarSenha: (body: { senha_atual: string; nova_senha: string }) =>
      call<void>({ method: "POST", path: "/api/v1/auth/senha", body }),
  };
}

export function createUsuariosApi(call: RestCall) {
  return {
    listar: (query: QueryParams) =>
      call<Pagina<Usuario>>({ path: "/api/v1/usuarios", query }),
    buscar: (id: string | number) =>
      call<Usuario>({ path: `/api/v1/usuarios/${id}` }),
    criar: (body: Record<string, unknown>) =>
      call<Usuario>({ method: "POST", path: "/api/v1/usuarios", body }),
    atualizar: (id: string | number, body: Record<string, unknown>) =>
      call<Usuario>({
        method: "PATCH",
        path: `/api/v1/usuarios/${id}`,
        body,
      }),
    definirAtivo: (id: string | number, ativo: boolean) =>
      call<void>({
        method: "PATCH",
        path: `/api/v1/usuarios/${id}/ativo`,
        body: { ativo },
      }),
  };
}
