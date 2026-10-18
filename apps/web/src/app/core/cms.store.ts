import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { RealtimeService } from './realtime';

export interface MarcaCms {
  id: string;
  nome: string;
  logo: string;
  ativa: boolean;
}

export interface SlideBannerCms {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  price: string;
  button_text: string;
  button_link: string;
  bg_image: string;
  image_mobile: string;
  product_image: string;
  classe: string;
  ativo: boolean;
}

export interface CardTrioCms {
  id: string;
  badge: string;
  titulo: string;
  descricao: string;
  preco_destaque: string;
  botao_texto: string;
  botao_link: string;
  imagem_url: string;
  cor: string;
  ativo: boolean;
}

export interface CardDuoCms {
  id: string;
  tag: string;
  titulo: string;
  descricao: string;
  destaque: string;
  botao_texto: string;
  botao_link: string;
  imagem_url: string;
  estilo: string;
  ativo: boolean;
}

export interface SeloCms {
  id: string;
  titulo: string;
  descricao: string;
  link: string;
  icone_url: string;
  externo: boolean;
  ativo: boolean;
}

export interface CmsLoja {
  marcas: MarcaCms[];
  slides: SlideBannerCms[];
  trio_banners: CardTrioCms[];
  duo_banners: CardDuoCms[];
  selos: SeloCms[];
}

const CMS_FALLBACK: CmsLoja = {
  marcas: [
    { id: 'esab', nome: 'ESAB', logo: 'assets/brands/esab.svg', ativa: true },
    { id: 'miller', nome: 'Miller Electric', logo: 'assets/brands/miller.svg', ativa: true },
    {
      id: 'lincoln',
      nome: 'Lincoln Electric',
      logo: 'assets/brands/lincoln-electric.svg',
      ativa: true,
    },
    { id: 'boxer', nome: 'Boxer Soldas', logo: 'assets/brands/boxer.svg', ativa: true },
    { id: 'balmer', nome: 'Balmer', logo: 'assets/brands/balmer.svg', ativa: true },
    { id: 'bambozzi', nome: 'Bambozzi', logo: 'assets/brands/bambozzi.svg', ativa: true },
    { id: 'norton', nome: 'Norton Abrasivos', logo: 'assets/brands/norton.svg', ativa: true },
    { id: 'carbografite', nome: 'Carbografite', logo: 'assets/brands/carbografite.svg', ativa: true },
  ],
  slides: [
    {
      id: 'ferramentas-eletricas',
      badge: '',
      title: '',
      subtitle: '',
      price: '',
      button_text: '',
      button_link: '/busca',
      bg_image: 'assets/header/banner/icons/fundo.1.png',
      image_mobile: 'assets/header/banner/icons/fundo.1-mobile.png',
      product_image: '',
      classe: 'slide-ferramentas',
      ativo: true,
    },
    {
      id: 'soldagem',
      badge: '',
      title: '',
      subtitle: '',
      price: '',
      button_text: '',
      button_link: '/busca',
      bg_image: 'assets/header/banner/icons/fundo.2.png',
      image_mobile: 'assets/header/banner/icons/fundo.2-mobile.png',
      product_image: '',
      classe: 'slide-soldagem',
      ativo: true,
    },
  ],
  trio_banners: [
    {
      id: 'trio-1',
      badge: 'ATÉ 35% OFF',
      titulo: 'Inversoras Industriais IGBT',
      descricao:
        'Arc Force, Hot Start e bivolt automático para alta produtividade em serralheria.',
      preco_destaque: 'A partir de R$ 689,90',
      botao_texto: 'Ver Ofertas',
      botao_link: '/busca?q=inversora',
      imagem_url:
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
      cor: 'orange',
      ativo: true,
    },
    {
      id: 'trio-2',
      badge: 'PROTEÇÃO CERTIFICADA',
      titulo: 'Máscaras de Auto-Escurecimento',
      descricao:
        'Filtro True Color DIN 9-13, 4 sensores e máxima ergonomia com CA ativo.',
      preco_destaque: 'Parcele em até 10x sem juros',
      botao_texto: 'Conferir Linha',
      botao_link: '/busca?q=mascara',
      imagem_url:
        'https://images.unsplash.com/photo-1508873535684-277a3cbcc4e8?auto=format&fit=crop&w=800&q=80',
      cor: 'cyan',
      ativo: true,
    },
    {
      id: 'trio-3',
      badge: 'FATURAMENTO B2B',
      titulo: 'Arames MIG & Eletrodos E7018',
      descricao:
        'Caixas fechadas e bobinas de 15kg com desconto progressivo para CNPJ.',
      preco_destaque: 'Preço direto de distribuidora',
      botao_texto: 'Comprar Lote',
      botao_link: '/busca?q=eletrodo',
      imagem_url:
        'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=800&q=80',
      cor: 'blue',
      ativo: true,
    },
  ],
  duo_banners: [
    {
      id: 'duo-1',
      tag: 'LINHA CORTE CNC',
      titulo: 'Sistemas de Corte Plasma de Alta Definição',
      descricao:
        'Precisão milimétrica em aço carbono, inox e alumínio. Corte rápido com tochas de alta durabilidade e consumíveis de reposição imediata.',
      destaque: 'Corte até 32mm de espessura',
      botao_texto: 'Ver Máquinas Plasma',
      botao_link: '/busca?q=plasma',
      imagem_url:
        'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?auto=format&fit=crop&w=900&q=80',
      estilo: 'plasma',
      ativo: true,
    },
    {
      id: 'duo-2',
      tag: 'COMBOS PROFISSIONAIS',
      titulo: 'Kits Completos para Serralheria & Oficinas',
      descricao:
        'Leve Máquina Inversora + Máscara Automática + Tocha + Eletrodos com economia garantida de combo e frete unificado para sua empresa.',
      destaque: 'Economia de até R$ 420,00 no combo',
      botao_texto: 'Montar Meu Kit',
      botao_link: '/busca?q=kit',
      imagem_url:
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80',
      estilo: 'combo',
      ativo: true,
    },
  ],
  selos: [
    {
      id: 'entrega-brasil',
      titulo: 'Entrega em Todo o Brasil',
      descricao: '',
      link: '/conta/pedidos',
      icone_url: 'assets/header/icons/icon-map.png',
      externo: false,
      ativo: true,
    },
    {
      id: 'faturamento-direto',
      titulo: 'Faturamento Direto',
      descricao: '',
      link: '/conta',
      icone_url: 'assets/header/icons/icon-faturamento-direto.png',
      externo: false,
      ativo: true,
    },
    {
      id: 'cotacao-b2b',
      titulo: 'Cotação B2B em 30 min',
      descricao: 'Preço especial por lote e atacado',
      link: '/busca',
      icone_url: 'assets/header/icons/icon-cotacao.png',
      externo: false,
      ativo: true,
    },
    {
      id: 'portal-cnpj',
      titulo: 'Portal do Cliente CNPJ',
      descricao: '2ª via, faturas e suporte de fábrica',
      link: '/conta',
      icone_url: 'assets/header/icons/icon-usuario.png',
      externo: false,
      ativo: true,
    },
    {
      id: 'instagram',
      titulo: 'Instagram Oficial',
      descricao: 'Dicas técnicas e novidades @hweld',
      link: 'https://instagram.com',
      icone_url: 'assets/header/icons/icon-instagram.png',
      externo: true,
      ativo: true,
    },
  ],
};

@Injectable({ providedIn: 'root' })
export class CmsStore {
  private http = inject(HttpClient);
  private rt = inject(RealtimeService);

  private _cms = signal<CmsLoja>(CMS_FALLBACK);
  private carregado = false;

  readonly marcas = computed(() => this._cms().marcas.filter((m) => m.ativa));
  readonly slides = computed(() => this._cms().slides.filter((s) => s.ativo));
  readonly trioBanners = computed(() => this._cms().trio_banners.filter((c) => c.ativo));
  readonly duoBanners = computed(() => this._cms().duo_banners.filter((c) => c.ativo));
  // JSON antigo pode vir sem `selos` — o `?? []` evita crash antes do
  // backend popular o padrão (o `??` também cobre o fallback parcial).
  readonly selos = computed(() => (this._cms().selos ?? []).filter((s) => s.ativo));

  constructor() {
    effect(() => {
      if (this.rt.ultimo()?.tipo === 'cms.atualizado') {
        this.carregado = false;
        this.carregar();
      }
    });
  }

  carregar(): void {
    if (this.carregado) return;
    this.carregado = true;
    firstValueFrom(this.http.get<CmsLoja>(`${environment.apiUrl}/portal/cms`))
      .then((dados) => {
        if (dados) this._cms.set(dados);
      })
      .catch(() => {
        this.carregado = false;
      });
  }
}
