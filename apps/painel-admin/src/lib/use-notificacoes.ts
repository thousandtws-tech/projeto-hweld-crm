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
      // Mescla por id — evento retransmitido nunca duplica linha.
      const vistos = new Set<number>();
      setItens(pagina.itens.filter((n) => !vistos.has(n.id) && vistos.add(n.id)));
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

  /** Clica numa notificação: marca lida e navega para o alvo interno. */
  const abrir = useCallback(
    async (n: Notificacao) => {
      if (!n.lida_em) {
        await notificacoesService.marcarLida(n.id).catch(() => {});
        setNaoLidas((v) => Math.max(0, v - 1));
        setItens((l) =>
          l.map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)),
        );
      }
      if (n.link?.startsWith("/")) navigate({ to: n.link });
    },
    [navigate],
  );

  const marcarTodas = useCallback(async () => {
    await notificacoesService.marcarTodas().catch(() => {});
    setNaoLidas(0);
    setItens((l) => l.map((x) => ({ ...x, lida_em: x.lida_em ?? new Date().toISOString() })));
  }, []);

  return { naoLidas, itens, carregando, atualizar, abrir, marcarTodas };
}
