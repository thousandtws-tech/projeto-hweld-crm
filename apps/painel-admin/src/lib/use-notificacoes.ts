import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import type { Notificacao } from "./models";
import { notificacoesService } from "./services";
import { staffAutenticado } from "./session";
import { useRealtimeEvent } from "./use-realtime";

const KEY = ["notificacoes", "inbox"] as const;

type Inbox = { naoLidas: number; itens: Notificacao[] };

async function carregarInbox(): Promise<Inbox> {
  const [count, pagina] = await Promise.all([
    notificacoesService.naoLidas(),
    notificacoesService.listar({ por_pagina: 15 }),
  ]);
  // Mescla por id e mantém apenas notificações não lidas na bandeja (Inbox Zero)
  const vistos = new Set<number>();
  return {
    naoLidas: count.total,
    itens: pagina.itens.filter((n) => !n.lida_em && !vistos.has(n.id) && vistos.add(n.id)),
  };
}

/**
 * Inbox do sino — badge é sempre o count autoritativo do servidor
 * (revalidado em cada `notificacao.nova`), nunca aritmética local.
 * Cacheado via TanStack Query: o sino monta com o shell uma única vez
 * e a invalidação por SSE substitui o refetch manual por evento.
 */
export function useNotificacoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const autenticado = staffAutenticado();

  const query = useQuery({
    queryKey: KEY,
    queryFn: carregarInbox,
    enabled: autenticado,
    staleTime: 30_000,
  });

  // Push: notificação nova → badge e lista revalidam no servidor.
  useRealtimeEvent(
    ["notificacao.nova"],
    () => void queryClient.invalidateQueries({ queryKey: KEY }),
  );

  const setInbox = useCallback(
    (fn: (inbox: Inbox) => Inbox) =>
      queryClient.setQueryData<Inbox>(KEY, (old) => fn(old ?? { naoLidas: 0, itens: [] })),
    [queryClient],
  );

  /** Marca como lida e remove automaticamente da bandeja do sino. */
  const dispensar = useCallback(
    async (id: number) => {
      setInbox((inbox) => {
        const alvo = inbox.itens.find((x) => x.id === id);
        return {
          naoLidas: alvo && !alvo.lida_em ? Math.max(0, inbox.naoLidas - 1) : inbox.naoLidas,
          itens: inbox.itens.filter((x) => x.id !== id),
        };
      });
      await notificacoesService.marcarLida(id).catch(() => {});
    },
    [setInbox],
  );

  /** Clica numa notificação: marca como lida, remove da bandeja e navega direto para o registro. */
  const abrir = useCallback(
    async (n: Notificacao) => {
      void dispensar(n.id);
      if (n.link?.startsWith("/")) navigate({ to: n.link });
    },
    [dispensar, navigate],
  );

  const marcarTodas = useCallback(async () => {
    setInbox(() => ({ naoLidas: 0, itens: [] }));
    await notificacoesService.marcarTodas().catch(() => {});
  }, [setInbox]);

  const atualizar = useCallback(
    () => queryClient.invalidateQueries({ queryKey: KEY }),
    [queryClient],
  );

  return {
    naoLidas: autenticado ? (query.data?.naoLidas ?? 0) : 0,
    itens: autenticado ? (query.data?.itens ?? []) : [],
    carregando: query.isFetching,
    atualizar,
    abrir,
    dispensar,
    marcarTodas,
  };
}
