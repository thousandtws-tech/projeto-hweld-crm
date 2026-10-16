import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  effect,
  inject,
  signal,
} from '@angular/core';
import Swiper from 'swiper';
import { Pagination, Autoplay, Parallax, A11y } from 'swiper/modules';
import { gsap } from 'gsap';
import { CmsStore } from '../../../core/cms.store';

@Component({
  selector: 'hw-slider-pro',
  imports: [],
  templateUrl: './slider-pro.html',
  styleUrl: './slider-pro.scss',
})
export class HwSliderPro implements OnInit, OnDestroy {
  @ViewChild('swiperRef', { static: true }) swiperRef!: ElementRef<HTMLElement>;

  private swiperInstance: Swiper | null = null;
  private animLevitacao: gsap.core.Tween | null = null;
  readonly cms = inject(CmsStore);
  slideAtivoIndex = signal(0);

  readonly slides = this.cms.slides;

  constructor() {
    afterNextRender(() => {
      this.initSwiper();
    });
    effect(() => {
      this.slides();
      setTimeout(() => {
        if (this.swiperInstance) {
          this.swiperInstance.destroy(true, true);
          this.swiperInstance = null;
        }
        this.initSwiper();
      }, 0);
    });
  }

  ngOnInit(): void {
    this.cms.carregar();
  }

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
            },
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
            },
          );
        }
      }
    }
