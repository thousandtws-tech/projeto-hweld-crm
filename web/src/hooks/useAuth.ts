"use client";

import { useApolloClient } from "@apollo/client/react";
import { useCallback, useEffect, useState } from "react";

import {
  LoginPortalDocument,
  LoginStaffDocument,
  LogoutDocument,
  RefreshSessionDocument,
  TrocarSenhaDocument,
} from "@/graphql/generated/graphql";
import { clearTokens, getTokens, setTokens } from "@/lib/auth-tokens";

export interface LoginCredentials {
  email: string;
  senha: string;
}

export interface Sessao {
  accessToken: string;
  refreshToken: string;
  contato?: { id: string; nome: string; empresaId: string };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error("Erro inesperado");
}

export function useAuth() {
  const client = useApolloClient();
  const [user, setUser] = useState<Sessao | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokens = getTokens();
    if (tokens.access) {
      setUser({
        accessToken: tokens.access,
        refreshToken: tokens.refresh ?? "",
      });
    }
  }, []);

  const login = useCallback(
    async (tipo: "staff" | "portal", credentials: LoginCredentials) => {
      setLoading(true);
      setError(null);
      try {
        if (tipo === "staff") {
          const { data } = await client.mutate({
            mutation: LoginStaffDocument,
            variables: credentials,
          });
          const tokens = data?.loginStaff;
          if (!tokens) throw new Error("Resposta de login inválida");
          setTokens(tokens.accessToken, tokens.refreshToken);
          setUser({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          });
          return tokens;
        }
        const { data } = await client.mutate({
          mutation: LoginPortalDocument,
          variables: credentials,
        });
        const payload = data?.loginPortal;
        if (!payload) throw new Error("Resposta de login inválida");
        setTokens(payload.accessToken, payload.refreshToken);
        setUser({
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
          contato: payload.contato,
        });
        return payload;
      } catch (err) {
        const error = toError(err);
        setError(error.message || "Erro ao fazer login");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const signOut = useCallback(async () => {
    const { refresh } = getTokens();
    if (refresh) {
      await client
        .mutate({
          mutation: LogoutDocument,
          variables: { refreshToken: refresh },
        })
        .catch(() => {});
    }
    clearTokens();
    setUser(null);
    await client.clearStore().catch(() => {});
  }, [client]);

  const refresh = useCallback(async () => {
    const { refresh: refreshToken } = getTokens();
    if (!refreshToken) throw new Error("Refresh token ausente");
    try {
      const { data } = await client.mutate({
        mutation: RefreshSessionDocument,
        variables: { refreshToken },
      });
      const tokens = data?.refreshSession;
      if (!tokens) throw new Error("Resposta de refresh inválida");
      setTokens(tokens.accessToken, tokens.refreshToken);
      return tokens;
    } catch (err) {
      setUser(null);
      throw toError(err);
    }
  }, [client]);

  const updatePassword = useCallback(
    async (senhaAtual: string, novaSenha: string) => {
      await client.mutate({
        mutation: TrocarSenhaDocument,
        variables: { senhaAtual, novaSenha },
      });
    },
    [client],
  );

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user?.accessToken,
    login,
    signOut,
    refresh,
    updatePassword,
    clear: clearTokens,
  };
}
