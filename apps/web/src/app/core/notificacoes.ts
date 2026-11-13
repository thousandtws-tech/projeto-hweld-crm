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
    this.rt.reagirA(
      (e) => e.tipo === 'notificacao.nova',
      () => void this.atualizar(),
    );
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
      this.itens.set(
        pagina.itens.filter((n) => !n.lida_em && !vistos.has(n.id) && vistos.add(n.id)),
      );
    } catch {
      /* sem badge melhor que badge errado — mantém o último estado */
    } finally {
      this.carregando.set(false);
    }
  }

  /**
   * Clicar na notificação: marca como lida, remove automaticamente da lista
   * e navega direto para o destino (ex.: página do pedido).
   */
  async abrir(n: Notificacao): Promise<void> {
    void this.dispensar(n.id);
    if (n.link?.startsWith('/')) {
      void this.router.navigateByUrl(n.link);
    }
  }

  /** Marca como lida e remove imediatamente da lista do sino (sem navegar). */
  async dispensar(id: number, event?: Event): Promise<void> {
    event?.stopPropagation();
    const alvo = this.itens().find((x) => x.id === id);
    this.itens.update((l) => l.filter((x) => x.id !== id));
    if (alvo && !alvo.lida_em) {
      this.naoLidas.update((v) => Math.max(0, v - 1));
    }
    await firstValueFrom(this.http.post(`${api}/portal/notificacoes/${id}/lida`, {})).catch(
      () => {},
    );
  }

  /** Marca todas como lidas e remove todas da lista automaticamente. */
  async marcarTodas(): Promise<void> {
    this.naoLidas.set(0);
    this.itens.set([]);
    await firstValueFrom(this.http.post(`${api}/portal/notificacoes/ler-todas`, {})).catch(
      () => {},
    );
  }
}
