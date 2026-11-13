import { ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import Swiper from 'swiper';
import { Pagination, Autoplay, Parallax, A11y } from 'swiper/modules';
import { CmsStore } from '../../../core/cms.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-slider-pro',
  imports: [],
  templateUrl: './slider-pro.html',
  styleUrl: './slider-pro.scss',
})
export class HwSliderPro implements OnInit, OnDestroy {
  @ViewChild('swiperRef', { static: true }) swiperRef!: ElementRef<HTMLElement>;

  private swiperInstance: Swiper | null = null;
  private zone = inject(NgZone);
  readonly cms = inject(CmsStore);
  slideAtivoIndex = signal(0);

  readonly slides = this.cms.slides;

  constructor() {
    // O effect cobre o init inicial e os rebuilds quando o CMS emite novos
    // slides — um único caminho evita a dupla instanciação do mount.
    // setTimeout(0) espera o @for do template estampar os slides novos.
    // O Swiper é criado fora da zona: o timer do autoplay não dispara CD.
    effect(() => {
      this.slides();
      setTimeout(() => {
        this.swiperInstance?.destroy(true, true);
        this.swiperInstance = null;
        this.zone.runOutsideAngular(() => this.initSwiper());
      }, 0);
    });
  }

  ngOnInit(): void {
    this.cms.carregar();
  }

  ngOnDestroy(): void {
    this.swiperInstance?.destroy(true, true);
    this.swiperInstance = null;
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
        init: (swiper) => this.slideAtivoIndex.set(swiper.realIndex),
        slideChange: (swiper) => this.slideAtivoIndex.set(swiper.realIndex),
      },
    });
  }
}
