import { Injectable, computed, inject, signal } from '@angular/core';
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

  /** Índice pai→filhas pré-computado: o mega-menu consulta O(1) por nó
   *  em vez de refiltrar a árvore inteira a cada binding do template. */
  private readonly filhasPorPai = computed(() => {
    const mapa = new Map<number, Categoria[]>();
    for (const c of this._categorias()) {
      if (c.categoria_pai_id == null) continue;
      const lista = mapa.get(c.categoria_pai_id);
      if (lista) lista.push(c);
      else mapa.set(c.categoria_pai_id, [c]);
    }
    return mapa;
  });

  constructor() {
    this.realtime.reagirA(
      (e) => e.tipo === 'catalogo.categorias',
      () => {
        this.carregamentoIniciado = false;
        this.carregar();
      },
    );
  }

  filhasDe(id: number): Categoria[] {
    return this.filhasPorPai().get(id) ?? [];
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
