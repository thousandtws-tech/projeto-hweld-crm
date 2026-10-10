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
  imports: [RouterLink],
  templateUrl: './slider-pro.html',
  styleUrl: './slider-pro.scss',
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
      subtitle:
        'Capture stunning aerial views. Professional-grade drone for creators and adventurers.',
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
