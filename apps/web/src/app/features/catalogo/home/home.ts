import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogoService } from '../../../core/servicos';
import { RealtimeService } from '../../../core/realtime';
import { ItemCatalogoPortal } from '../../../core/models';
import { HwProductCard } from '../../../shared/ui/product-card';
import { HwEmpty } from '../../../shared/ui/empty';
import { HwSkeleton } from '../../../shared/ui/skeleton';
import { HwSliderPro } from './slider-pro';
import { HwTrustBar } from './sections/trust-bar';
import { HwCategoryGrid } from './sections/category-grid';
import { HwTrioBanners } from './sections/trio-banners';
import { HwStripBanner } from './sections/strip-banner';
import { HwDuoBanners } from './sections/duo-banners';
import { HwBrandsSlider } from './sections/brands-slider';
import { HwCorporateBanner } from './sections/corporate-banner';
import { HwNewsletterBanner } from './sections/newsletter-banner';

/** S02 — Home / Vitrine minimalista e profissional B2B */
@Component({
  imports: [
    RouterLink,
    HwProductCard,
    HwSkeleton,
    HwEmpty,
    HwSliderPro,
    HwTrustBar,
    HwCategoryGrid,
    HwTrioBanners,
    HwBrandsSlider,
    HwStripBanner,
    HwDuoBanners,
    HwCorporateBanner,
    HwNewsletterBanner,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage implements OnInit {
  private catalogo = inject(CatalogoService);
  private rt = inject(RealtimeService);
  itens = signal<ItemCatalogoPortal[]>([]);
  maisVendidos = signal<ItemCatalogoPortal[]>([]);
  carregando = signal(true);

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo.startsWith('catalogo.')) this.carregar();
    });
  }

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    Promise.all([
      this.catalogo.listar({ destaque: true, por_pagina: 5 }),
      this.catalogo.listar({ por_pagina: 10, pagina: 2 }),
    ])
      .then(([pDestaque, pMaisVendidos]) => {
        this.itens.set(pDestaque.itens);
        this.maisVendidos.set(pMaisVendidos.itens);
      })
      .catch(() => {
        this.catalogo
          .listar({ destaque: true, por_pagina: 5 })
          .then((p) => this.itens.set(p.itens))
          .catch(() => this.itens.set([]));
      })
      .finally(() => this.carregando.set(false));
  }
}
