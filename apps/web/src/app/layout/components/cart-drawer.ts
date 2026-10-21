import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CarrinhoService } from '../../core/servicos';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwQty } from '../../shared/ui/qty';
import { ToastService } from '../../shared/ui/toast';

/** Mini-cart lateral (drawer) — padrão Mercado Livre/Amazon: itens editáveis,
 *  subtotal e CTAs sem sair da página. Fecha com Esc ou clique no overlay. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-cart-drawer',
  imports: [RouterLink, HwButton, HwQty, BrlPipe],
  templateUrl: './cart-drawer.html',
  styleUrl: './cart-drawer.scss',
  host: {
    '(document:keydown.escape)': 'fechar()',
    '[class.drawer-aberto]': 'carrinho.drawerAberto()',
  },
})
export class HwCartDrawer {
  readonly carrinho = inject(CarrinhoService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private atualizando = false;

  constructor() {
    // Trava o scroll do body enquanto o drawer está aberto.
    effect(() => {
      document.body.style.overflow = this.carrinho.drawerAberto() ? 'hidden' : '';
    });
  }

  fechar(): void {
    this.carrinho.fecharDrawer();
  }

  num(q: string): number {
    return Number(q) || 0;
  }

  linha(i: { quantidade: string; preco_unitario: string }): string {
    return (Number(i.quantidade) * Number(i.preco_unitario)).toFixed(2);
  }

  mudar(produto_id: number) {
    return (v: number) => {
      if (v === 0) {
        void this.remover(produto_id);
        return;
      }
      if (this.atualizando) return;
      this.atualizando = true;
      void this.carrinho.atualizarItem(produto_id, v).finally(() => (this.atualizando = false));
    };
  }

  async remover(produto_id: number): Promise<void> {
    try {
      await this.carrinho.remover(produto_id);
    } catch {
      this.toast.erro('Não foi possível remover o item.');
    }
  }

  irCarrinho(): void {
    this.fechar();
    void this.router.navigate(['/carrinho']);
  }

  irCheckout(): void {
    this.fechar();
    void this.router.navigate(['/checkout']);
  }
}
