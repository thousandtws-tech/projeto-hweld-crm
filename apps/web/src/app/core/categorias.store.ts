import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthStore } from './auth/auth.store';
import { CatalogoService } from './servicos';
import { RealtimeService } from './realtime';
import { Categoria } from './models';

/**
 * Store compartilhado da árvore de categorias do catálogo.
 * Carrega sob demanda (apenas autenticado) e deduplica a requisição
 * entre os consumidores do layout (menu desktop e bottom-nav mobile).
 */
@Injectable({ providedIn: 'root' })
export class CategoriasStore {
  private catalogo = inject(CatalogoService);
  private auth = inject(AuthStore);
  private realtime = inject(RealtimeService);

  private _categorias = signal<Categoria[]>([]);
  private carregamentoIniciado = false;

  readonly categorias = this._categorias.asReadonly();
  /** Raízes = sem pai OU órfãs (pai inativo/ausente na lista — não podem sumir do menu). */
  readonly categoriasRaiz = computed(() => {
    const todas = this._categorias();
    const ids = new Set(todas.map((c) => c.id));
    return todas.filter((c) => !c.categoria_pai_id || !ids.has(c.categoria_pai_id));
  });

  constructor() {
    effect(() => {
      if (this.realtime.ultimo()?.tipo === 'catalogo.categorias') {
        this.carregamentoIniciado = false;
        this.carregar();
      }
    });
  }

  filhasDe(id: number): Categoria[] {
    return this._categorias().filter((c) => c.categoria_pai_id === id);
  }

  carregar(): void {
    if (this.carregamentoIniciado) return;
    this.carregamentoIniciado = true;
    this.catalogo
      .categorias()
      .then((c) => this._categorias.set(c))
      .catch(() => {
        this.carregamentoIniciado = false;
      });
  }
}
