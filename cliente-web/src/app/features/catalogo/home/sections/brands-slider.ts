import { Component, ElementRef, OnDestroy, ViewChild, afterNextRender } from '@angular/core';
import { RouterLink } from '@angular/router';
import Swiper from 'swiper';
import { Autoplay, Navigation, A11y } from 'swiper/modules';

@Component({
  selector: 'hw-brands-slider',
  imports: [RouterLink],
  templateUrl: './brands-slider.html',
  styleUrl: './brands-slider.scss',
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
