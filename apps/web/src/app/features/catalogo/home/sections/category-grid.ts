import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  computed,
  effect,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import Swiper from 'swiper';
import { Autoplay, Navigation, A11y } from 'swiper/modules';
import { CategoriasStore } from '../../../../core/categorias.store';

export interface ItemCategoriaVitrine {
  id: string;
  nome: string;
  descricao?: string | null;
  link: string;
  imagem: string;
  cadastrada?: boolean;
}

/** Slider Contínuo Automático de Categorias Populares (Padrão E-commerce Swiper) */
@Component({
  selector: 'hw-category-grid',
  imports: [RouterLink],
  templateUrl: './category-grid.html',
  styleUrl: './category-grid.scss',
})
export class HwCategoryGrid implements OnInit, OnDestroy {
  @ViewChild('catSwiperRef') catSwiperRef?: ElementRef<HTMLElement>;
  private swiperInstance: Swiper | null = null;
  private categoriasStore = inject(CategoriasStore);

  private readonly categoriasPadrao: ItemCategoriaVitrine[] = [
    {
      id: 'maquinas',
      nome: 'Máquinas de Solda',
      link: '/busca?q=inversora',
      imagem:
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'epis',
      nome: 'EPIs & Proteção',
      link: '/busca?q=mascara',
      imagem:
        'https://images.unsplash.com/photo-1508873535684-277a3cbcc4e8?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'tochas',
      nome: 'Tochas & Acessórios',
      link: '/busca?q=tocha',
      imagem:
        'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'arames',
      nome: 'Consumíveis & Arames',
      link: '/busca?q=eletrodo',
      imagem:
        'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'plasma',
      nome: 'Corte Plasma & CNC',
      link: '/busca?q=plasma',
      imagem:
        'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'ferramentas',
      nome: 'Ferramentas Industriais',
      link: '/busca?q=ferramenta',
      imagem:
        'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'gases',
      nome: 'Gases & Reguladores',
      link: '/busca?q=regulador',
      imagem:
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    },
    {
      id: 'abrasivos',
      nome: 'Abrasivos & Discos',
      link: '/busca?q=disco',
      imagem:
        'https://images.unsplash.com/photo-1618090584176-7132b9911657?auto=format&fit=crop&w=800&q=80',
    },
  ];

  /**
   * Algoritmo de vitrine de categorias:
   * Se houver categorias reais cadastradas no admin com imagem, exibe apenas elas.
   * Caso contrário, exibe as categorias industriais padrão como fallback.
   */
  readonly categorias = computed<ItemCategoriaVitrine[]>(() => {
    const reaisComImg: ItemCategoriaVitrine[] = [...this.categoriasStore.categorias()]
      .filter((c) => Boolean(c.imagem_url?.trim()))
      .sort(
        (a, b) =>
          Number(Boolean(a.categoria_pai_id)) - Number(Boolean(b.categoria_pai_id)) ||
          a.ordem - b.ordem ||
          a.id - b.id,
      )
      .map((c) => ({
        id: `cat-${c.id}`,
        nome: c.nome,
        descricao: c.descricao,
        link: `/c/${c.id}-${c.slug}`,
        imagem: c.imagem_url!,
        cadastrada: true,
      }));
    return reaisComImg.length > 0 ? reaisComImg : this.categoriasPadrao;
  });

  constructor() {
    afterNextRender(() => {
      this.initSwiper();
    });
    effect(() => {
      this.categorias();
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
    this.categoriasStore.carregar();
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
