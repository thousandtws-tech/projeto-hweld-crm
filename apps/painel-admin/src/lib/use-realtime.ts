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
 * Reage a eventos realtime. `tipos` aceita lista exata (`['pedido.criado']`)
 * ou predicado (`(t) => t.startsWith('orcamento.')`).
 */
export function useRealtimeEvent(
  match: string[] | ((tipo: string) => boolean),
  cb: (e: EventoRealtime) => void,
): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const matchRef = useRef(match);
  matchRef.current = match;

  useEffect(
    () =>
      realtime.subscribe((e) => {
        const m = matchRef.current;
        if (typeof m === "function" ? m(e.tipo) : m.includes(e.tipo)) cbRef.current(e);
      }),
    [],
  );
}
