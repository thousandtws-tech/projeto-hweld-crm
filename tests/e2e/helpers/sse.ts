/**
 * Leitor SSE mínimo sobre fetch streaming — o Playwright `request` não serve
 * aqui porque a resposta nunca termina. Node ≥18 entrega o body como stream.
 */

import { edgeHeaders } from "./env";

export interface EventoSSE {
  tipo: string;
  dados: unknown;
}

/**
 * Conecta num endpoint SSE e resolve no primeiro evento `event:` que satisfaz
 * `filtro` (ou no primeiro evento, se omitido). Rejeita em timeout/erro HTTP.
 * Chame `abort` no retorno para fechar — sempre dentro de try/finally no spec.
 */
export interface EscutaSSE {
  /** Resolve quando o stream está aberto (primeiros bytes lidos) — inscreva depois disso. */
  conectado: Promise<void>;
  evento: Promise<EventoSSE>;
  abort: () => void;
}

export function aguardarEventoSSE(
  url: string,
  opts: { token?: string; tipo?: string; timeoutMs?: number; casar?: (e: EventoSSE) => boolean },
): EscutaSSE {
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let marcarConectado!: () => void;
  const conectado = new Promise<void>((res) => (marcarConectado = res));

  const evento = new Promise<EventoSSE>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      ctrl.abort();
      rejectPromise(new Error(`SSE: timeout de ${timeoutMs}ms sem evento em ${url}`));
    }, timeoutMs);

    fetch(url, {
      headers: {
        accept: "text/event-stream",
        ...edgeHeaders(),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      signal: ctrl.signal,
    })
      .then(async (resp) => {
        if (!resp.ok || !resp.body) {
          clearTimeout(timer);
          rejectPromise(new Error(`SSE: ${url} respondeu ${resp.status}`));
          return;
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let tipoAtual = "message";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) throw new Error("SSE: stream encerrado pelo servidor");
          buffer += decoder.decode(value, { stream: true });
          marcarConectado(); // saudação `: hweld-realtime` já chegou — subscribe ativo

          // Quadros SSE são separados por linha em branco.
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const quadro = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            let data = "";
            for (const linha of quadro.split("\n")) {
              if (linha.startsWith(":") || linha.startsWith("retry:")) continue;
              if (linha.startsWith("event:")) tipoAtual = linha.slice(6).trim();
              if (linha.startsWith("data:")) data += linha.slice(5).trim();
            }
            if (!data) continue;
            // Frame do motor: `event: {tipo}` + `data: {"tipo":..,"dados":..}` —
            // normaliza para {tipo, dados} do envelope, não o objeto inteiro.
            const parsed = tryJson(data);
            const ev: EventoSSE =
              parsed !== null && typeof parsed === "object" && "tipo" in parsed
                ? {
                    tipo: (parsed as { tipo: string }).tipo,
                    dados: (parsed as Record<string, unknown>).dados,
                  }
                : { tipo: tipoAtual, dados: parsed };
            const casa = opts.casar ? opts.casar(ev) : !opts.tipo || ev.tipo === opts.tipo;
            if (casa) {
              clearTimeout(timer);
              ctrl.abort();
              resolvePromise(ev);
              return;
            }
          }
        }
      })
      .catch((e) => {
        clearTimeout(timer);
        if ((e as Error).name === "AbortError") return; // abort manual — já resolvido/rejeitado
        rejectPromise(e);
      });
  });

  return { conectado, evento, abort: () => ctrl.abort() };
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
