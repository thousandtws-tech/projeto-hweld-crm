import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BuscaService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { HwProductCard } from '../../shared/ui/product-card';
import { HwEmpty } from '../../shared/ui/empty';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwButton } from '../../shared/ui/button';

type ResultadoBuscaNulo = import('../../core/models').ResultadoBusca | null;

const ORDENACOES = [
  { valor: 'relevancia', rotulo: 'Mais relevantes' },
  { valor: 'menor_preco', rotulo: 'Menor preço' },
  { valor: 'maior_preco', rotulo: 'Maior preço' },
  { valor: 'nome_az', rotulo: 'Nome (A–Z)' },
  { valor: 'recentes', rotulo: 'Lançamentos' },
] as const;

/** S04 — Resultados de busca no padrão marketplace BR (`/busca?q=`).
 *  Filtros vivem na URL: link compartilhável e botão voltar funcionam. */
@Component({
  imports: [RouterLink, FormsModule, HwProductCard, HwSkeleton, HwEmpty, HwButton],
  templateUrl: './busca.html',
  styleUrl: './busca.scss',
})
export class BuscaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private busca = inject(BuscaService);
  private rt = inject(RealtimeService);

  readonly ordenacoes = ORDENACOES;

  resultado = signal<ResultadoBuscaNulo>(null);
  esOff = signal(false);

  q = signal('');
  categoriaSel = signal<number | null>(null);
  marcaSel = signal<string | null>(null);
  precoMinSel = signal('');
  precoMaxSel = signal('');
  ordem = signal('relevancia');
  paginaAtual = signal(1);

  /** Campos do filtro de preço — digitados, aplicados via botão/Enter. */
  precoMinDig = signal('');
  precoMaxDig = signal('');

  constructor() {
    // Catálogo mudou (produto, categoria, preço) → reroda a query atual sem
    // piscar skeleton — o resultado velho fica até o novo chegar.
    effect(() => {
      const e = this.rt.ultimo();
      // untracked: `resultado` muda dentro de `executar` — sem isso o effect se
      // re-dispararia a cada resposta (loop de refetch). E só reconcilia depois
      // que a primeira busca carregou.
      if (e?.tipo.startsWith('catalogo.')) {
        untracked(() => {
          if (this.resultado() !== null) this.executar(true);
        });
      }
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((p) => {
      this.q.set(p.get('q') ?? '');
      const cat = p.get('categoria');
      this.categoriaSel.set(cat ? +cat : null);
      this.marcaSel.set(p.get('marca'));
      this.precoMinSel.set(p.get('preco_min') ?? '');
      this.precoMaxSel.set(p.get('preco_max') ?? '');
      this.precoMinDig.set(this.precoMinSel());
      this.precoMaxDig.set(this.precoMaxSel());
      this.ordem.set(p.get('ordem') ?? 'relevancia');
      this.paginaAtual.set(Math.max(1, +(p.get('pagina') ?? 1)));
      this.executar();
    });
  }

  executar(silencioso = false): void {
    if (!silencioso) this.resultado.set(null);
    this.esOff.set(false);
    this.busca
      .buscar(this.q(), {
        pagina: this.paginaAtual(),
        categoria_id: this.categoriaSel() ?? undefined,
        marca: this.marcaSel() ?? undefined,
        preco_min: this.precoMinSel() || undefined,
        preco_max: this.precoMaxSel() || undefined,
        ordem: this.ordem() !== 'relevancia' ? this.ordem() : undefined,
      })
      .then((r) => this.resultado.set(r))
      .catch((e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 503) this.esOff.set(true);
        else this.resultado.set({ itens: [], total: 0, pagina: 1, total_paginas: 0 });
      });
  }

  /** Nome legível da categoria ativa — resolvido pelas facetas retornadas. */
  nomeCategoriaSel(): string | null {
    const id = this.categoriaSel();
    if (id === null) return null;
    const f = this.resultado()?.facetas?.categorias?.find((c) => +c.valor === id);
    return f?.rotulo ?? null;
  }

  temFiltros(): boolean {
    return (
      this.categoriaSel() !== null ||
      this.marcaSel() !== null ||
      this.precoMinSel() !== '' ||
      this.precoMaxSel() !== ''
    );
  }

  filtrarCategoria(id: number): void {
    this.categoriaSel.set(this.categoriaSel() === id ? null : id);
    this.ir();
  }
  filtrarMarca(m: string): void {
    this.marcaSel.set(this.marcaSel() === m ? null : m);
    this.ir();
  }
  aplicarPreco(): void {
    this.precoMinSel.set(this.precoMinDig().trim());
    this.precoMaxSel.set(this.precoMaxDig().trim());
    this.ir();
  }
  limparPreco(): void {
    this.precoMinSel.set('');
    this.precoMaxSel.set('');
    this.precoMinDig.set('');
    this.precoMaxDig.set('');
    this.ir();
  }
  removerCategoria(): void {
    this.categoriaSel.set(null);
    this.ir();
  }
  removerMarca(): void {
    this.marcaSel.set(null);
    this.ir();
  }
  mudarOrdem(valor: string): void {
    this.ordem.set(valor);
    this.ir();
  }
  limparFiltros(): void {
    this.categoriaSel.set(null);
    this.marcaSel.set(null);
    this.limparPreco();
  }
  irParaPagina(p: number): void {
    this.paginaAtual.set(p);
    this.ir(false);
  }

  /** Janela de paginação — até 5 páginas em torno da atual (padrão ML). */
  paginas(): number[] {
    const total = this.resultado()?.total_paginas ?? 0;
    const atual = this.paginaAtual();
    const inicio = Math.max(1, Math.min(atual - 2, total - 4));
    return Array.from({ length: Math.min(5, total) }, (_, i) => inicio + i).filter(
      (n) => n <= total,
    );
  }

  rotuloPreco(): string {
    const min = this.precoMinSel();
    const max = this.precoMaxSel();
    if (min && max) return `R$ ${min} – R$ ${max}`;
    if (min) return `A partir de R$ ${min}`;
    return `Até R$ ${max}`;
  }

  /** Sincroniza estado → URL; troca de filtro volta para a página 1. */
  private ir(resetPagina = true): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.q() || null,
        categoria: this.categoriaSel(),
        marca: this.marcaSel(),
        preco_min: this.precoMinSel() || null,
        preco_max: this.precoMaxSel() || null,
        ordem: this.ordem() !== 'relevancia' ? this.ordem() : null,
        pagina: resetPagina ? null : this.paginaAtual(),
      },
    });
  }
}
