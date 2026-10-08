import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  signal,
  afterNextRender,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import Swiper from 'swiper';
import { Pagination, Autoplay, Parallax, A11y } from 'swiper/modules';
import { gsap } from 'gsap';

export interface SlideItem {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  price: string;
  buttonText: string;
  buttonLink: string;
  bgImage: string;
  productImage: string;
  classe: 'slide-nike' | 'slide-apple' | 'slide-jbl' | 'slide-dji';
}

@Component({
  selector: 'hw-slider-pro',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="slider-full-bleed">
      <div #swiperRef class="swiper pro-swiper">
        <div class="swiper-wrapper">
          @for (s of slides; track s.id; let idx = $index) {
            <div class="swiper-slide slide-card {{ s.classe }}" [attr.data-slide-index]="idx">
              <!-- Banner de Fundo Original Colorido com Efeito Parallax -->
              <div
                class="slide-bg"
                [style.background-image]="'url(' + s.bgImage + ')'"
                data-swiper-parallax="-25%"
              ></div>

              <!-- Conteúdo do Banner (100% Contido e Alinhado) -->
              <div class="slide-inner">
                <!-- Coluna de Informações -->
                <div class="slide-content">
                  <!-- Badge Pill -->
                  <div
                    class="slide-badge-wrap anim-item"
                    data-swiper-parallax="-90"
                    data-swiper-parallax-opacity="0.3"
                  >
                    <span class="slide-badge">{{ s.badge }}</span>
                  </div>

                  <!-- Título Grande com Quebra de Linha -->
                  <h1
                    class="slide-title anim-item"
                    [innerHTML]="s.title"
                    data-swiper-parallax="-260"
                  ></h1>

                  <!-- Subtítulo / Descrição -->
                  <p
                    class="slide-subtitle anim-item"
                    data-swiper-parallax="-170"
                    data-swiper-parallax-opacity="0.4"
                  >
                    {{ s.subtitle }}
                  </p>

                  <!-- Preço em Destaque -->
                  <div
                    class="slide-price anim-item"
                    data-swiper-parallax="-130"
                  >
                    {{ s.price }}
                  </div>

                  <!-- Botão de Ação -->
                  <div
                    class="slide-action anim-item"
                    data-swiper-parallax="-100"
                  >
                    <a [routerLink]="s.buttonLink" class="btn-buy">
                      <span>{{ s.buttonText }}</span>
                      <span class="material-symbols-outlined seta-btn" aria-hidden="true">arrow_forward</span>
                    </a>
                  </div>
                </div>

                <!-- Coluna do Produto com Perspectiva 3D e Parallax -->
                <div
                  class="slide-product-col"
                  data-swiper-parallax="280"
                  data-swiper-parallax-scale="0.88"
                  data-swiper-parallax-opacity="0.2"
                >
                  <div class="product-stage">
                    <img
                      [src]="s.productImage"
                      [alt]="s.badge"
                      class="product-img anim-product"
                      loading="eager"
                    />
                  </div>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Barra Inferior de Paginação em Linhas Dinâmicas (Centralizada e Limpa) -->
        <div class="pro-controls-bar">
          <div class="swiper-pagination pro-pagination"></div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .slider-full-bleed {
      width: 100vw;
      position: relative;
      left: 50%;
      right: 50%;
      margin-left: -50vw;
      margin-right: -50vw;
      margin-top: calc(-1 * var(--hw-space-8));
      margin-bottom: var(--hw-space-8);
      overflow: hidden;
      display: block;
    }

    /* Container do Swiper: Altura expandida e visual limpo */
    .pro-swiper {
      width: 100%;
      height: 780px;
      position: relative;
      overflow: hidden !important;
      user-select: none;
      display: block;
      background: #000000;
    }

    /* Garante que os slides fiquem ESTRITAMENTE em linha horizontal e nunca empilhem */
    ::ng-deep .pro-swiper {
      .swiper-wrapper {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        width: 100% !important;
        height: 100% !important;
        position: relative !important;
        box-sizing: content-box !important;
        transform: translate3d(0, 0, 0);
      }

      .swiper-slide {
        flex: 0 0 100% !important;
        width: 100% !important;
        height: 100% !important;
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
    }

    .slide-card {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      overflow: hidden;
      box-sizing: border-box;
    }

    /* Imagem de Fundo Colorida Original do Banner */
    .slide-bg {
      position: absolute;
      top: 0;
      left: -15%;
      width: 130%;
      height: 100%;
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
      pointer-events: none;
      z-index: 1;
    }

    /* Container do Conteúdo Alinhado (100% da altura do slide) */
    .slide-inner {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      max-width: 1440px;
      margin: 0 auto;
      padding: 0 64px;
      display: grid;
      grid-template-columns: 1.15fr 0.95fr;
      align-items: center;
      gap: 32px;
      box-sizing: border-box;
    }

    /* Coluna de Textos */
    .slide-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: #ffffff;
      max-width: 650px;
    }

    /* Badge em Pill */
    .slide-badge-wrap {
      display: inline-flex;
    }
    .slide-badge {
      display: inline-block;
      padding: 5px 14px;
      border: 1.5px solid rgba(255, 255, 255, 0.45);
      background: rgba(0, 0, 0, 0.18);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
      backdrop-filter: blur(8px);
    }

    /* Título Grande */
    .slide-title {
      font-size: clamp(32px, 4.8vw, 68px);
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.035em;
      color: #ffffff;
      margin: 0;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }

    /* Subtítulo */
    .slide-subtitle {
      font-size: clamp(14px, 1.35vw, 17px);
      color: rgba(255, 255, 255, 0.92);
      line-height: 1.45;
      margin: 0;
      max-width: 480px;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    }

    /* Preço em Destaque */
    .slide-price {
      font-size: clamp(20px, 1.8vw, 26px);
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.02em;
      margin-top: 2px;
      text-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
    }

    /* Botão de Compra Branco Redondo */
    .slide-action {
      margin-top: 6px;
    }
    .btn-buy {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      height: 46px;
      padding: 0 26px;
      background: #ffffff;
      color: #1e293b;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
      transition: all 180ms ease;

      .seta-btn {
        font-size: 18px;
        transition: transform 160ms ease;
      }

      &:hover {
        background: #f8fafc;
        transform: translateY(-2px);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);

        .seta-btn {
          transform: translateX(4px);
        }
      }

      &:active {
        transform: translateY(0);
      }
    }

    /* Palco do Produto */
    .slide-product-col {
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      height: 100%;
    }

    .product-stage {
      width: 100%;
      max-width: 660px;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      perspective: 1000px;
    }

    .product-img {
      width: 100%;
      height: auto;
      max-height: 580px;
      object-fit: contain;
      filter: drop-shadow(0 25px 35px rgba(0, 0, 0, 0.45));
      transition: transform 300ms ease;
    }

    /* Rotação Fiel de Cada Produto */
    .slide-nike .product-img {
      transform: rotate(-22deg) scale(1.04);
    }
    .slide-apple .product-img {
      transform: rotate(4deg) scale(1.08);
    }
    .slide-jbl .product-img {
      transform: rotate(-10deg) scale(1.02);
    }
    .slide-dji .product-img {
      transform: rotate(6deg) scale(1.04);
    }

    /* Barra Inferior com Controles: Centralizada */
    .pro-controls-bar {
      position: absolute;
      bottom: 24px;
      left: 0;
      right: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    /* Paginação em Linhas Horizontais */
    .pro-pagination {
      position: static !important;
      width: auto !important;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      pointer-events: auto;

      ::ng-deep .swiper-pagination-bullet {
        width: 40px;
        height: 4px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.38);
        opacity: 1;
        transition: all 260ms ease;
        margin: 0 !important;
        cursor: pointer;
      }
      ::ng-deep .swiper-pagination-bullet-active {
        width: 64px;
        background: #ffffff;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
      }
    }

    /* Responsividade Mobile (430x932) */
    @media (max-width: 960px) {
      .pro-swiper {
        height: 620px;
      }
      ::ng-deep .pro-swiper .swiper-slide {
        height: 620px !important;
      }
      .slide-inner {
        grid-template-columns: 1fr;
        padding: 32px 20px 60px;
        gap: 14px;
      }
      .slide-product-col {
        order: -1;
        height: auto;
      }
      .product-stage {
        max-width: 280px;
      }
      .product-img {
        max-height: 220px;
      }
      .slide-nike .product-img {
        transform: rotate(-14deg) scale(1);
      }
      .slide-apple .product-img {
        transform: rotate(2deg) scale(1.02);
      }
      .slide-title {
        font-size: 32px;
      }
      .pro-controls-bar {
        bottom: 16px;
      }
    }

    @media (max-width: 768px) {
      .slider-full-bleed {
        margin-top: calc(-1 * var(--hw-space-4));
        margin-bottom: var(--hw-space-5);
      }
      .pro-swiper {
        height: 560px;
      }
      ::ng-deep .pro-swiper .swiper-slide {
        height: 560px !important;
      }
      .btn-buy {
        width: 100%;
        justify-content: center;
      }
    }
  `,
})
export class HwSliderPro implements OnInit, OnDestroy {
  @ViewChild('swiperRef', { static: true }) swiperRef!: ElementRef<HTMLElement>;

  private swiperInstance: Swiper | null = null;
  private animLevitacao: gsap.core.Tween | null = null;
  slideAtivoIndex = signal(0);

  readonly slides: SlideItem[] = [
    {
      id: 'nike-airmax',
      badge: 'NIKE AIRMAX',
      title: 'New Airmax.<br>Perfect in All.',
      subtitle: 'Iconic comfort meets modern style. New Airmax collection is here.',
      price: '$59.99',
      buttonText: 'Buy Now',
      buttonLink: '/busca',
      bgImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/4288d8c1-4dd9-4e5e-ba6a-24bf662014e6.jpeg',
      productImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/f02e77be-5d07-4e2a-a2a9-9f0241cceccb.png',
      classe: 'slide-nike',
    },
    {
      id: 'apple-watch',
      badge: 'APPLE WATCH',
      title: 'Take your workouts<br>further.',
      subtitle: 'Stay motivated and connected. The ultimate fitness companion.',
      price: '$359.99',
      buttonText: 'Buy Now',
      buttonLink: '/busca',
      bgImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/40b72352-1ed0-463c-a258-72127fe987b5.jpeg',
      productImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/3430e33a-461c-48fd-92f8-96e769265b77.png',
      classe: 'slide-apple',
    },
    {
      id: 'jbl-charge',
      badge: 'JBL CHARGE 3',
      title: 'Wireless Bluetooth<br>Streaming.',
      subtitle: 'Powerful sound with deep bass. Portable, waterproof, and ready for adventure.',
      price: '$59.99',
      buttonText: 'Buy Now',
      buttonLink: '/busca',
      bgImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/7a3eded9-bf8d-4a8a-b4ba-c6a8ef68529e.jpeg',
      productImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/7f647753-8e34-4ab7-a902-dec468c23f08.png',
      classe: 'slide-jbl',
    },
    {
      id: 'dji-mavic',
      badge: 'DJI MAVIC 2',
      title: 'See the<br>Bigger Picture.',
      subtitle: 'Capture stunning aerial views. Professional-grade drone for creators and adventurers.',
      price: '$59.99',
      buttonText: 'Buy Now',
      buttonLink: '/busca',
      bgImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/55847ae0-f6a4-4225-a4e9-fc12e45581c2.jpeg',
      productImage:
        'https://files.elfsightcdn.com/f7e9a9de-578a-404d-9755-29717c16030a/c1abb914-662f-48b7-a588-0889f1e161b0.png',
      classe: 'slide-dji',
    },
  ];

  constructor() {
    afterNextRender(() => {
      this.initSwiper();
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.animLevitacao) {
      this.animLevitacao.kill();
    }
    if (this.swiperInstance) {
      this.swiperInstance.destroy(true, true);
      this.swiperInstance = null;
    }
  }

  private initSwiper(): void {
    if (!this.swiperRef?.nativeElement) return;

    this.swiperInstance = new Swiper(this.swiperRef.nativeElement, {
      modules: [Pagination, Autoplay, Parallax, A11y],
      direction: 'horizontal',
      slidesPerView: 1,
      spaceBetween: 0,
      speed: 800,
      parallax: true,
      loop: true,
      grabCursor: true,
      watchOverflow: true,
      autoplay: {
        delay: 4500,
        disableOnInteraction: false,
        pauseOnMouseEnter: false,
      },
      pagination: {
        el: '.pro-pagination',
        clickable: true,
      },
      on: {
        init: (swiper) => {
          this.slideAtivoIndex.set(swiper.realIndex);
          this.triggerSlideAnimations(swiper.el);
        },
        slideChange: (swiper) => {
          this.slideAtivoIndex.set(swiper.realIndex);
          this.triggerSlideAnimations(swiper.el);
        },
      },
    });
  }

  private triggerSlideAnimations(container: HTMLElement): void {
    const activeSlide = container.querySelector('.swiper-slide-active');
    if (!activeSlide) return;

    if (this.animLevitacao) {
      this.animLevitacao.kill();
    }

    const items = activeSlide.querySelectorAll('.anim-item');
    const productImg = activeSlide.querySelector('.anim-product');

    // Entrada suave dos textos (GSAP Stagger)
    if (items.length > 0) {
      gsap.fromTo(
        items,
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.07,
          ease: 'power3.out',
          overwrite: 'auto',
        }
      );
    }

    // Efeito de aproximação 3D e levitação do produto
    if (productImg) {
      gsap.fromTo(
        productImg,
        { opacity: 0, scale: 0.92, y: 15 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.75,
          ease: 'power2.out',
          overwrite: 'auto',
          onComplete: () => {
            this.animLevitacao = gsap.to(productImg, {
              y: -10,
              duration: 2.5,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
            });
          },
        }
      );
    }
  }
}
