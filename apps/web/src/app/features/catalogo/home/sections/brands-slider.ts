import { ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import Swiper from 'swiper';
import { Autoplay, Navigation, A11y } from 'swiper/modules';
import { CmsStore } from '../../../../core/cms.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-brands-slider',
  imports: [RouterLink],
  templateUrl: './brands-slider.html',
  styleUrl: './brands-slider.scss',
})
export class HwBrandsSlider implements OnInit, OnDestroy {
  @ViewChild('brandsSwiperRef') brandsSwiperRef?: ElementRef<HTMLElement>;
  private swiperInstance: Swiper | null = null;
  private zone = inject(NgZone);
  readonly cms = inject(CmsStore);

  readonly marcas = this.cms.marcas;

  constructor() {
    // Init único + rebuild por mudança de dados via effect (cobre o mount);
    // Swiper fora da zona para o autoplay não acordar a change detection.
    effect(() => {
      this.marcas();
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
