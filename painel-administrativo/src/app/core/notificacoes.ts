import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from './servicos';
import { AuthStore } from './auth';
import { RealtimeService } from './realtime';
import { Notificacao, Pagina } from './models';

/**
 * Inbox do sino — badge é sempre o count autoritativo do servidor
 * (revalidado em cada `notificacao.nova`), nunca aritmética local.
 * A lista é mesclada por id (sem duplicar após reconexão do SSE).
 */
@Injectable({ providedIn: 'root' })
export class NotificacoesService {
  private api = inject(Api);
  private auth = inject(AuthStore);
  private rt = inject(RealtimeService);
  private router = inject(Router);

  readonly naoLidas = signal(0);
  readonly itens = signal<Notificacao[]>([]);
  readonly carregando = signal(false);

  constructor() {
    // Login/logout: carrega ou zera o inbox.
    effect(() => {
      if (this.auth.autenticado()) void this.atualizar();
      else {
        this.naoLidas.set(0);
        this.itens.set([]);
      }
    });
    // Push: notificação nova → badge e lista revalidam no servidor.
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo === 'notificacao.nova') void this.atualizar();
    });
  }

  async atualizar(): Promise<void> {
    this.carregando.set(true);
    try {
      const [count, pagina] = await Promise.all([
        firstValueFrom(this.api.get<{ total: number }>('notificacoes', 'nao-lidas')),
        firstValueFrom(this.api.lista<Notificacao>('notificacoes', { por_pagina: 15 })),
      ]);
      this.naoLidas.set(count.total);
      // Mescla por id — evento retransmitido nunca duplica linha.
      const vistos = new Set<number>();
      this.itens.set(pagina.itens.filter((n) => !vistos.has(n.id) && vistos.add(n.id)));
    } catch {
      /* sem badge melhor que badge errado — mantém o último estado */
    } finally {
      this.carregando.set(false);
    }
  }

  /** Clica numa notificação: marca lida e navega para o alvo interno. */
  async abrir(n: Notificacao): Promise<void> {
    if (!n.lida_em) {
      await firstValueFrom(
        this.api.postAcao('notificacoes', n.id, 'lida'),
      ).catch(() => {});
      this.naoLidas.update((v) => Math.max(0, v - 1));
      this.itens.update((l) =>
        l.map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)),
      );
    }
    if (n.link?.startsWith('/')) void this.router.navigateByUrl(n.link);
  }

  async marcarTodas(): Promise<void> {
    await firstValueFrom(this.api.post('notificacoes/ler-todas', {})).catch(() => {});
    this.naoLidas.set(0);
    this.itens.update((l) => l.map((x) => ({ ...x, lida_em: x.lida_em ?? new Date().toISOString() })));
  }
}

/** Tipo auxiliar para `Pagina` — só documenta o contrato. */
export type PaginaNotificacoes = Pagina<Notificacao>;
