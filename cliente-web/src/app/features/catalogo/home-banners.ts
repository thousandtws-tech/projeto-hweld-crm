import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  afterNextRender,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import Swiper from 'swiper';
import { Autoplay, Navigation, A11y } from 'swiper/modules';

/** Barra de Benefícios & Vantagens B2B (Padrão Grandes Lojas Virtuais) */
/** Barra de Benefícios & Vantagens B2B com Ícones Estratégicos HWeld */
@Component({
  selector: 'hw-trust-bar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="trust-container">
      <!-- 1. Envio & Rastreamento -->
      <a routerLink="/conta/pedidos" class="trust-item">
        <div class="trust-icon-box">
          <img src="assets/icons/icon-map-pin.png" alt="Entrega Expressa" class="trust-img-icon" />
        </div>
        <div class="trust-info">
          <strong>Entrega em Todo o Brasil</strong>
          <span>Logística expressa e rastreio ágil</span>
        </div>
      </a>

      <!-- 2. Faturamento & Compra Garantida -->
      <a routerLink="/conta" class="trust-item">
        <div class="trust-icon-box">
          <img src="assets/icons/icon-cart-check.png" alt="Faturamento Direto B2B" class="trust-img-icon" />
        </div>
        <div class="trust-info">
          <strong>Faturamento Direto B2B</strong>
          <span>Boleto a prazo exclusivo para CNPJ</span>
        </div>
      </a>

      <!-- 3. Cotação Rápida B2B -->
      <a routerLink="/busca" class="trust-item">
        <div class="trust-icon-box">
          <img src="assets/icons/icon-quote-pencil.png" alt="Cotação Rápida" class="trust-img-icon" />
        </div>
        <div class="trust-info">
          <strong>Cotação B2B em 30 min</strong>
          <span>Preço especial por lote e atacado</span>
        </div>
      </a>

      <!-- 4. Portal do Cliente & Suporte -->
      <a routerLink="/conta" class="trust-item">
        <div class="trust-icon-box">
          <img src="assets/icons/icon-user-account.png" alt="Portal do Cliente" class="trust-img-icon" />
        </div>
        <div class="trust-info">
          <strong>Portal do Cliente CNPJ</strong>
          <span>2ª via, faturas e suporte de fábrica</span>
        </div>
      </a>

      <!-- 5. Instagram Oficial & Comunidade -->
      <a href="https://instagram.com" target="_blank" rel="noopener" class="trust-item">
        <div class="trust-icon-box trust-icon-ig">
          <img src="assets/icons/icon-instagram.png" alt="Instagram HWeld" class="trust-img-icon" />
        </div>
        <div class="trust-info">
          <strong>Instagram Oficial</strong>
          <span>Dicas técnicas e novidades @hweld</span>
        </div>
      </a>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--hw-space-8);
    }
    .trust-container {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 14px;
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-xl);
      padding: 16px 20px;
      box-shadow: var(--hw-shadow-card);
    }
    .trust-item {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
      border-radius: 12px;
      padding: 6px 8px;
      transition: background 0.18s ease, transform 0.18s ease;
    }
    .trust-item:hover {
      background: #f8fafc;
      transform: translateY(-2px);
    }
    .trust-icon-box {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #fff7ed;
      border: 1px solid #ffedd5;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }
    .trust-icon-ig {
      background: #f1f5f9;
      border-color: #e2e8f0;
    }
    .trust-item:hover .trust-icon-box {
      transform: scale(1.1);
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2);
      border-color: #fdba74;
    }
    .trust-img-icon {
      width: 24px;
      height: 24px;
      object-fit: contain;
      display: block;
    }
    .trust-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .trust-info strong {
      font-size: 13px;
      font-weight: 700;
      color: var(--hw-text);
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .trust-info span {
      font-size: 11.5px;
      color: var(--hw-text-muted);
      line-height: 1.35;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (max-width: 1200px) {
      .trust-container {
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
    }
    @media (max-width: 768px) {
      .trust-container {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        padding: 14px;
      }
    }
    @media (max-width: 520px) {
      .trust-container {
        grid-template-columns: 1fr;
        gap: 10px;
        padding: 12px 14px;
      }
    }
  `,
})
export class HwTrustBar {}

/** Slider Contínuo Automático de Categorias Populares (Padrão E-commerce Swiper) */
@Component({
  selector: 'hw-category-grid',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="cat-section">
      <div class="section-header">
        <div class="header-titles">
          <span class="section-tag">CATÁLOGO COMPLETO</span>
          <h2>Navegue por Categorias Populares</h2>
          <p>Encontre os melhores suprimentos, máquinas e acessórios industriais</p>
        </div>

        <div class="header-actions">
          <!-- Botões Discretos de Navegação Manual -->
          <div class="cat-nav-controls">
            <button
              type="button"
              class="cat-arrow-btn"
              (click)="prev()"
              aria-label="Categoria anterior"
            >
              <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
            </button>
            <button
              type="button"
              class="cat-arrow-btn"
              (click)="next()"
              aria-label="Próxima categoria"
            >
              <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </div>

          <a routerLink="/busca" class="ver-tudo-link">
            <span>Ver todas</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </a>
        </div>
      </div>

      <!-- Carrossel Swiper com Banners das Categorias (Apenas Imagem) -->
      <div #catSwiperRef class="swiper cat-swiper">
        <div class="swiper-wrapper">
          @for (c of categorias; track c.id) {
            <div class="swiper-slide cat-slide">
              <a [routerLink]="c.link" class="cat-banner-card" [title]="c.nome">
                <img [src]="c.imagem" [alt]="c.nome" class="cat-banner-img" loading="lazy" />
              </a>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--hw-space-10);
    }
    .cat-section {
      width: 100%;
      position: relative;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 18px;
      gap: 16px;
    }
    .header-titles .section-tag {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #1d4fd8;
      display: inline-block;
      margin-bottom: 4px;
    }
    .header-titles h2 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--hw-text);
      margin: 0 0 4px;
    }
    .header-titles p {
      font-size: 13px;
      color: var(--hw-text-muted);
      margin: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cat-nav-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cat-arrow-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      color: var(--hw-text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .cat-arrow-btn:hover {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1d4fd8;
      transform: scale(1.06);
    }
    .cat-arrow-btn span {
      font-size: 20px;
    }

    .ver-tudo-link {
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
    .ver-tudo-link:hover {
      background: #dbeafe;
      transform: translateX(2px);
    }
    .ver-tudo-link span.material-symbols-outlined {
      font-size: 16px;
    }

    /* Estilização do Swiper Container e Banners das Categorias */
    .cat-swiper {
      width: 100%;
      overflow: hidden;
      padding: 6px 2px 14px;
      position: relative;
      user-select: none;
    }

    ::ng-deep .cat-swiper {
      .swiper-wrapper {
        display: flex !important;
        flex-direction: row !important;
        align-items: stretch !important;
      }
    }

    .cat-slide {
      height: auto;
      display: flex;
      box-sizing: border-box;
    }

    /* Container é estritamente a imagem do banner de categoria */
    .cat-banner-card {
      width: 100%;
      height: 210px;
      display: block;
      border-radius: var(--hw-radius-xl, 18px);
      overflow: hidden;
      position: relative;
      background: #0f172a;
      border: 1px solid var(--hw-border);
      box-shadow: var(--hw-shadow-card);
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.28s ease, border-color 0.28s ease;
      cursor: pointer;
      box-sizing: border-box;
    }
    .cat-banner-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.22);
      border-color: #93c5fd;
    }
    .cat-banner-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .cat-banner-card:hover .cat-banner-img {
      transform: scale(1.05);
    }

    @media (max-width: 900px) {
      .cat-banner-card {
        height: 170px;
        border-radius: 14px;
      }
    }

    @media (max-width: 768px) {
      .section-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .header-actions {
        width: 100%;
        justify-content: space-between;
      }
    }

    @media (max-width: 560px) {
      .cat-banner-card {
        height: 140px;
        border-radius: 12px;
      }
    }
  `,
})
export class HwCategoryGrid implements OnDestroy {
  @ViewChild('catSwiperRef') catSwiperRef?: ElementRef<HTMLElement>;
  private swiperInstance: Swiper | null = null;

  readonly categorias = [
    {
      id: 'maquinas',
      nome: 'Máquinas de Solda',
      link: '/busca?q=inversora',
      imagem: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'epis',
      nome: 'EPIs & Proteção',
      link: '/busca?q=mascara',
      imagem: 'https://images.unsplash.com/photo-1508873535684-277a3cbcc4e8?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'tochas',
      nome: 'Tochas & Acessórios',
      link: '/busca?q=tocha',
      imagem: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'arames',
      nome: 'Consumíveis & Arames',
      link: '/busca?q=eletrodo',
      imagem: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'plasma',
      nome: 'Corte Plasma & CNC',
      link: '/busca?q=plasma',
      imagem: 'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'ferramentas',
      nome: 'Ferramentas Industriais',
      link: '/busca?q=ferramenta',
      imagem: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'gases',
      nome: 'Gases & Reguladores',
      link: '/busca?q=regulador',
      imagem: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'abrasivos',
      nome: 'Abrasivos & Discos',
      link: '/busca?q=disco',
      imagem: 'https://images.unsplash.com/photo-1618090584176-7132b9911657?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'seguranca',
      nome: 'Segurança do Trabalho',
      link: '/busca?q=seguranca',
      imagem: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'automacao',
      nome: 'Automação & Robótica',
      link: '/busca?q=automacao',
      imagem: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'estruturas',
      nome: 'Caldeiraria & Estruturas',
      link: '/busca?q=solda',
      imagem: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'oficina',
      nome: 'Usinagem & Fixação',
      link: '/busca?q=usinagem',
      imagem: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=800&q=80',
    },
  ];

  constructor() {
    afterNextRender(() => {
      this.initSwiper();
    });
  }

  ngOnDestroy(): void {
    if (this.swiperInstance) {
      this.swiperInstance.destroy(true, true);
      this.swiperInstance = null;
    }
  }

  prev(): void {
    this.swiperInstance?.slidePrev();
  }

  next(): void {
    this.swiperInstance?.slideNext();
  }

  private initSwiper(): void {
    if (!this.catSwiperRef?.nativeElement) return;

    this.swiperInstance = new Swiper(this.catSwiperRef.nativeElement, {
      modules: [Autoplay, Navigation, A11y],
      slidesPerView: 1.3,
      spaceBetween: 12,
      loop: true,
      speed: 650,
      grabCursor: true,
      autoplay: {
        delay: 2400,
        disableOnInteraction: false,
        pauseOnMouseEnter: false,
      },
      breakpoints: {
        480: {
          slidesPerView: 1.8,
          spaceBetween: 14,
        },
        640: {
          slidesPerView: 2.3,
          spaceBetween: 16,
        },
        900: {
          slidesPerView: 2.8,
          spaceBetween: 16,
        },
        1200: {
          slidesPerView: 3.5,
          spaceBetween: 18,
        },
        1440: {
          slidesPerView: 4.1,
          spaceBetween: 20,
        },
      },
    });
  }
}


/** Trio de Banners Promocionais (3 Containers Lado a Lado - Ofertas em Destaque) */
@Component({
  selector: 'hw-trio-banners',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="trio-section">
      <div class="trio-grid">
        <!-- Banner 1: Máquinas de Solda -->
        <div class="promo-card card-orange">
          <div class="card-bg" style="background-image: url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80');"></div>
          <div class="card-overlay"></div>
          <div class="card-content">
            <span class="card-badge badge-orange">ATÉ 35% OFF</span>
            <h3 class="card-title">Inversoras Industriais IGBT</h3>
            <p class="card-desc">Arc Force, Hot Start e bivolt automático para alta produtividade em serralheria.</p>
            <div class="card-footer">
              <span class="card-price">A partir de <strong>R$ 689,90</strong></span>
              <a routerLink="/busca" [queryParams]="{ q: 'inversora' }" class="btn-card btn-orange">
                <span>Ver Ofertas</span>
                <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>

        <!-- Banner 2: EPIs & Proteção -->
        <div class="promo-card card-cyan">
          <div class="card-bg" style="background-image: url('https://images.unsplash.com/photo-1508873535684-277a3cbcc4e8?auto=format&fit=crop&w=800&q=80');"></div>
          <div class="card-overlay"></div>
          <div class="card-content">
            <span class="card-badge badge-cyan">PROTEÇÃO CERTIFICADA</span>
            <h3 class="card-title">Máscaras de Auto-Escurecimento</h3>
            <p class="card-desc">Filtro True Color DIN 9-13, 4 sensores e máxima ergonomia com CA ativo.</p>
            <div class="card-footer">
              <span class="card-price">Parcele em até <strong>10x sem juros</strong></span>
              <a routerLink="/busca" [queryParams]="{ q: 'mascara' }" class="btn-card btn-cyan">
                <span>Conferir Linha</span>
                <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>

        <!-- Banner 3: Consumíveis em Lote -->
        <div class="promo-card card-blue">
          <div class="card-bg" style="background-image: url('https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=800&q=80');"></div>
          <div class="card-overlay"></div>
          <div class="card-content">
            <span class="card-badge badge-blue">FATURAMENTO B2B</span>
            <h3 class="card-title">Arames MIG & Eletrodos E7018</h3>
            <p class="card-desc">Caixas fechadas e bobinas de 15kg com desconto progressivo para CNPJ.</p>
            <div class="card-footer">
              <span class="card-price">Preço direto de <strong>distribuidora</strong></span>
              <a routerLink="/busca" [queryParams]="{ q: 'eletrodo' }" class="btn-card btn-blue">
                <span>Comprar Lote</span>
                <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--hw-space-12);
    }
    .trio-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .promo-card {
      position: relative;
      height: 340px;
      border-radius: var(--hw-radius-xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 28px 24px;
      box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.15);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
    }
    .promo-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.25);
    }
    .card-bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .promo-card:hover .card-bg {
      transform: scale(1.06);
    }
    .card-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.2) 0%, rgba(15, 23, 42, 0.75) 50%, rgba(15, 23, 42, 0.96) 100%);
    }
    .card-content {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
    }
    .card-badge {
      display: inline-block;
      align-self: flex-start;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      padding: 4px 10px;
      border-radius: var(--hw-radius-pill);
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    .badge-orange {
      background: #ea580c;
      color: #ffffff;
      box-shadow: 0 0 12px rgba(234, 88, 12, 0.4);
    }
    .badge-cyan {
      background: #0284c7;
      color: #ffffff;
      box-shadow: 0 0 12px rgba(2, 132, 199, 0.4);
    }
    .badge-blue {
      background: #1d4fd8;
      color: #ffffff;
      box-shadow: 0 0 12px rgba(29, 79, 216, 0.4);
    }

    .card-title {
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.25;
      margin: 0 0 8px;
      letter-spacing: -0.01em;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
    }
    .card-desc {
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.4;
      margin: 0 0 18px;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      padding-top: 14px;
    }
    .card-price {
      font-size: 12px;
      color: #94a3b8;
    }
    .card-price strong {
      display: block;
      font-size: 14px;
      color: #ffffff;
      font-weight: 700;
    }
    .btn-card {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: var(--hw-radius-pill);
      transition: transform 0.2s ease, filter 0.2s ease;
      white-space: nowrap;
    }
    .btn-card:hover {
      transform: scale(1.04);
      filter: brightness(1.1);
    }
    .btn-card span.material-symbols-outlined {
      font-size: 16px;
    }
    .btn-orange {
      background: #ea580c;
      color: #ffffff;
    }
    .btn-cyan {
      background: #0284c7;
      color: #ffffff;
    }
    .btn-blue {
      background: #1d4fd8;
      color: #ffffff;
    }

    @media (max-width: 1024px) {
      .trio-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .promo-card {
        height: 280px;
        padding: 20px;
      }
    }
  `,
})
export class HwTrioBanners {}

/** Banner Faixa Full-Bleed de Alto Impacto (Semana Especial + Cupom Interativo) */
@Component({
  selector: 'hw-strip-banner',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="strip-breakout">
      <div class="strip-container">
        <div class="strip-decor-circle circle-1"></div>
        <div class="strip-decor-circle circle-2"></div>

        <div class="strip-left">
          <div class="strip-badge-wrap">
            <span class="pulsing-dot"></span>
            <span class="strip-badge">CAMPANHA INDUSTRIAL 2026</span>
          </div>
          <h2 class="strip-title">Semana da Indústria & Serralheria HWeld</h2>
          <p class="strip-subtitle">
            Equipamentos industriais de alto ciclo com até <strong>40% OFF</strong> e faturamento em até 35 DDL para CNPJ aprovado.
          </p>
        </div>

        <div class="strip-right">
          <!-- Bloco do Cupom com Cópia Interativa -->
          <div class="coupon-box">
            <span class="coupon-label">USE O CUPOM NO CHECKOUT:</span>
            <div class="coupon-pill" (click)="copiarCupom()" role="button" tabindex="0">
              <span class="coupon-code">HWELDPRO10</span>
              <button type="button" class="btn-copy" aria-label="Copiar cupom">
                <span class="material-symbols-outlined" aria-hidden="true">
                  {{ copiado() ? 'check' : 'content_copy' }}
                </span>
                <span>{{ copiado() ? 'Copiado!' : 'Copiar' }}</span>
              </button>
            </div>
            <span class="coupon-hint">Válido para compras faturadas e à vista</span>
          </div>

          <!-- Botão CTA Principal -->
          <a routerLink="/busca" class="btn-strip-cta">
            <span>Acessar Todas as Ofertas</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </a>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin: var(--hw-space-12) 0;
    }
    .strip-breakout {
      width: 100vw;
      position: relative;
      left: 50%;
      right: 50%;
      margin-left: -50vw;
      margin-right: -50vw;
      background: linear-gradient(135deg, #090e17 0%, #0f1c3f 50%, #1e3a8a 100%);
      border-top: 1px solid rgba(59, 130, 246, 0.25);
      border-bottom: 1px solid rgba(59, 130, 246, 0.25);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 12px 32px -8px rgba(15, 23, 42, 0.4);
      overflow: hidden;
    }
    .strip-container {
      max-width: var(--hw-content-max);
      margin: 0 auto;
      padding: 40px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
      position: relative;
      z-index: 2;
    }
    .strip-decor-circle {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      pointer-events: none;
      z-index: 1;
    }
    .circle-1 {
      width: 320px;
      height: 320px;
      background: rgba(29, 79, 216, 0.25);
      top: -100px;
      left: 10%;
    }
    .circle-2 {
      width: 260px;
      height: 260px;
      background: rgba(249, 115, 22, 0.2);
      bottom: -80px;
      right: 15%;
    }

    .strip-left {
      flex: 1;
      max-width: 620px;
      position: relative;
      z-index: 2;
    }
    .strip-badge-wrap {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 5px 12px;
      border-radius: var(--hw-radius-pill);
      margin-bottom: 12px;
    }
    .pulsing-dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 10px #22c55e;
      animation: pulseGreen 1.8s infinite;
    }
    @keyframes pulseGreen {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
    }
    .strip-badge {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #93c5fd;
    }
    .strip-title {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.02em;
      margin: 0 0 10px;
      line-height: 1.2;
    }
    .strip-subtitle {
      font-size: 14px;
      color: #cbd5e1;
      margin: 0;
      line-height: 1.5;
    }
    .strip-subtitle strong {
      color: #f97316;
    }

    .strip-right {
      display: flex;
      align-items: center;
      gap: 20px;
      position: relative;
      z-index: 2;
      flex-shrink: 0;
    }
    .coupon-box {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .coupon-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .coupon-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px dashed #38bdf8;
      border-radius: 12px;
      padding: 6px 8px 6px 16px;
      cursor: pointer;
      transition: background 0.2s ease, border-color 0.2s ease;
    }
    .coupon-pill:hover {
      background: rgba(30, 41, 59, 0.95);
      border-color: #67e8f9;
    }
    .coupon-code {
      font-family: var(--hw-font-mono, monospace);
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: #ffffff;
    }
    .btn-copy {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-copy:hover {
      background: #0369a1;
    }
    .btn-copy span.material-symbols-outlined {
      font-size: 14px;
    }
    .coupon-hint {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    .btn-strip-cta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #f97316;
      color: #ffffff;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      padding: 14px 24px;
      border-radius: var(--hw-radius-pill);
      box-shadow: 0 4px 16px rgba(249, 115, 22, 0.4);
      transition: transform 0.2s ease, background 0.2s ease;
      white-space: nowrap;
    }
    .btn-strip-cta:hover {
      background: #ea580c;
      transform: translateY(-2px);
    }
    .btn-strip-cta span.material-symbols-outlined {
      font-size: 18px;
    }

    @media (max-width: 1024px) {
      .strip-container {
        flex-direction: column;
        align-items: flex-start;
        padding: 32px 20px;
      }
      .strip-right {
        width: 100%;
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }
      .coupon-box {
        align-items: flex-start;
      }
    }
  `,
})
export class HwStripBanner {
  copiado = signal(false);

  copiarCupom(): void {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText('HWELDPRO10').then(() => {
        this.copiado.set(true);
        setTimeout(() => this.copiado.set(false), 2500);
      });
    }
  }
}

/** Duo de Banners Promocionais (2 Banners Largos Split 50/50) */
@Component({
  selector: 'hw-duo-banners',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="duo-section">
      <div class="duo-grid">
        <!-- Banner Esquerdo: Corte Plasma Industrial -->
        <div class="duo-card duo-plasma">
          <div class="duo-bg" style="background-image: url('https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?auto=format&fit=crop&w=900&q=80');"></div>
          <div class="duo-overlay"></div>
          <div class="duo-content">
            <span class="duo-tag">LINHA CORTE CNC</span>
            <h3 class="duo-title">Sistemas de Corte Plasma de Alta Definição</h3>
            <p class="duo-desc">
              Precisão milimétrica em aço carbono, inox e alumínio. Corte rápido com tochas de alta durabilidade e consumíveis de reposição imediata.
            </p>
            <div class="duo-meta">
              <span class="duo-highlight">Corte até 32mm de espessura</span>
              <a routerLink="/busca" [queryParams]="{ q: 'plasma' }" class="btn-duo">
                <span>Ver Máquinas Plasma</span>
                <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>

        <!-- Banner Direito: Combos & Kits Serralheiro -->
        <div class="duo-card duo-combo">
          <div class="duo-bg" style="background-image: url('https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80');"></div>
          <div class="duo-overlay"></div>
          <div class="duo-content">
            <span class="duo-tag duo-tag-gold">COMBOS PROFISSIONAIS</span>
            <h3 class="duo-title">Kits Completos para Serralheria & Oficinas</h3>
            <p class="duo-desc">
              Leve Máquina Inversora + Máscara Automática + Tocha + Eletrodos com economia garantida de combo e frete unificado para sua empresa.
            </p>
            <div class="duo-meta">
              <span class="duo-highlight">Economia de até R$ 420,00 no combo</span>
              <a routerLink="/busca" [queryParams]="{ q: 'kit' }" class="btn-duo btn-gold">
                <span>Montar Meu Kit</span>
                <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--hw-space-12);
    }
    .duo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }
    .duo-card {
      position: relative;
      min-height: 360px;
      border-radius: var(--hw-radius-xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 36px 32px;
      box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
    }
    .duo-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 18px 40px -10px rgba(0, 0, 0, 0.3);
    }
    .duo-bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
      transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .duo-card:hover .duo-bg {
      transform: scale(1.05);
    }
    .duo-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.3) 0%, rgba(15, 23, 42, 0.85) 60%, rgba(15, 23, 42, 0.98) 100%);
    }
    .duo-content {
      position: relative;
      z-index: 2;
    }
    .duo-tag {
      display: inline-block;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 4px 12px;
      border-radius: var(--hw-radius-pill);
      margin-bottom: 12px;
    }
    .duo-tag-gold {
      color: #fbbf24;
      background: rgba(251, 191, 36, 0.15);
      border-color: rgba(251, 191, 36, 0.3);
    }
    .duo-title {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.25;
      margin: 0 0 10px;
      letter-spacing: -0.01em;
    }
    .duo-desc {
      font-size: 14px;
      color: #cbd5e1;
      line-height: 1.5;
      margin: 0 0 20px;
      max-width: 480px;
    }
    .duo-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      padding-top: 16px;
    }
    .duo-highlight {
      font-size: 13px;
      font-weight: 700;
      color: #94a3b8;
    }
    .btn-duo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #1d4fd8;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      padding: 10px 18px;
      border-radius: var(--hw-radius-pill);
      transition: background 0.2s ease, transform 0.2s ease;
      white-space: nowrap;
    }
    .btn-duo:hover {
      background: #2563eb;
      transform: translateY(-2px);
    }
    .btn-gold {
      background: #d97706;
    }
    .btn-gold:hover {
      background: #b45309;
    }
    .btn-duo span.material-symbols-outlined {
      font-size: 18px;
    }

    @media (max-width: 900px) {
      .duo-grid {
        grid-template-columns: 1fr;
        gap: 18px;
      }
      .duo-card {
        min-height: 300px;
        padding: 24px 20px;
      }
      .duo-title {
        font-size: 20px;
      }
    }
  `,
})
export class HwDuoBanners {}

/** Banner Institucional B2B (Soluções Corporativas & Faturamento CNPJ) */
@Component({
  selector: 'hw-corporate-banner',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="corp-section">
      <div class="corp-container">
        <div class="corp-left">
          <div class="corp-pill">CANAL EXCLUSIVO PARA EMPRESAS</div>
          <h2 class="corp-title">Sua Indústria ou Serralheria Precisa de Cotações em Lote?</h2>
          <p class="corp-desc">
            Atendimento corporativo ágil, tabela com descontos progressivos por volume e faturamento com prazo de até 42 dias no boleto para clientes cadastrados.
          </p>

          <div class="corp-features">
            <div class="feat-item">
              <div class="feat-icon-box">
                <img src="assets/icons/icon-quote-pencil.png" alt="Cotação Rápida" class="feat-custom-img" />
              </div>
              <div>
                <strong>Cotação em até 30 min</strong>
                <span>Resposta ágil com disponibilidade de estoque real</span>
              </div>
            </div>
            <div class="feat-item">
              <div class="feat-icon-box">
                <img src="assets/icons/icon-cart-check.png" alt="Boleto Faturado CNPJ" class="feat-custom-img" />
              </div>
              <div>
                <strong>Boleto Faturado CNPJ</strong>
                <span>Análise de crédito descomplicada para sua empresa</span>
              </div>
            </div>
            <div class="feat-item">
              <div class="feat-icon-box">
                <img src="assets/icons/icon-user-account.png" alt="Apoio Técnico" class="feat-custom-img" />
              </div>
              <div>
                <strong>Apoio Técnico de Aplicação</strong>
                <span>Dimensionamento de tochas, gases e eletrodos</span>
              </div>
            </div>
          </div>
        </div>

        <div class="corp-right">
          <div class="corp-action-box">
            <span class="action-tag">TELEVENDAS & SUPORTE TÉCNICO</span>
            <strong class="action-phone">(11) 3508-9979</strong>
            <span class="action-sub">Segunda a Sexta das 08h às 18h</span>

            <div class="action-buttons">
              <a href="tel:1135089979" class="btn-corp-call">
                <span class="material-symbols-outlined" aria-hidden="true">call</span>
                <span>Ligar Agora</span>
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener" class="btn-corp-ig">
                <img src="assets/icons/icon-instagram.png" alt="Instagram" class="corp-ig-img" />
                <span>Instagram Oficial</span>
              </a>
              <a routerLink="/conta" class="btn-corp-portal">
                <span class="material-symbols-outlined" aria-hidden="true">domain</span>
                <span>Acessar Portal B2B</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--hw-space-12);
    }
    .corp-section {
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-xl);
      padding: 40px;
      box-shadow: var(--hw-shadow-card);
      position: relative;
      overflow: hidden;
    }
    .corp-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 40px;
    }
    .corp-left {
      flex: 1;
      max-width: 680px;
    }
    .corp-pill {
      display: inline-block;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #1d4fd8;
      background: #eff6ff;
      border: 1px solid #dbeafe;
      padding: 4px 12px;
      border-radius: var(--hw-radius-pill);
      margin-bottom: 12px;
    }
    .corp-title {
      font-size: 24px;
      font-weight: 800;
      color: var(--hw-text);
      letter-spacing: -0.02em;
      line-height: 1.25;
      margin: 0 0 10px;
    }
    .corp-desc {
      font-size: 14px;
      color: var(--hw-text-muted);
      line-height: 1.5;
      margin: 0 0 24px;
    }
    .corp-features {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .feat-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .feat-icon-box {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: #fff7ed;
      border: 1px solid #ffedd5;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .feat-custom-img {
      width: 22px;
      height: 22px;
      object-fit: contain;
      display: block;
    }
    .feat-item strong {
      font-size: 13px;
      font-weight: 700;
      color: var(--hw-text);
      display: block;
      margin-bottom: 2px;
      line-height: 1.25;
    }
    .feat-item span {
      font-size: 11px;
      color: var(--hw-text-muted);
      line-height: 1.35;
      display: block;
    }

    .corp-right {
      flex-shrink: 0;
    }
    .corp-action-box {
      background: #0f172a;
      border-radius: var(--hw-radius-lg);
      padding: 28px 32px;
      text-align: center;
      color: #ffffff;
      box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.3);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .action-tag {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: #38bdf8;
      margin-bottom: 6px;
    }
    .action-phone {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.01em;
      margin-bottom: 4px;
    }
    .action-sub {
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 20px;
    }
    .action-buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }
    .btn-corp-call {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #16a34a;
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 20px;
      border-radius: var(--hw-radius-md);
      transition: background 0.2s ease, transform 0.15s ease;
    }
    .btn-corp-call:hover {
      background: #15803d;
      transform: translateY(-1px);
    }
    .btn-corp-ig {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: var(--hw-radius-md);
      border: 1px solid rgba(255, 255, 255, 0.18);
      transition: background 0.2s ease, border-color 0.2s ease;
    }
    .btn-corp-ig:hover {
      background: rgba(255, 255, 255, 0.16);
      border-color: rgba(255, 255, 255, 0.35);
    }
    .corp-ig-img {
      width: 18px;
      height: 18px;
      object-fit: contain;
    }
    .btn-corp-portal {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: var(--hw-radius-md);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: background 0.2s ease;
    }
    .btn-corp-portal:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    .btn-corp-call span.material-symbols-outlined,
    .btn-corp-portal span.material-symbols-outlined {
      font-size: 18px;
    }

    @media (max-width: 1024px) {
      .corp-container {
        flex-direction: column;
        align-items: stretch;
      }
      .corp-features {
        grid-template-columns: 1fr;
        gap: 12px;
      }
    }
    @media (max-width: 600px) {
      .corp-section {
        padding: 24px 20px;
      }
      .corp-title {
        font-size: 20px;
      }
    }
  `,
})
export class HwCorporateBanner {}

/** Banner de Newsletter e Ofertas VIP Industriais */
@Component({
  selector: 'hw-newsletter-banner',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="news-section">
      <div class="news-content">
        <div class="news-left">
          <div class="news-icon-wrap">
            <span class="material-symbols-outlined" aria-hidden="true">mark_email_unread</span>
          </div>
          <div class="news-texts">
            <h3>Receba Tabela B2B & Ofertas Exclusivas</h3>
            <p>Cadastre o e-mail da sua empresa para receber lançamentos, cupons e condições de fábrica antecipadas.</p>
          </div>
        </div>

        <div class="news-right">
          @if (inscrito()) {
            <div class="news-sucesso">
              <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
              <span>E-mail cadastrado com sucesso! Em breve você receberá nossas ofertas.</span>
            </div>
          } @else {
            <form (submit)="inscrever($event)" class="news-form">
              <div class="input-wrap">
                <span class="material-symbols-outlined input-icon" aria-hidden="true">mail</span>
                <input
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  placeholder="Digite o e-mail da sua empresa"
                  required
                />
              </div>
              <button type="submit" class="btn-news">
                <span>Inscrever-se</span>
                <span class="material-symbols-outlined" aria-hidden="true">send</span>
              </button>
            </form>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--hw-space-12);
    }
    .news-section {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid #334155;
      border-radius: var(--hw-radius-xl);
      padding: 32px 36px;
      color: #ffffff;
      box-shadow: var(--hw-shadow-card);
    }
    .news-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
    }
    .news-left {
      display: flex;
      align-items: center;
      gap: 20px;
      flex: 1;
    }
    .news-icon-wrap {
      width: 54px;
      height: 54px;
      border-radius: 14px;
      background: rgba(29, 79, 216, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .news-icon-wrap span {
      font-size: 28px;
    }
    .news-texts h3 {
      font-size: 18px;
      font-weight: 800;
      margin: 0 0 4px;
      letter-spacing: -0.01em;
    }
    .news-texts p {
      font-size: 13px;
      color: #94a3b8;
      margin: 0;
      line-height: 1.4;
    }

    .news-right {
      flex: 1;
      max-width: 480px;
    }
    .news-form {
      display: flex;
      gap: 10px;
      width: 100%;
    }
    .input-wrap {
      position: relative;
      flex: 1;
    }
    .input-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: #64748b;
      font-size: 20px;
    }
    .input-wrap input {
      width: 100%;
      height: 46px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid #475569;
      border-radius: var(--hw-radius-md);
      padding: 0 16px 0 44px;
      color: #ffffff;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .input-wrap input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
    }
    .input-wrap input::placeholder {
      color: #64748b;
    }
    .btn-news {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1d4fd8;
      color: #ffffff;
      border: none;
      border-radius: var(--hw-radius-md);
      padding: 0 20px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s ease, transform 0.15s ease;
    }
    .btn-news:hover {
      background: #2563eb;
      transform: translateY(-1px);
    }
    .btn-news span.material-symbols-outlined {
      font-size: 16px;
    }

    .news-sucesso {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(22, 163, 74, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
      padding: 12px 18px;
      border-radius: var(--hw-radius-md);
      font-size: 13px;
      font-weight: 600;
    }

    @media (max-width: 900px) {
      .news-content {
        flex-direction: column;
        align-items: flex-start;
        gap: 20px;
      }
      .news-right {
        width: 100%;
        max-width: 100%;
      }
      .news-form {
        flex-direction: column;
      }
      .btn-news {
        height: 44px;
        justify-content: center;
      }
    }
  `,
})
export class HwNewsletterBanner {
  email = '';
  inscrito = signal(false);

  inscrever(e: Event): void {
    e.preventDefault();
    if (this.email && this.email.includes('@')) {
      this.inscrito.set(true);
    }
  }
}

/** Slider de Marcas Parceiras (Navegue por marcas - Padrão E-commerce Industrial) */
@Component({
  selector: 'hw-brands-slider',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="marcas-section" aria-label="Navegue por marcas parceiras">
      <div class="marcas-header">
        <h2 class="marcas-titulo">Navegue por marcas</h2>
        <div class="marcas-linha" aria-hidden="true"></div>
      </div>

      <div class="marcas-slider-wrapper">
        <!-- Botão Navegação Anterior (Esquerda) -->
        <button
          type="button"
          class="marcas-nav-btn prev-btn"
          (click)="prev()"
          aria-label="Marca anterior"
        >
          <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>

        <!-- Container Swiper -->
        <div #brandsSwiperRef class="swiper marcas-swiper">
          <div class="swiper-wrapper">
            @for (m of marcas; track m.id) {
              <div class="swiper-slide marca-slide">
                <a
                  [routerLink]="['/busca']"
                  [queryParams]="{ q: m.nome }"
                  class="marca-card"
                  [title]="'Ver produtos ' + m.nome"
                >
                  <img
                    [src]="m.logo"
                    [alt]="m.nome"
                    class="marca-logo"
                    loading="lazy"
                  />
                </a>
              </div>
            }
          </div>
        </div>

        <!-- Botão Navegação Próximo (Direita) -->
        <button
          type="button"
          class="marcas-nav-btn next-btn"
          (click)="next()"
          aria-label="Próxima marca"
        >
          <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--hw-space-10);
    }
    .marcas-section {
      width: 100%;
      position: relative;
    }

    /* Cabeçalho "Navegue por marcas" com Linha Laranja idêntica à referência */
    .marcas-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    .marcas-titulo {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1e293b;
      margin: 0;
      white-space: nowrap;
      font-family: var(--hw-font-sans);
    }
    .marcas-linha {
      flex: 1;
      height: 2px;
      background: #f97316;
      border-radius: 2px;
      opacity: 0.95;
    }

    /* Wrapper do Slider com Botões Circulares Flutuantes */
    .marcas-slider-wrapper {
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
    }

    .marcas-swiper {
      width: 100%;
      overflow: hidden;
      padding: 6px 2px 10px;
      position: relative;
    }

    ::ng-deep .marcas-swiper {
      .swiper-wrapper {
        display: flex !important;
        flex-direction: row !important;
        align-items: stretch !important;
      }
    }

    .marca-slide {
      height: auto;
      display: flex;
      box-sizing: border-box;
    }

    /* Card da Marca (Estilo idêntico ao screenshot: bordas arredondadas, fundo branco, logo centralizado) */
    .marca-card {
      width: 100%;
      height: 106px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px 22px;
      text-decoration: none;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
      cursor: pointer;
    }
    .marca-card:hover {
      border-color: #fdba74;
      box-shadow: 0 8px 24px -4px rgba(249, 115, 22, 0.16);
      transform: translateY(-3px);
    }
    .marca-logo {
      max-width: 90%;
      max-height: 54px;
      width: auto;
      height: auto;
      object-fit: contain;
      transition: all 0.22s ease;
      display: block;
    }
    .marca-card:hover .marca-logo {
      transform: scale(1.06);
    }

    /* Botões Circulares com Seta Laranja (idênticos à referência) */
    .marcas-nav-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 20;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
      color: #f97316;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .marcas-nav-btn:hover {
      background: #fff7ed;
      border-color: #fdba74;
      color: #ea580c;
      transform: translateY(-50%) scale(1.1);
      box-shadow: 0 4px 14px rgba(249, 115, 22, 0.25);
    }
    .marcas-nav-btn:active {
      transform: translateY(-50%) scale(0.96);
    }
    .marcas-nav-btn span {
      font-size: 22px;
      line-height: 1;
      font-weight: 700;
    }
    .prev-btn {
      left: -12px;
    }
    .next-btn {
      right: -12px;
    }

    @media (max-width: 900px) {
      .marca-card {
        height: 94px;
        padding: 12px 16px;
        border-radius: 12px;
      }
      .marca-logo {
        max-height: 46px;
      }
    }

    @media (max-width: 640px) {
      .marcas-titulo {
        font-size: 17px;
      }
      .marcas-nav-btn {
        width: 30px;
        height: 30px;
      }
      .marcas-nav-btn span {
        font-size: 18px;
      }
      .prev-btn {
        left: -6px;
      }
      .next-btn {
        right: -6px;
      }
      .marca-card {
        height: 84px;
        padding: 10px 14px;
      }
      .marca-logo {
        max-height: 40px;
      }
    }
  `,
})
export class HwBrandsSlider implements OnDestroy {
  @ViewChild('brandsSwiperRef') brandsSwiperRef?: ElementRef<HTMLElement>;
  private swiperInstance: Swiper | null = null;

  readonly marcas = [
    {
      id: 'black-decker',
      nome: 'BLACK+DECKER',
      logo: 'assets/brands/black-decker.png',
    },
    {
      id: 'garthen',
      nome: 'Garthen',
      logo: 'assets/brands/garthen.png',
    },
    {
      id: 'motomil',
      nome: 'MOTOMIL',
      logo: 'assets/brands/motomil.png',
    },
    {
      id: 'pressure',
      nome: 'Pressure',
      logo: 'assets/brands/pressure.png',
    },
    {
      id: 'paletrans',
      nome: 'Paletrans',
      logo: 'assets/brands/paletrans.png',
    },
    {
      id: 'esab',
      nome: 'ESAB',
      logo: 'assets/brands/esab.svg',
    },
    {
      id: 'miller',
      nome: 'Miller Electric',
      logo: 'assets/brands/miller.svg',
    },
    {
      id: 'lincoln',
      nome: 'Lincoln Electric',
      logo: 'assets/brands/lincoln-electric.svg',
    },
    {
      id: 'boxer',
      nome: 'Boxer Soldas',
      logo: 'assets/brands/boxer.svg',
    },
    {
      id: 'balmer',
      nome: 'Balmer',
      logo: 'assets/brands/balmer.svg',
    },
    {
      id: 'bambozzi',
      nome: 'Bambozzi',
      logo: 'assets/brands/bambozzi.svg',
    },
    {
      id: 'norton',
      nome: 'Norton Abrasivos',
      logo: 'assets/brands/norton.svg',
    },
    {
      id: 'carbografite',
      nome: 'Carbografite',
      logo: 'assets/brands/carbografite.svg',
    },
  ];

  constructor() {
    afterNextRender(() => {
      this.initSwiper();
    });
  }

  ngOnDestroy(): void {
    if (this.swiperInstance) {
      this.swiperInstance.destroy(true, true);
      this.swiperInstance = null;
    }
  }

  prev(): void {
    this.swiperInstance?.slidePrev();
  }

  next(): void {
    this.swiperInstance?.slideNext();
  }

  private initSwiper(): void {
    if (!this.brandsSwiperRef?.nativeElement) return;

    this.swiperInstance = new Swiper(this.brandsSwiperRef.nativeElement, {
      modules: [Autoplay, Navigation, A11y],
      slidesPerView: 2.2,
      spaceBetween: 12,
      loop: true,
      speed: 600,
      grabCursor: true,
      autoplay: {
        delay: 2600,
        disableOnInteraction: false,
        pauseOnMouseEnter: true,
      },
      breakpoints: {
        480: {
          slidesPerView: 2.8,
          spaceBetween: 14,
        },
        640: {
          slidesPerView: 3.5,
          spaceBetween: 16,
        },
        900: {
          slidesPerView: 4.8,
          spaceBetween: 16,
        },
        1200: {
          slidesPerView: 5.8,
          spaceBetween: 18,
        },
      },
    });
  }
}

