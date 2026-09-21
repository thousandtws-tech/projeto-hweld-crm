"use client";

import { useApolloClient } from "@apollo/client/react";
import { useCallback, useState } from "react";

import {
  AtualizarUsuarioDocument,
  CriarUsuarioDocument,
  DefinirUsuarioAtivoDocument,
  UsuarioDocument,
  UsuariosDocument,
  type AtualizarUsuarioInput,
  type CriarUsuarioInput,
  type UsuariosQueryVariables,
  type UsuarioFieldsFragment,
  type UsuariosQuery,
} from "@/graphql/generated/graphql";

export type ListarUsuariosFiltros = UsuariosQueryVariables;
export type Usuario = UsuarioFieldsFragment;
export type UsuarioPagina = UsuariosQuery["usuarios"];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message || fallback : fallback;
}

/** Administração de usuários staff via GraphQL (somente Perfil.admin). */
export function useUsuarios() {
  const client = useApolloClient();
  const [usuarios, setUsuarios] = useState<UsuarioPagina | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>, fallback: string): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        setError(errorMessage(err, fallback));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const listar = useCallback(
    (filtros: ListarUsuariosFiltros = {}) =>
      withLoading(async () => {
        const { data } = await client.query({
          query: UsuariosDocument,
          variables: filtros,
          fetchPolicy: "network-only",
        });
        setUsuarios(data.usuarios);
        return data.usuarios;
      }, "Erro ao listar usuários"),
    [client, withLoading],
  );

  const buscar = useCallback(
    (id: string | number) =>
      withLoading(async () => {
        const { data } = await client.query({
          query: UsuarioDocument,
          variables: { id },
          fetchPolicy: "network-only",
        });
        setUsuario(data.usuario ?? null);
        return data.usuario;
      }, "Erro ao buscar usuário"),
    [client, withLoading],
  );

  const criar = useCallback(
    (input: CriarUsuarioInput) =>
      withLoading(async () => {
        const { data } = await client.mutate({
          mutation: CriarUsuarioDocument,
          variables: { input },
        });
        return data?.criarUsuario;
      }, "Erro ao criar usuário"),
    [client, withLoading],
  );

  const atualizar = useCallback(
    (id: string | number, input: AtualizarUsuarioInput) =>
      withLoading(async () => {
        const { data } = await client.mutate({
          mutation: AtualizarUsuarioDocument,
          variables: { id, input },
        });
        return data?.atualizarUsuario;
      }, "Erro ao atualizar usuário"),
    [client, withLoading],
  );

  const ativar = useCallback(
    (id: string | number, ativo: boolean) =>
      withLoading(async () => {
        await client.mutate({
          mutation: DefinirUsuarioAtivoDocument,
          variables: { id, ativo },
        });
      }, "Erro ao alterar status"),
    [client, withLoading],
  );

  return {
    usuarios,
    usuario,
    loading,
    error,
    listar,
    buscar,
    criar,
    atualizar,
    ativar,
  };
}
