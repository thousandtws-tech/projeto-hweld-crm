import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CarrinhoService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Carrinho } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwQty } from '../../shared/ui/qty';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwEmpty } from '../../shared/ui/empty';
import { ToastService } from '../../shared/ui/toast';

/** S06 — Carrinho de compras minimalista com componentes Angular Material. */
@Component({
  imports: [RouterLink, MatTooltipModule, HwButton, HwQty, HwSkeleton, HwEmpty, BrlPipe],
  templateUrl: './carrinho.html',
  styleUrl: './carrinho.scss',
})
export class CarrinhoPage implements OnInit {
  private svc = inject(CarrinhoService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private rt = inject(RealtimeService);

  carrinho = signal<Carrinho | null>(null);
  carregando = signal(true);

  constructor() {
    // Admin mudou preço/produto → o carrinho revalida no servidor (preco_unitario
    // é sempre do lado do backend). Silencioso: sem skeleton, sem toast.
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo === 'catalogo.precos' || e?.tipo === 'catalogo.produtos') {
        untracked(() => this.recarregar());
      }
    });
  }

  ngOnInit(): void {
    this.recarregar(true);
  }

  /** `inicial`: falha mostra estado vazio; no refetch realtime falha mantém o
   *  carrinho atual na tela (próximo evento tenta de novo). */
  private recarregar(inicial = false): void {
    this.svc
      .atual()
      .then((c) => this.carrinho.set(c))
      .catch(() => {
        if (inicial) this.carrinho.set(null);
      })
      .finally(() => this.carregando.set(false));
  }

  num(q: string): number {
    return Number(q) || 0;
  }
  linha(i: { quantidade: string; preco_unitario: string }): string {
    return (Number(i.quantidade) * Number(i.preco_unitario)).toFixed(2);
  }
  subtotal(): string {
    const itens = this.carrinho()?.itens ?? [];
    return itens.reduce((acc, i) => acc + Number(this.linha(i)), 0).toFixed(2);
  }

  mudar(produto_id: number) {
    return (v: number) => {
      if (v === 0) {
        void this.remover(produto_id);
        return;
      }
      void this.svc.atualizarItem(produto_id, v).then((c) => this.carrinho.set(c));
    };
  }

  async remover(produto_id: number): Promise<void> {
    await this.svc.remover(produto_id);
    this.carrinho.set(this.svc.carrinho());
    this.toast.ok('Item removido com sucesso.');
  }

  ir(): void {
    void this.router.navigate(['/checkout']);
  }
}
