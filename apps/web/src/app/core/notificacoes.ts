import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthStore } from './auth/auth.store';
import { RealtimeService } from './realtime';
import { Notificacao, Pagina } from './models';

const api = environment.apiUrl;

/**
 * Inbox do sino do portal (`/portal/notificacoes`) — escopo resolvido pelo
 * token no backend. Badge = count autoritativo do servidor, revalidado a
 * cada `notificacao.nova`; lista mesclada por id (sem duplicar no reconnect).
 */
@Injectable({ providedIn: 'root' })
export class NotificacoesService {
  private http = inject(HttpClient);
  private auth = inject(AuthStore);
  private rt = inject(RealtimeService);
  private router = inject(Router);

  readonly naoLidas = signal(0);
  readonly itens = signal<Notificacao[]>([]);
  readonly carregando = signal(false);

  constructor() {
    effect(() => {
      if (this.auth.autenticado()) void this.atualizar();
      else {
        this.naoLidas.set(0);
        this.itens.set([]);
      }
    });
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo === 'notificacao.nova') void this.atualizar();
    });
  }

  async atualizar(): Promise<void> {
    if (!this.auth.autenticado()) return;
    this.carregando.set(true);
    try {
      const [count, pagina] = await Promise.all([
        firstValueFrom(this.http.get<{ total: number }>(`${api}/portal/notificacoes/nao-lidas`)),
        firstValueFrom(
          this.http.get<Pagina<Notificacao>>(`${api}/portal/notificacoes`, {
            params: { por_pagina: 15 },
          }),
        ),
      ]);
      this.naoLidas.set(count.total);
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
      await firstValueFrom(this.http.post(`${api}/portal/notificacoes/${n.id}/lida`, {})).catch(
        () => {},
      );
      this.naoLidas.update((v) => Math.max(0, v - 1));
      this.itens.update((l) =>
        l.map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)),
      );
    }
    if (n.link?.startsWith('/')) void this.router.navigateByUrl(n.link);
  }

  async marcarTodas(): Promise<void> {
    await firstValueFrom(this.http.post(`${api}/portal/notificacoes/ler-todas`, {})).catch(
      () => {},
    );
    this.naoLidas.set(0);
    this.itens.update((l) =>
      l.map((x) => ({ ...x, lida_em: x.lida_em ?? new Date().toISOString() })),
    );
  }
}
