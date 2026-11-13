import { REALTIME_URL } from "./config";
import type { EventoRealtime } from "./models";
import {
  accessToken,
  accessTokenValido,
  onSessionChange,
  refreshTokens,
  staffAutenticado,
} from "./session";

const RECONECTAR_PADRAO_MS = 3000;
const RECONECTAR_MAX_MS = 30_000;

/**
 * Cliente SSE do backoffice (`{realtimeUrl}/events/staff` — motor Phoenix). `EventSource` não envia
 * `Authorization`, então o stream é lido via `fetch` + `ReadableStream`.
 * Reconecta honrando o `retry:` do servidor (com teto) e aborta no logout.
 */
class RealtimeClient {
  private abort: AbortController | null = null;
  private retryMs = RECONECTAR_PADRAO_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private listeners = new Set<(e: EventoRealtime) => void>();
  private statusListeners = new Set<(on: boolean) => void>();
  private _conectado = false;

  get conectado(): boolean {
    return this._conectado;
  }

  /** Assina eventos — retorna unsubscribe. */
  subscribe(fn: (e: EventoRealtime) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeStatus(fn: (on: boolean) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setConectado(on: boolean): void {
    if (this._conectado === on) return;
    this._conectado = on;
    this.statusListeners.forEach((fn) => fn(on));
  }

  private emit(e: EventoRealtime): void {
    this.listeners.forEach((fn) => fn(e));
  }

  /** Chamado quando a sessão muda (login/logout/refresh). */
  sync(): void {
    if (staffAutenticado()) void this.conectar();
    else this.desconectar();
  }

  desconectar(): void {
    this.abort?.abort();
    this.abort = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.setConectado(false);
  }

  private async conectar(): Promise<void> {
    this.desconectar();
    const ctrl = new AbortController();
    this.abort = ctrl;
    if (!accessTokenValido()) {
      const ok = await refreshTokens();
      if (!ok || ctrl.signal.aborted) return;
    }
    const token = accessToken();
    if (!token) return;

    try {
      const res = await fetch(`${REALTIME_URL}/events/staff`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
      this.setConectado(true);
      this.retryMs = RECONECTAR_PADRAO_MS;
      await this.ler(res.body, ctrl.signal);
    } catch {
      /* abortado ou conexão caiu — reconecta abaixo */
    } finally {
      this.setConectado(false);
    }
    if (!ctrl.signal.aborted && staffAutenticado()) {
      this.timer = setTimeout(() => void this.conectar(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RECONECTAR_MAX_MS);
    }
  }

  /** Parser SSE incremental — frames separados por linha em branco. */
  private async ler(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          this.frame(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 2);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private frame(raw: string): void {
    let tipo = "message";
    const dados: string[] = [];
    for (const linha of raw.split("\n")) {
      if (linha.startsWith(":")) continue; // comentário/heartbeat
      if (linha.startsWith("event:")) tipo = linha.slice(6).trim();
      else if (linha.startsWith("data:")) dados.push(linha.slice(5).trimStart());
      else if (linha.startsWith("retry:")) {
        const ms = Number(linha.slice(6).trim());
        if (Number.isFinite(ms) && ms > 0) this.retryMs = ms;
      }
    }
    if (!dados.length) return;
    try {
      const parsed = JSON.parse(dados.join("\n")) as { tipo?: string; dados?: unknown };
      this.emit({
        tipo: parsed.tipo ?? tipo,
        dados: (parsed.dados as Record<string, unknown>) ?? {},
      });
    } catch {
      /* frame malformado — ignora */
    }
  }
}

export const realtime = new RealtimeClient();

// Liga/desliga o stream conforme a sessão staff.
onSessionChange(() => realtime.sync());
realtime.sync();

// Aba oculta pausa timers do browser — ao voltar, reconecta na hora em
// vez de esperar o restante do backoff exponencial.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && staffAutenticado() && !realtime.conectado) realtime.sync();
});
