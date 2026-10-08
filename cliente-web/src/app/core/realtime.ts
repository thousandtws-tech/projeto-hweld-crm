import { Injectable, NgZone, OnDestroy, effect, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthStore } from './auth/auth.store';
import { ToastService } from '../shared/ui/toast';

export interface EventoRealtime {
  tipo: string;
  dados: Record<string, unknown>;
}

const RECONECTAR_PADRAO_MS = 3000;
const RECONECTAR_MAX_MS = 30_000;

/**
 * Cliente SSE do portal (`/realtime/portal`) — recebe só eventos da própria
 * empresa + públicos (o backend filtra). `EventSource` não envia
 * `Authorization`, então o stream é lido via `fetch` + `ReadableStream`;
 * reconecta honrando o `retry:` do servidor e aborta no logout.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private zone = inject(NgZone);

  /** Último evento — páginas reagem via `effect` (ex.: recarregar catálogo). */
  readonly ultimo = signal<EventoRealtime | null>(null);
  readonly conectado = signal(false);

  private abort: AbortController | null = null;
  private retryMs = RECONECTAR_PADRAO_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.auth.autenticado()) void this.conectar();
      else this.desconectar();
    });
  }

  ngOnDestroy(): void {
    this.desconectar();
  }

  private desconectar(): void {
    this.abort?.abort();
    this.abort = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.conectado.set(false);
  }

  private async conectar(): Promise<void> {
    this.desconectar();
    const token = this.auth.accessToken();
    if (!token) return;

    const ctrl = new AbortController();
    this.abort = ctrl;
    try {
      const res = await fetch(`${environment.apiUrl}/realtime/portal`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
      this.conectado.set(true);
      this.retryMs = RECONECTAR_PADRAO_MS;
      await this.ler(res.body, ctrl.signal);
    } catch {
      /* abortado ou conexão caiu — reconecta abaixo */
    } finally {
      this.conectado.set(false);
    }
    if (!ctrl.signal.aborted && this.auth.autenticado()) {
      this.timer = setTimeout(() => void this.conectar(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RECONECTAR_MAX_MS);
    }
  }

  private async ler(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          this.frame(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 2);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private frame(raw: string): void {
    let tipo = 'message';
    const dados: string[] = [];
    for (const linha of raw.split('\n')) {
      if (linha.startsWith(':')) continue;
      if (linha.startsWith('event:')) tipo = linha.slice(6).trim();
      else if (linha.startsWith('data:')) dados.push(linha.slice(5).trimStart());
      else if (linha.startsWith('retry:')) {
        const ms = Number(linha.slice(6).trim());
        if (Number.isFinite(ms) && ms > 0) this.retryMs = ms;
      }
    }
    if (!dados.length) return;
    try {
      const parsed = JSON.parse(dados.join('\n')) as { tipo?: string; dados?: Record<string, unknown> };
      const evento: EventoRealtime = { tipo: parsed.tipo ?? tipo, dados: parsed.dados ?? {} };
      this.zone.run(() => {
        this.ultimo.set(evento);
        this.notificar(evento);
      });
    } catch {
      /* frame malformado — ignora */
    }
  }

  /** Toast só para `notificacao.nova` — os demais eventos servem de gatilho
   *  de reconciliação REST nas páginas (evita duplicar o sino). */
  private notificar(e: EventoRealtime): void {
    if (e.tipo === 'notificacao.nova') {
      this.toast.mostrar('info', String(e.dados['titulo'] ?? 'Nova notificação.'));
    }
  }
}
