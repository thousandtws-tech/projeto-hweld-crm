import { apiFetch } from "@/lib/api";
import {
  AtivarUsuarioRequest,
  AtualizarUsuarioRequest,
  CriarUsuarioRequest,
  ListarUsuariosFiltros,
  Paginacao,
  Usuario,
} from "@/types/usuario";

function buildQueryString(filtros: ListarUsuariosFiltros): string {
  const params = new URLSearchParams();
  if (filtros.pagina !== undefined) params.set("pagina", String(filtros.pagina));
  if (filtros.por_pagina !== undefined) params.set("por_pagina", String(filtros.por_pagina));
  if (filtros.perfil) params.set("perfil", filtros.perfil);
  if (filtros.ativo !== undefined) params.set("ativo", String(filtros.ativo));
  if (filtros.busca) params.set("busca", filtros.busca);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listarUsuarios(
  filtros: ListarUsuariosFiltros = {}
): Promise<Paginacao<Usuario>> {
  return apiFetch<Paginacao<Usuario>>(`/api/v1/usuarios${buildQueryString(filtros)}`);
}

export async function criarUsuario(payload: CriarUsuarioRequest): Promise<Usuario> {
  return apiFetch<Usuario>("/api/v1/usuarios", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function buscarUsuario(id: number): Promise<Usuario> {
  return apiFetch<Usuario>(`/api/v1/usuarios/${id}`);
}

export async function atualizarUsuario(
  id: number,
  payload: AtualizarUsuarioRequest
): Promise<Usuario> {
  return apiFetch<Usuario>(`/api/v1/usuarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function ativarUsuario(id: number, ativo: boolean): Promise<void> {
  return apiFetch<void>(`/api/v1/usuarios/${id}/ativo`, {
    method: "PATCH",
    body: JSON.stringify({ ativo } satisfies AtivarUsuarioRequest),
  });
}
