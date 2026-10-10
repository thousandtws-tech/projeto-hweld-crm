import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CatalogoService, CarrinhoService, ContaService } from '../../core/servicos';
import { CategoriasStore } from '../../core/categorias.store';
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
  private categorias = inject(CategoriasStore);
  private toast = inject(ToastService);

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
  relacionados = signal<ItemCatalogoPortal[]>([]);
  mesmaMarca = signal<ItemCatalogoPortal[]>([]);
  destaques = signal<ItemCatalogoPortal[]>([]);
  entrega = signal<Endereco | null>(null);
  copiado = signal(false);
  zoom = signal<{ x: number; y: number } | null>(null);
  private copiadoTimer?: ReturnType<typeof setTimeout>;

  /** Subtotal dinâmico (preço da tabela × quantidade) — display only. */
  subtotal = computed(() => {
    const p = this.produto();
    if (!p) return null;
    return (Number(p.preco_efetivo) * this.qtd()).toFixed(2);
  });

  setQtd = (v: number) => this.qtd.set(v);

  ngOnInit(): void {
    this.categorias.carregar();
    this.conta
      .enderecos()
      .then((ends) =>
        this.entrega.set(ends.find((e) => e.tipo === 'entrega') ?? ends.find((e) => e.principal) ?? null),
      )
      .catch(() => {});
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
          this.imgAtiva.set(p.imagens.find((i) => i.is_principal) ?? p.imagens[0] ?? null);
          this.carregarRelacionados(p);
        })
        .catch(() => this.erro.set(true))
        .finally(() => this.carregando.set(false));
    });
  }

  ngOnDestroy(): void {
    if (this.copiadoTimer) clearTimeout(this.copiadoTimer);
  }

  /** Cross-sell estilo ML — rails paralelos. Categoria com poucos itens é
   *  completada com o restante do catálogo (nunca rail quase vazia). */
  private carregarRelacionados(p: ProdutoPortal): void {
    this.catalogo
      .listar({ categoria_id: p.categoria_id, por_pagina: 13 })
      .then(async (pagina) => {
        let itens = pagina.itens.filter((i) => i.id !== p.id);
        // Categoria esparsa → completa com o catálogo geral (dedup por id).
        if (itens.length < 8) {
          const geral = await this.catalogo
            .listar({ por_pagina: 25 })
            .catch(() => ({ itens: [] as ItemCatalogoPortal[], total: 0, pagina: 1, por_pagina: 25 }));
          const ids = new Set(itens.map((i) => i.id).concat(p.id));
          itens = itens.concat(geral.itens.filter((i) => !ids.has(i.id)));
        }
        this.relacionados.set(itens.slice(0, 12));
      })
      .catch(() => {});

    if (p.marca) {
      const marca = p.marca;
      this.catalogo
        .listar({ busca: marca, por_pagina: 10 })
        .then((pagina) =>
          this.mesmaMarca.set(
            pagina.itens.filter((i) => i.id !== p.id && i.marca === marca).slice(0, 8),
          ),
        )
        .catch(() => {});
    }

    this.catalogo
      .listar({ destaque: true, por_pagina: 13 })
      .then((pagina) =>
        this.destaques.set(pagina.itens.filter((i) => i.id !== p.id).slice(0, 12)),
      )
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
