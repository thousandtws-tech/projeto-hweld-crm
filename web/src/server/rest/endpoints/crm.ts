import type { RestCall, QueryParams } from "@/server/rest/client";
import type {
  Contato,
  Empresa,
  Endereco,
  Interacao,
  Oportunidade,
  Pagina,
} from "@/server/rest/types";

export function createCrmApi(call: RestCall) {
  return {
    empresas: {
      listar: (query: QueryParams) =>
        call<Pagina<Empresa>>({ path: "/api/v1/empresas", query }),
      buscar: (id: string | number) =>
        call<Empresa>({ path: `/api/v1/empresas/${id}` }),
      criar: (body: Record<string, unknown>) =>
        call<Empresa>({ method: "POST", path: "/api/v1/empresas", body }),
      atualizar: (id: string | number, body: Record<string, unknown>) =>
        call<Empresa>({
          method: "PATCH",
          path: `/api/v1/empresas/${id}`,
          body,
        }),
      arquivar: (id: string | number) =>
        call<void>({ method: "DELETE", path: `/api/v1/empresas/${id}` }),
    },
    contatos: {
      listar: (query: QueryParams) =>
        call<Pagina<Contato>>({ path: "/api/v1/contatos", query }),
      buscar: (id: string | number) =>
        call<Contato>({ path: `/api/v1/contatos/${id}` }),
      criar: (body: Record<string, unknown>) =>
        call<Contato>({ method: "POST", path: "/api/v1/contatos", body }),
      atualizar: (id: string | number, body: Record<string, unknown>) =>
        call<Contato>({
          method: "PATCH",
          path: `/api/v1/contatos/${id}`,
          body,
        }),
      ativarPortal: (id: string | number, senha: string) =>
        call<void>({
          method: "POST",
          path: `/api/v1/contatos/${id}/portal`,
          body: { senha },
        }),
      desativarPortal: (id: string | number) =>
        call<void>({
          method: "DELETE",
          path: `/api/v1/contatos/${id}/portal`,
        }),
      arquivar: (id: string | number) =>
        call<void>({ method: "DELETE", path: `/api/v1/contatos/${id}` }),
    },
    enderecos: {
      listar: (empresaId: string | number, tipo?: string) =>
        call<Endereco[]>({
          path: `/api/v1/empresas/${empresaId}/enderecos`,
          query: { tipo },
        }),
      criar: (body: Record<string, unknown>) =>
        call<Endereco>({ method: "POST", path: "/api/v1/enderecos", body }),
      atualizar: (id: string | number, body: Record<string, unknown>) =>
        call<Endereco>({
          method: "PATCH",
          path: `/api/v1/enderecos/${id}`,
          body,
        }),
      remover: (id: string | number) =>
        call<void>({ method: "DELETE", path: `/api/v1/enderecos/${id}` }),
    },
    oportunidades: {
      listar: (query: QueryParams) =>
        call<Pagina<Oportunidade>>({
          path: "/api/v1/oportunidades",
          query,
        }),
      buscar: (id: string | number) =>
        call<Oportunidade>({ path: `/api/v1/oportunidades/${id}` }),
      criar: (body: Record<string, unknown>) =>
        call<Oportunidade>({
          method: "POST",
          path: "/api/v1/oportunidades",
          body,
        }),
      atualizar: (id: string | number, body: Record<string, unknown>) =>
        call<Oportunidade>({
          method: "PATCH",
          path: `/api/v1/oportunidades/${id}`,
          body,
        }),
      moverEstagio: (id: string | number, body: Record<string, unknown>) =>
        call<Oportunidade>({
          method: "PATCH",
          path: `/api/v1/oportunidades/${id}/estagio`,
          body,
        }),
    },
    interacoes: {
      timeline: (query: QueryParams) =>
        call<Pagina<Interacao>>({ path: "/api/v1/interacoes", query }),
      registrar: (body: Record<string, unknown>) =>
        call<Interacao>({ method: "POST", path: "/api/v1/interacoes", body }),
    },
  };
}
