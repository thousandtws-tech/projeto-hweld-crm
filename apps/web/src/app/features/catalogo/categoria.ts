import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogoService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { ItemCatalogoPortal, Pagina } from '../../core/models';
import { HwProductCard } from '../../shared/ui/product-card';
import { HwEmpty } from '../../shared/ui/empty';
import { HwSkeleton } from '../../shared/ui/skeleton';

/** S03 — Listagem por categoria (`/c/{id}-{slug}`). */
@Component({
  imports: [RouterLink, HwProductCard, HwSkeleton, HwEmpty],
  templateUrl: './categoria.html',
  styleUrl: './categoria.scss',
})
export class CategoriaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private catalogo = inject(CatalogoService);
  private rt = inject(RealtimeService);
  pagina = signal<Pagina<ItemCatalogoPortal> | null>(null);
  carregando = signal(true);
  nome = signal('');
  private categoriaId = 0;

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo.startsWith('catalogo.')) this.ir(this.pagina()?.pagina ?? 1);
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const idSlug = params.get('idslug') ?? '';
      this.categoriaId = Number(idSlug.split('-')[0]);
      this.nome.set(idSlug.split('-').slice(1).join(' '));
      this.ir(1);
    });
  }

  ir(pagina: number): void {
    this.carregando.set(true);
    this.catalogo
      .listar({ categoria_id: this.categoriaId, pagina, por_pagina: 24 })
      .then((p) => this.pagina.set(p))
      .catch(() => this.pagina.set(null))
      .finally(() => this.carregando.set(false));
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i + 1);
  }
}
