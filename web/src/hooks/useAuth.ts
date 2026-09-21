"use client";

import { useState, useCallback, useEffect } from "react";
import {
  changePassword,
  clearTokens,
  getTokens,
  loginPortal,
  loginStaff,
  logout,
  refreshSession,
} from "@/services/auth";
import { LoginCredentials } from "@/types/auth";

type User = {
  access_token: string;
  refresh_token: string;
  contato?: { id: number; nome: string; empresa_id: number };
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokens = getTokens();
    if (tokens.access) {
      setUser({ access_token: tokens.access, refresh_token: tokens.refresh ?? "" });
    }
  }, []);

  const login = useCallback(async (tipo: "staff" | "portal", credentials: LoginCredentials) => {
    setLoading(true);
    setError(null);
    try {
      if (tipo === "staff") {
        const data = await loginStaff(credentials);
        setUser({ access_token: data.access_token, refresh_token: data.refresh_token });
        return data;
      }
      const data = await loginPortal(credentials);
      setUser({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        contato: data.contato,
      });
      return data;
    } catch (err) {
      setError((err as { message: string }).message || "Erro ao fazer login");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      return await refreshSession();
    } catch (err) {
      setUser(null);
      throw err;
    }
  }, []);

  const updatePassword = useCallback(
    async (senhaAtual: string, senhaNova: string) => {
      await changePassword({ senha_atual: senhaAtual, nova_senha: senhaNova });
    },
    []
  );

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user?.access_token,
    login,
    signOut,
    refresh,
    updatePassword,
    clear: clearTokens,
  };
}
