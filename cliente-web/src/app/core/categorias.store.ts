import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthStore } from './auth/auth.store';
import { CatalogoService } from './servicos';
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

  private _categorias = signal<Categoria[]>([]);
  private carregamentoIniciado = false;

  readonly categorias = this._categorias.asReadonly();
  readonly categoriasRaiz = computed(() => this._categorias().filter((c) => !c.categoria_pai_id));

  filhasDe(id: number): Categoria[] {
    return this._categorias().filter((c) => c.categoria_pai_id === id);
  }

  carregar(): void {
    if (this.carregamentoIniciado || !this.auth.autenticado()) return;
    this.carregamentoIniciado = true;
    this.catalogo
      .categorias()
      .then((c) => this._categorias.set(c))
      .catch(() => {
        this.carregamentoIniciado = false;
      });
  }
}
