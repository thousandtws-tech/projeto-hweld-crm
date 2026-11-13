import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogoService } from '../../core/servicos';
import { CategoriasStore } from '../../core/categorias.store';
import { RealtimeService } from '../../core/realtime';
import { Categoria, ItemCatalogoPortal, Pagina } from '../../core/models';
import { HwProductCard } from '../../shared/ui/product-card';
import { HwEmpty } from '../../shared/ui/empty';
import { HwSkeleton } from '../../shared/ui/skeleton';

/** S03 — Listagem por categoria (`/c/{id}-{slug}`). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HwProductCard, HwSkeleton, HwEmpty],
  templateUrl: './categoria.html',
  styleUrl: './categoria.scss',
})
export class CategoriaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private catalogo = inject(CatalogoService);
  private categoriasStore = inject(CategoriasStore);
  private rt = inject(RealtimeService);
  pagina = signal<Pagina<ItemCatalogoPortal> | null>(null);
  carregando = signal(true);
  private slugFallback = signal('');
  private categoriaIdSig = signal(0);

  readonly categoriaAtual = computed<Categoria | null>(
    () => this.categoriasStore.categorias().find((c) => c.id === this.categoriaIdSig()) ?? null,
  );

  readonly categoriaPai = computed<Categoria | null>(() => {
    const paiId = this.categoriaAtual()?.categoria_pai_id;
    if (!paiId) return null;
    return this.categoriasStore.categorias().find((c) => c.id === paiId) ?? null;
  });

  readonly subcategorias = computed<Categoria[]>(() =>
    this.categoriasStore.filhasDe(this.categoriaIdSig()),
  );

  readonly nome = computed(() => this.categoriaAtual()?.nome || this.slugFallback());

  constructor() {
    this.rt.reagirA(
      (e) => e.tipo.startsWith('catalogo.'),
      () => this.ir(this.pagina()?.pagina ?? 1, true),
    );
  }

  ngOnInit(): void {
    this.categoriasStore.carregar();
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const idSlug = params.get('idslug') ?? '';
      const id = Number(idSlug.split('-')[0]);
      this.categoriaIdSig.set(Number.isFinite(id) ? id : 0);
      this.slugFallback.set(idSlug.split('-').slice(1).join(' '));
      this.ir(1, false);
    });
  }

  ir(pagina: number, silencioso = false): void {
    if (!silencioso) {
      this.carregando.set(true);
    }
    this.catalogo
      .listar({ categoria_id: this.categoriaIdSig(), pagina, por_pagina: 24 })
      .then((p) => this.pagina.set(p))
      .catch(() => {
        if (!silencioso) this.pagina.set(null);
      })
      .finally(() => this.carregando.set(false));
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i + 1);
  }
}
