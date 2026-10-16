import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CatalogoService, CarrinhoService, ContaService } from '../../core/servicos';
import { AuthStore } from '../../core/auth/auth.store';
import { CategoriasStore } from '../../core/categorias.store';
import { RealtimeService } from '../../core/realtime';
import { Endereco, ItemCatalogoPortal, ProdutoPortal } from '../../core/models';
import { QtyPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwPrice } from '../../shared/ui/price';
import { HwProductCard } from '../../shared/ui/product-card';
import { HwQty } from '../../shared/ui/qty';
import { HwRail } from '../../shared/ui/rail';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwEmpty } from '../../shared/ui/empty';
import { ToastService } from '../../shared/ui/toast';

/** S05 — PDP: detalhe de produto com padrões de marketplace (subtotal, compra
 *  direta, entrega, cross-sell, zoom, sticky buy bar mobile). */
@Component({
  imports: [
    RouterLink,
    MatTabsModule,
    MatButtonModule,
    MatTooltipModule,
    HwButton,
    HwPrice,
    HwProductCard,
    HwQty,
    HwRail,
    HwSkeleton,
    HwEmpty,
    QtyPipe,
  ],
  templateUrl: './produto.html',
  styleUrl: './produto.scss',
})
export class ProdutoPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private catalogo = inject(CatalogoService);
  private carrinho = inject(CarrinhoService);
  private conta = inject(ContaService);
  private auth = inject(AuthStore);
  private categorias = inject(CategoriasStore);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);

  produto = signal<ProdutoPortal | null>(null);

  /** Categoria do produto no breadcrumb — resolvida pela árvore compartilhada. */
  categoriaProduto = computed(() => {
    const p = this.produto();
    if (!p) return null;
    return this.categorias.categorias().find((c) => c.id === p.categoria_id) ?? null;
  });
  carregando = signal(true);
  erro = signal(false);
  adicionando = signal(false);
  qtd = signal(1);
  imgAtiva = signal<ProdutoPortal['imagens'][number] | null>(null);
  imgsFalhadas = signal<Set<number>>(new Set());
  relacionados = signal<ItemCatalogoPortal[]>([]);
  mesmaMarca = signal<ItemCatalogoPortal[]>([]);
  destaques = signal<ItemCatalogoPortal[]>([]);
  entrega = signal<Endereco | null>(null);
  copiado = signal(false);
  zoom = signal<{ x: number; y: number } | null>(null);
  private copiadoTimer?: ReturnType<typeof setTimeout>;

  /** Galeria ordenada (capa principal primeiro, depois ordem) e filtrada contra URLs quebradas. */
  imagensGaleria = computed(() => {
    const p = this.produto();
    if (!p?.imagens?.length) return [];
    const falhas = this.imgsFalhadas();
    return [...p.imagens]
      .filter((i) => Boolean(i.url?.trim()) && !falhas.has(i.id))
      .sort(
        (a, b) =>
          Number(b.is_principal) - Number(a.is_principal) || a.ordem - b.ordem || a.id - b.id,
      );
  });

  indiceImgAtiva = computed(() => {
    const lista = this.imagensGaleria();
    const ativa = this.imgAtiva();
    if (!ativa || lista.length === 0) return 0;
    const idx = lista.findIndex((i) => i.id === ativa.id);
    return idx >= 0 ? idx : 0;
  });

  /** Subtotal dinâmico (preço da tabela × quantidade) — display only. */
  subtotal = computed(() => {
    const p = this.produto();
    if (!p) return null;
    return (Number(p.preco_efetivo) * this.qtd()).toFixed(2);
  });

  /** Preço unitário com condição à vista no PIX (5% de desconto corporativo). */
  precoPix = computed(() => {
    const p = this.produto();
    if (!p) return null;
    return (Number(p.preco_efetivo) * 0.95).toFixed(2);
  });

  /** Percentual de desconto da tabela PJ em relação ao preço de lista padrão. */
  descontoTabelaPct = computed(() => {
    const p = this.produto();
    if (!p) return 0;
    const venda = Number(p.preco_venda);
    const efetivo = Number(p.preco_efetivo);
    if (!venda || efetivo >= venda) return 0;
    return Math.round(((venda - efetivo) / venda) * 100);
  });

  setQtd = (v: number) => this.qtd.set(Math.max(1, v));

  somarLote(delta: number): void {
    this.qtd.update((atual) => Math.max(1, Number((atual + delta).toFixed(3))));
  }

  anteriorImg(e?: Event): void {
    e?.stopPropagation();
    const lista = this.imagensGaleria();
    if (lista.length <= 1) return;
    const novoIdx = (this.indiceImgAtiva() - 1 + lista.length) % lista.length;
    this.imgAtiva.set(lista[novoIdx]);
  }

  proximaImg(e?: Event): void {
    e?.stopPropagation();
    const lista = this.imagensGaleria();
    if (lista.length <= 1) return;
    const novoIdx = (this.indiceImgAtiva() + 1) % lista.length;
    this.imgAtiva.set(lista[novoIdx]);
  }

  aoFalharImg(imgId: number): void {
    this.imgsFalhadas.update((setAtual) => {
      const novo = new Set(setAtual);
      novo.add(imgId);
      return novo;
    });
    const restantes = this.imagensGaleria();
    if (this.imgAtiva()?.id === imgId) {
      this.imgAtiva.set(restantes[0] ?? null);
    }
  }

  constructor() {
    // Preço, ficha e disponibilidade sobem ao vivo: reconcilia quando o evento
    // é do produto em tela (catalogo.produtos, catalogo.precos ou estoque.movimentado).
    effect(() => {
      const e = this.rt.ultimo();
      const p = untracked(this.produto);
      if (!e || !p) return;
      const alvo =
        e.tipo === 'catalogo.precos' || e.tipo === 'estoque.movimentado'
          ? Number(e.dados['produto_id'])
          : Number(e.dados['id']);
      if (
        (e.tipo === 'catalogo.produtos' ||
          e.tipo === 'catalogo.precos' ||
          e.tipo === 'estoque.movimentado') &&
        alvo === p.id
      ) {
        this.recarregarProduto(p.id);
      }
    });
  }

  ngOnInit(): void {
    this.categorias.carregar();
    if (this.auth.autenticado()) {
      this.conta
        .enderecos()
        .then((ends) =>
          this.entrega.set(
            ends.find((e) => e.tipo === 'entrega') ?? ends.find((e) => e.principal) ?? null,
          ),
        )
        .catch(() => {});
    }
    this.route.paramMap.subscribe((params) => {
      const idSlug = params.get('idslug') ?? '';
      const id = Number(idSlug.split('-')[0]);
      if (!id) {
        this.erro.set(true);
        this.carregando.set(false);
        return;
      }
      // Navegação entre produtos (rail de relacionados): reseta estado local
      // e volta ao topo — sem isso galeria/quantidade vazam entre PDPs.
      this.produto.set(null);
      this.imgAtiva.set(null);
      this.imgsFalhadas.set(new Set());
      this.relacionados.set([]);
      this.mesmaMarca.set([]);
      this.destaques.set([]);
      this.zoom.set(null);
      this.qtd.set(1);
      this.erro.set(false);
      this.carregando.set(true);
      window.scrollTo({ top: 0 });
      this.catalogo
        .produto(id)
        .then((p) => {
          this.produto.set(p);
          const galeria = this.imagensGaleria();
          this.imgAtiva.set(galeria[0] ?? null);
          this.carregarRelacionados(p);
        })
        .catch(() => this.erro.set(true))
        .finally(() => this.carregando.set(false));
    });
  }

  ngOnDestroy(): void {
    if (this.copiadoTimer) clearTimeout(this.copiadoTimer);
  }

  /** Refetch silencioso do produto em tela (preço, ficha, imagens) — sem
   *  skeleton e sem tocar nos rails de cross-sell. */
  private recarregarProduto(id: number): void {
    this.catalogo
      .produto(id)
      .then((p) => {
        this.produto.set(p);
        const galeria = this.imagensGaleria();
        const atual = this.imgAtiva();
        this.imgAtiva.set(
          (atual && galeria.find((i) => i.id === atual.id)) ?? galeria[0] ?? null,
        );
      })
      .catch(() => {});
  }

  /**
   * Algoritmo de Recomendação & Cross-Sell por Afinidade (Amazon / Mercado Livre):
   * Pontua candidatos combinando imagem válida (+1000), mesma categoria (+400),
   * mesma marca (+300), proximidade de faixa de preço (±40% -> +150) e destaque (+200).
   */
  private carregarRelacionados(p: ProdutoPortal): void {
    const precoAlvo = Number(p.preco_efetivo) || 1;
    const scoreAfinidade = (c: ItemCatalogoPortal): number => {
      let s = 0;
      if (c.imagens?.some((i) => Boolean(i.url?.trim()))) s += 1000;
      if (c.categoria_id === p.categoria_id) s += 400;
      if (p.marca && c.marca && c.marca.toLowerCase() === p.marca.toLowerCase()) s += 300;
      const ratio = Number(c.preco_efetivo) / precoAlvo;
      if (ratio >= 0.6 && ratio <= 1.4) s += 150;
      if (c.destaque) s += 200;
      return s;
    };

    this.catalogo
      .listar({ por_pagina: 50, pagina: 1 })
      .then((pagina) => {
        const candidatos = pagina.itens
          .filter((i) => i.id !== p.id)
          .sort((a, b) => scoreAfinidade(b) - scoreAfinidade(a) || b.id - a.id);

        this.relacionados.set(candidatos.slice(0, 12));

        if (p.marca) {
          const marcaLower = p.marca.toLowerCase();
          this.mesmaMarca.set(
            candidatos.filter((i) => i.marca?.toLowerCase() === marcaLower).slice(0, 8),
          );
        }

        const destaquesPool = candidatos.filter((i) => i.destaque);
        this.destaques.set(
          (destaquesPool.length >= 2 ? destaquesPool : candidatos).slice(0, 12),
        );
      })
      .catch(() => {});
  }

  usaDecimal(um: string | null): boolean {
    return ['kg', 'm', 'l'].includes((um ?? '').toLowerCase());
  }

  temSpecs(p: ProdutoPortal): boolean {
    return !!(
      p.ncm ||
      p.unidade_medida ||
      p.peso_kg ||
      (p.altura_cm && p.largura_cm) ||
      p.origem_mercadoria
    );
  }

  /** Zoom estilo Amazon — transform-origin segue o cursor (só desktop/hover). */
  onZoomMove(e: MouseEvent): void {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    this.zoom.set({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }

  /** Padrão ML "Comprar agora" — adiciona e leva direto ao carrinho. */
  async comprarAgora(): Promise<void> {
    const p = this.produto();
    if (!p || this.adicionando()) return;
    this.adicionando.set(true);
    try {
      await this.carrinho.adicionar(p.id, this.qtd());
      this.router.navigate(['/carrinho']);
    } catch {
      this.toast.erro('Não foi possível adicionar o produto ao carrinho.');
    } finally {
      this.adicionando.set(false);
    }
  }

  async adicionar(): Promise<void> {
    const p = this.produto();
    if (!p || this.adicionando()) return;
    this.adicionando.set(true);
    try {
      await this.carrinho.adicionar(p.id, this.qtd());
      // Confirmação estilo Amazon: o drawer lateral mostra o item adicionado.
      this.carrinho.abrirDrawer();
    } catch {
      this.toast.erro('Não foi possível adicionar o produto ao carrinho.');
    } finally {
      this.adicionando.set(false);
    }
  }

  async compartilhar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.copiado.set(true);
      if (this.copiadoTimer) clearTimeout(this.copiadoTimer);
      this.copiadoTimer = setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.toast.erro('Não foi possível copiar o link.');
    }
  }
}
