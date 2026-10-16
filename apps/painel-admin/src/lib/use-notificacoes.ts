import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import type { Notificacao } from "./models";
import { notificacoesService } from "./services";
import { staffAutenticado, onSessionChange } from "./session";
import { useRealtimeEvent } from "./use-realtime";

/**
 * Inbox do sino — badge é sempre o count autoritativo do servidor
 * (revalidado em cada `notificacao.nova`), nunca aritmética local.
 * A lista é mesclada por id (sem duplicar após reconexão do SSE).
 */
export function useNotificacoes() {
  const navigate = useNavigate();
  const [naoLidas, setNaoLidas] = useState(0);
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback(async () => {
    setCarregando(true);
    try {
      const [count, pagina] = await Promise.all([
        notificacoesService.naoLidas(),
        notificacoesService.listar({ por_pagina: 15 }),
      ]);
      setNaoLidas(count.total);
      // Mescla por id e mantém apenas notificações não lidas na bandeja (Inbox Zero)
      const vistos = new Set<number>();
      setItens(
        pagina.itens.filter((n) => !n.lida_em && !vistos.has(n.id) && vistos.add(n.id)),
      );
    } catch {
      /* sem badge melhor que badge errado — mantém o último estado */
    } finally {
      setCarregando(false);
    }
  }, []);

  // Login/logout: carrega ou zera o inbox.
  useEffect(() => {
    const sync = () => {
      if (staffAutenticado()) void atualizar();
      else {
        setNaoLidas(0);
        setItens([]);
      }
    };
    sync();
    return onSessionChange(sync);
  }, [atualizar]);

  // Push: notificação nova → badge e lista revalidam no servidor.
  useRealtimeEvent(["notificacao.nova"], () => void atualizar());

  /** Marca como lida e remove automaticamente da bandeja do sino. */
  const dispensar = useCallback(async (id: number) => {
    setItens((l) => {
      const alvo = l.find((x) => x.id === id);
      if (alvo && !alvo.lida_em) {
        setNaoLidas((v) => Math.max(0, v - 1));
      }
      return l.filter((x) => x.id !== id);
    });
    await notificacoesService.marcarLida(id).catch(() => {});
  }, []);

  /** Clica numa notificação: marca como lida, remove da bandeja e navega direto para o registro. */
  const abrir = useCallback(
    async (n: Notificacao) => {
      void dispensar(n.id);
      if (n.link?.startsWith("/")) navigate({ to: n.link });
    },
    [dispensar, navigate],
  );

  const marcarTodas = useCallback(async () => {
    setNaoLidas(0);
    setItens([]);
    await notificacoesService.marcarTodas().catch(() => {});
  }, []);

  return {
    naoLidas,
    itens,
    carregando,
    atualizar,
    abrir,
    dispensar,
    marcarTodas,
  };
}
