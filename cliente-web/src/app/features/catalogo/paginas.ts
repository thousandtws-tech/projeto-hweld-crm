import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { BuscaService, CatalogoService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { ItemCatalogoPortal, Pagina } from '../../core/models';
import { HwProductCard } from '../../shared/ui/product-card';
import { HwEmpty, HwSkeleton } from '../../shared/ui/misc';
import { HwButton } from '../../shared/ui/button';
import { HwSliderPro } from './slider-pro';
import {
  HwTrustBar,
  HwCategoryGrid,
  HwTrioBanners,
  HwStripBanner,
  HwDuoBanners,
  HwBrandsSlider,
  HwCorporateBanner,
  HwNewsletterBanner,
} from './home-banners';

/** S02 — Home / Vitrine minimalista e profissional B2B */
@Component({
  standalone: true,
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
  template: `
    <!-- Slider Pro Nativo com Swiper + GSAP + Parallax -->
    <hw-slider-pro />

    <!-- Barra de Benefícios & Vantagens B2B -->
    <hw-trust-bar />

    <!-- Grid Visual de Categorias Populares -->
    <hw-category-grid />

    <!-- Seção de Produtos em Destaque (Posicionado no Meio) -->
    <section class="secao-catalogo">
      <div class="secao-topo">
        <div>
          <span class="secao-tag">OFERTAS SELECIONADAS</span>
          <h2>Produtos em Destaque</h2>
          <p class="secao-sub">Os itens mais solicitados na sua categoria de operação industrial</p>
        </div>
        <a routerLink="/busca" class="ver-tudo-btn">
          <span>Ver catálogo completo</span>
          <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </a>
      </div>

      @if (carregando()) {
        <div class="grid">
          @for (i of [1,2,3,4,5,6,7,8]; track i) {
            <hw-skeleton style="height: 320px; border-radius: 12px;" />
          }
        </div>
      } @else if (itens().length === 0) {
        <hw-empty
          titulo="Nenhum destaque no momento"
          descricao="Navegue pelas categorias completas ou utilize a busca acima."
          icone="category"
        />
      } @else {
        <div class="grid">
          @for (p of itens(); track p.id) {
            <hw-product-card [item]="p" />
          }
        </div>
      }
    </section>

    <!-- Trio de Banners Promocionais (3 Containers Lado a Lado) -->
    <hw-trio-banners />

    <!-- Slider de Marcas Parceiras (Navegue por marcas - Padrão Loja Virtual) -->
    <hw-brands-slider />

    <!-- Banner Faixa Full-Bleed (Semana da Indústria + Cupom Interativo) -->
    <hw-strip-banner />

    <!-- Duo de Banners Promocionais (2 Banners Largos Split 50/50) -->
    <hw-duo-banners />

    <!-- Segunda Vitrine: Mais Vendidos & Reposição Rápida -->
    @if (maisVendidos().length > 0) {
      <section class="secao-catalogo">
        <div class="secao-topo">
          <div>
            <span class="secao-tag tag-azul">ALTA ROTATIVIDADE</span>
            <h2>Mais Vendidos & Suprimentos Essenciais</h2>
            <p class="secao-sub">Itens de consumo contínuo para manter sua operação sem interrupções</p>
          </div>
          <a routerLink="/busca" class="ver-tudo-btn">
            <span>Explorar mais</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </a>
        </div>

        <div class="grid">
          @for (p of maisVendidos(); track p.id) {
            <hw-product-card [item]="p" />
          }
        </div>
      </section>
    }

    <!-- Banner Institucional B2B (Soluções Corporativas & Faturamento CNPJ) -->
    <hw-corporate-banner />

    <!-- Banner Newsletter & Tabela VIP de Preços -->
    <hw-newsletter-banner />
  `,
  styles: `
    .secao-catalogo {
      margin-bottom: var(--hw-space-12);
    }
    .secao-topo {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: var(--hw-space-6);
      gap: 16px;
    }
    .secao-tag {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #ea580c;
      display: inline-block;
      margin-bottom: 4px;
    }
    .secao-tag.tag-azul {
      color: #1d4fd8;
    }
    .secao-topo h2 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--hw-text);
      margin: 0 0 4px;
    }
    .secao-sub {
      font-size: 13px;
      color: var(--hw-text-muted);
      margin: 0;
    }
    .ver-tudo-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #1d4fd8;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 8px;
      background: #eff6ff;
      transition: background 0.2s ease, transform 0.15s ease;
      white-space: nowrap;
    }
    .ver-tudo-btn:hover {
      background: #dbeafe;
      transform: translateX(2px);
    }
    .ver-tudo-btn span.material-symbols-outlined {
      font-size: 16px;
    }

    .grid {
      display: grid;
      gap: var(--hw-space-5);
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }

    @media (max-width: 768px) {
      .secao-topo {
        flex-direction: column;
        align-items: flex-start;
      }
      .grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
    }
  `,
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
      this.catalogo.listar({ destaque: true, por_pagina: 8 }),
      this.catalogo.listar({ por_pagina: 8, pagina: 2 }),
    ])
      .then(([pDestaque, pMaisVendidos]) => {
        this.itens.set(pDestaque.itens);
        this.maisVendidos.set(pMaisVendidos.itens);
      })
      .catch(() => {
        this.catalogo
          .listar({ destaque: true, por_pagina: 8 })
          .then((p) => this.itens.set(p.itens))
          .catch(() => this.itens.set([]));
      })
      .finally(() => this.carregando.set(false));
  }
}

/** S03 — Listagem por categoria (`/c/{id}-{slug}`). */
@Component({
  standalone: true,
  imports: [RouterLink, HwProductCard, HwSkeleton, HwEmpty],
  template: `
    <!-- Breadcrumb Minimalista -->
    <nav class="crumb" aria-label="Caminho de navegação">
      <a routerLink="/">Início</a>
      <span class="material-symbols-outlined sep" aria-hidden="true">chevron_right</span>
      <span class="atual">{{ nome() }}</span>
    </nav>

    <div class="categoria-cabecalho">
      <div>
        <h1>{{ nome() }}</h1>
        @if (pagina(); as p) {
          <span class="total-itens">{{ p.total }} produtos disponíveis</span>
        }
      </div>
    </div>

    @if (carregando()) {
      <div class="grid">
        @for (i of [1,2,3,4,5,6,7,8]; track i) {
          <hw-skeleton style="height: 320px; border-radius: 12px;" />
        }
      </div>
    } @else if (pagina()?.itens.length === 0) {
      <hw-empty
        titulo="Categoria sem produtos ativos"
        descricao="No momento não há itens ativos vinculados a esta categoria."
        icone="category"
      />
    } @else {
      <div class="grid">
        @for (p of pagina()!.itens; track p.id) {
          <hw-product-card [item]="p" />
        }
      </div>

      <!-- Paginação Minimalista -->
      @if (pagina()!.total_paginas > 1) {
        <nav class="paginacao" aria-label="Navegação entre páginas">
          @for (i of range(pagina()!.total_paginas); track i) {
            <button
              type="button"
              class="pag-btn"
              [class.atual]="i === pagina()!.pagina"
              (click)="ir(i)"
              [attr.aria-current]="i === pagina()!.pagina ? 'page' : null"
            >
              {{ i }}
            </button>
          }
        </nav>
      }
    }
  `,
  styles: `
    .crumb {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: var(--hw-text-muted);
      margin-bottom: var(--hw-space-4);
      a { color: var(--hw-text-muted); text-decoration: none; &:hover { color: var(--hw-accent); } }
      .sep { font-size: 16px; color: var(--hw-text-faint); }
      .atual { color: var(--hw-text); font-weight: 500; }
    }
    .categoria-cabecalho {
      margin-bottom: var(--hw-space-6);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: var(--hw-space-3);
      border-bottom: 1px solid var(--hw-border);
      h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.02em; }
      .total-itens { font-size: 13px; color: var(--hw-text-muted); }
    }
    .grid {
      display: grid;
      gap: var(--hw-space-5);
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
    @media (max-width: 640px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
    }
    .paginacao {
      display: flex;
      gap: 6px;
      justify-content: center;
      margin-top: var(--hw-space-10);
    }
    .pag-btn {
      min-width: 36px;
      height: 36px;
      padding: 0 10px;
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-sm);
      background: var(--hw-surface-raised);
      font-family: var(--hw-font-sans);
      font-size: 13px;
      font-weight: 500;
      color: var(--hw-text);
      cursor: pointer;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);

      &:hover {
        background: var(--hw-surface);
        border-color: var(--hw-border-input);
      }
      &.atual {
        background: var(--hw-accent);
        color: var(--hw-on-accent);
        border-color: var(--hw-accent);
        font-weight: 600;
      }
    }
  `,
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
    this.catalogo.listar({ categoria_id: this.categoriaId, pagina, por_pagina: 24 })
      .then((p) => this.pagina.set(p))
      .catch(() => this.pagina.set(null))
      .finally(() => this.carregando.set(false));
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i + 1);
  }
}

/** S04 — Resultados de busca com facetas minimalistas (`/busca?q=`). */
@Component({
  standalone: true,
  imports: [RouterLink, MatCheckboxModule, MatButtonModule, HwProductCard, HwSkeleton, HwEmpty, HwButton],
  template: `
    @if (resultado(); as r) {
      <div class="busca-topo">
        <h1>
          {{ r.total }} {{ r.total === 1 ? 'resultado' : 'resultados' }} para
          <span class="termo">“{{ q() }}”</span>
        </h1>
        @if (categoriaSel() !== null || marcaSel() !== null) {
          <button type="button" class="btn-limpar-filtros" (click)="limparFiltros()">
            Limpar filtros
          </button>
        }
      </div>

      <div class="layout">
        <!-- Sidebar de Facetas -->
        <aside class="facetas" aria-label="Filtros de busca">
          @if (r.facetas?.categorias?.length) {
            <div class="grupo-faceta">
              <h3>Categorias</h3>
              <div class="itens-faceta">
                @for (f of r.facetas!.categorias!; track f.id) {
                  <label class="item-checkbox">
                    <input
                      type="checkbox"
                      [checked]="categoriaSel() === f.id"
                      (change)="filtrarCategoria(f.id)"
                    />
                    <span class="label-txt">{{ f.nome }}</span>
                    <span class="count-tag hw-numeric">{{ f.total }}</span>
                  </label>
                }
              </div>
            </div>
          }

          @if (r.facetas?.marcas?.length) {
            <div class="grupo-faceta">
              <h3>Marcas</h3>
              <div class="itens-faceta">
                @for (f of r.facetas!.marcas!; track f.marca) {
                  <label class="item-checkbox">
                    <input
                      type="checkbox"
                      [checked]="marcaSel() === f.marca"
                      (change)="filtrarMarca(f.marca)"
                    />
                    <span class="label-txt">{{ f.marca }}</span>
                    <span class="count-tag hw-numeric">{{ f.total }}</span>
                  </label>
                }
              </div>
            </div>
          }
        </aside>

        <!-- Grade de Produtos -->
        <div class="conteudo-busca">
          @if (r.itens.length === 0) {
            <hw-empty
              titulo="Nenhum produto encontrado"
              descricao="Tente usar termos mais genéricos ou limpe os filtros aplicados."
              icone="search_off"
            />
          } @else {
            <div class="grid">
              @for (p of r.itens; track p.id) {
                <hw-product-card [item]="p" />
              }
            </div>
          }
        </div>
      </div>
    } @else if (esOff()) {
      <hw-empty
        titulo="Busca temporariamente indisponível"
        descricao="Nosso serviço de pesquisa está passando por manutenção. Navegue pelas categorias disponíveis."
        icone="search_off"
      >
        <a routerLink="/" hwButton>Ir para categorias</a>
      </hw-empty>
    } @else {
      <div class="grid">
        @for (i of [1,2,3,4,5,6]; track i) {
          <hw-skeleton style="height: 320px; border-radius: 12px;" />
        }
      </div>
    }
  `,
  styles: `
    .busca-topo {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--hw-space-6);
      padding-bottom: var(--hw-space-3);
      border-bottom: 1px solid var(--hw-border);
      h1 { font-size: 20px; font-weight: 700; margin: 0; }
      .termo { color: var(--hw-accent); }
    }
    .btn-limpar-filtros {
      background: transparent;
      border: 0;
      color: var(--hw-accent);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      &:hover { text-decoration: underline; }
    }
    .layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: var(--hw-space-8);
      align-items: start;
    }
    .facetas {
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      padding: var(--hw-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-5);
    }
    .grupo-faceta h3 {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--hw-text-muted);
      margin: 0 0 var(--hw-space-3);
    }
    .itens-faceta {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .item-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--hw-text);
      cursor: pointer;
      user-select: none;
      input { cursor: pointer; accent-color: var(--hw-accent); }
    }
    .label-txt {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .count-tag {
      font-size: 11px;
      color: var(--hw-text-muted);
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      padding: 1px 6px;
      border-radius: var(--hw-radius-pill);
    }
    .grid {
      display: grid;
      gap: var(--hw-space-5);
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
    @media (max-width: 768px) {
      .layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
    }
  `,
})
export class BuscaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private busca = inject(BuscaService);
  resultado = signal<ResultadoBuscaNulo>(null);
  esOff = signal(false);
  q = signal('');
  categoriaSel = signal<number | null>(null);
  marcaSel = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((p) => {
      this.q.set(p.get('q') ?? '');
      this.executar();
    });
  }

  executar(): void {
    this.resultado.set(null);
    this.esOff.set(false);
    this.busca.buscar(this.q(), {
      categoria_id: this.categoriaSel() ?? undefined,
      marca: this.marcaSel() ?? undefined,
    })
      .then((r) => this.resultado.set(r))
      .catch((e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 503) this.esOff.set(true);
        else this.resultado.set({ itens: [], total: 0, pagina: 1, total_paginas: 0 });
      });
  }

  filtrarCategoria(id: number): void {
    this.categoriaSel.set(this.categoriaSel() === id ? null : id);
    this.executar();
  }
  filtrarMarca(m: string): void {
    this.marcaSel.set(this.marcaSel() === m ? null : m);
    this.executar();
  }
  limparFiltros(): void {
    this.categoriaSel.set(null);
    this.marcaSel.set(null);
    this.executar();
  }
}

type ResultadoBuscaNulo = import('../../core/models').ResultadoBusca | null;
