import {
  DestroyRef,
  Injectable,
  NgZone,
  OnDestroy,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
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
 * Cliente SSE do portal (`{realtimeUrl}/events/portal` — motor Phoenix) — recebe só eventos da própria
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
      // Reconecta quando o estado de autenticação muda (alterna entre /events/publico e /events/portal)
      this.auth.autenticado();
      void this.conectar();
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

  /**
   * SSE → reconcile coalesced: uma rajada de eventos vira UMA chamada a `fn`
   * no trailing edge (~300ms). Ex.: bulk-update de preços do admin emite N
   * frames `catalogo.precos` — sem coalescer seriam N refetches paralelos.
   * O predicado roda em `untracked`: pode ler signals do consumidor sem
   * criar dependências no effect interno. Chamar em injection context.
   */
  reagirA(corresponder: (e: EventoRealtime) => boolean, fn: () => void, atrasoMs = 300): void {
    const destroyRef = inject(DestroyRef);
    let timer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const e = this.ultimo();
      if (!e || !untracked(() => corresponder(e))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, atrasoMs);
    });
    destroyRef.onDestroy(() => {
      if (timer) clearTimeout(timer);
    });
  }

  private async conectar(): Promise<void> {
    this.desconectar();
    const token = this.auth.accessToken();
    const endpoint = token ? 'events/portal' : 'events/publico';
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const ctrl = new AbortController();
    this.abort = ctrl;
    // Loop de leitura do stream fora da zona: cada chunk de rede que chega
    // resolveria um microtask dentro do Angular e dispararia CD global.
    // Apenas frame() reentra na zona via zone.run() ao emitir o evento.
    await this.zone.runOutsideAngular(async () => {
      try {
        const res = await fetch(`${environment.realtimeUrl}/${endpoint}`, {
          headers,
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
    });
    if (!ctrl.signal.aborted) {
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
      const parsed = JSON.parse(dados.join('\n')) as {
        tipo?: string;
        dados?: Record<string, unknown>;
      };
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
