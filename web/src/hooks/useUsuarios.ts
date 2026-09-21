"use client";

import { useCallback, useState } from "react";
import {
  ativarUsuario,
  atualizarUsuario,
  buscarUsuario,
  criarUsuario,
  listarUsuarios,
} from "@/services/usuarios";
import {
  AtualizarUsuarioRequest,
  CriarUsuarioRequest,
  ListarUsuariosFiltros,
  Paginacao,
  Usuario,
} from "@/types/usuario";

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Paginacao<Usuario> | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listar = useCallback(async (filtros: ListarUsuariosFiltros = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listarUsuarios(filtros);
      setUsuarios(data);
      return data;
    } catch (err) {
      setError((err as { message: string }).message || "Erro ao listar usuários");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const buscar = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await buscarUsuario(id);
      setUsuario(data);
      return data;
    } catch (err) {
      setError((err as { message: string }).message || "Erro ao buscar usuário");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const criar = useCallback(async (payload: CriarUsuarioRequest) => {
    setLoading(true);
    setError(null);
    try {
      return await criarUsuario(payload);
    } catch (err) {
      setError((err as { message: string }).message || "Erro ao criar usuário");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const atualizar = useCallback(async (id: number, payload: AtualizarUsuarioRequest) => {
    setLoading(true);
    setError(null);
    try {
      return await atualizarUsuario(id, payload);
    } catch (err) {
      setError((err as { message: string }).message || "Erro ao atualizar usuário");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const ativar = useCallback(async (id: number, ativo: boolean) => {
    setLoading(true);
    setError(null);
    try {
      return await ativarUsuario(id, ativo);
    } catch (err) {
      setError((err as { message: string }).message || "Erro ao alterar status");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

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
