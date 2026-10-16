import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
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

const SLOTS_DESTAQUES = 5;
const SLOTS_MAIS_VENDIDOS = 10;

/** Tem pelo menos uma imagem válida cadastrada no produto. */
function temImagemValida(p: ItemCatalogoPortal): boolean {
  return Array.isArray(p.imagens) && p.imagens.some((img) => Boolean(img.url?.trim()));
}

/**
 * Score de merchandising de grandes lojas virtuais (Amazon / Mercado Livre / Grainger):
 * 1. Imagem cadastrada é pré-requisito de vitrine (+1000).
 * 2. Flag `destaque` (curadoria manual do admin) (+500).
 * 3. Galeria rica (múltiplas fotos) (+40).
 * 4. Metadados preenchidos (marca, descrição curta) (+25 cada).
 */
function scoreVitrine(p: ItemCatalogoPortal): number {
  let s = 0;
  if (temImagemValida(p)) s += 1000;
  if (p.destaque) s += 500;
  if ((p.imagens?.length ?? 0) > 1) s += 40;
  if (p.marca) s += 25;
  if (p.descricao_curta) s += 25;
  return s;
}

/**
 * Intercala produtos por `categoria_id` (round-robin sobre buckets já ordenados por score)
 * para garantir diversidade de categorias na vitrine antes de repetir a mesma categoria.
 */
function diversificarPorCategoria(lista: ItemCatalogoPortal[]): ItemCatalogoPortal[] {
  const ordenados = [...lista].sort((a, b) => scoreVitrine(b) - scoreVitrine(a) || b.id - a.id);
  const buckets = new Map<number, ItemCatalogoPortal[]>();
  for (const item of ordenados) {
    const fila = buckets.get(item.categoria_id) ?? [];
    fila.push(item);
    buckets.set(item.categoria_id, fila);
  }
  const resultado: ItemCatalogoPortal[] = [];
  let adicionou = true;
  while (adicionou) {
    adicionou = false;
    for (const fila of buckets.values()) {
      const proximo = fila.shift();
      if (proximo) {
        resultado.push(proximo);
        adicionou = true;
      }
    }
  }
  return resultado;
}

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
      if (e?.tipo.startsWith('catalogo.')) {
        untracked(() => this.carregar(true));
      }
    });
  }

  ngOnInit(): void {
    this.carregar(false);
  }

  private carregar(silencioso = false): void {
    if (!silencioso && this.itens().length === 0) {
      this.carregando.set(true);
    }

    this.catalogo
      .listar({ por_pagina: 50, pagina: 1 })
      .then((pagina) => {
        // Prioriza produtos com imagem cadastrada; só usa sem imagem se não houver suficientes
        const comImagem = pagina.itens.filter(temImagemValida);
        const semImagem = pagina.itens.filter((p) => !temImagemValida(p));

        const destaquesComImg = diversificarPorCategoria(comImagem.filter((p) => p.destaque));
        const demaisComImg = diversificarPorCategoria(comImagem.filter((p) => !p.destaque));
        const poolOrdenado = [...destaquesComImg, ...demaisComImg, ...semImagem];

        // Vitrine 1: Produtos em Destaque (completa os 5 slots com produtos com foto se houver poucos destaques)
        const vitrineDestaques = poolOrdenado.slice(0, SLOTS_DESTAQUES);
        const idsUsados = new Set(vitrineDestaques.map((p) => p.id));

        // Vitrine 2: Mais Vendidos & Suprimentos (sem duplicar itens da Vitrine 1, priorizando com foto)
        const vitrineMaisVendidos = poolOrdenado
          .filter((p) => !idsUsados.has(p.id))
          .slice(0, SLOTS_MAIS_VENDIDOS);

        this.itens.set(vitrineDestaques);
        this.maisVendidos.set(vitrineMaisVendidos);
      })
      .catch(() => {
        if (!silencioso) {
          this.itens.set([]);
          this.maisVendidos.set([]);
        }
      })
      .finally(() => this.carregando.set(false));
  }
}
