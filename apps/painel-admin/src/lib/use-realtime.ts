import { useEffect, useRef, useState } from "react";

import type { EventoRealtime } from "./models";
import { realtime } from "./realtime";

/** Status da conexão SSE (indicador "ao vivo" da topbar). */
export function useRealtimeStatus(): boolean {
  const [on, setOn] = useState(realtime.conectado);
  useEffect(() => realtime.subscribeStatus(setOn), []);
  return on;
}

/**
 * Reage a eventos realtime com coalescência no trailing edge (~400ms):
 * uma rajada de eventos que casa com `match` dispara `cb` UMA vez —
 * rajadas do backend (ex.: bulk-update de preços) viram um único
 * refetch em vez de N reloads paralelos. Todos os consumidores do app
 * usam este hook para reconciliação silenciosa, então o debounce é
 * embutido aqui e não em cada call site.
 * `tipos` aceita lista exata (`['pedido.criado']`) ou predicado
 * (`(t) => t.startsWith('orcamento.')`).
 */
export function useRealtimeEvent(
  match: string[] | ((tipo: string) => boolean),
  cb: (e: EventoRealtime) => void,
  atrasoMs = 400,
): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const matchRef = useRef(match);
  matchRef.current = match;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ultimoEvento: EventoRealtime | null = null;
    const unsubscribe = realtime.subscribe((e) => {
      const m = matchRef.current;
      if (typeof m === "function" ? !m(e.tipo) : !m.includes(e.tipo)) return;
      ultimoEvento = e;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        cbRef.current(ultimoEvento!);
      }, atrasoMs);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [atrasoMs]);
}
