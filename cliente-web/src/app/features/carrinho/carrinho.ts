import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CarrinhoService } from '../../core/servicos';
import { Carrinho } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwQty, HwSkeleton, HwEmpty } from '../../shared/ui/misc';
import { ToastService } from '../../shared/ui/toast';

/** S06 — Carrinho de compras minimalista com componentes Angular Material. */
@Component({
  standalone: true,
  imports: [RouterLink, MatTooltipModule, HwButton, HwQty, HwSkeleton, HwEmpty, BrlPipe],
  template: `
    <div class="carrinho-header">
      <div>
        <h1>Carrinho de Compras</h1>
        @if (carrinho()?.itens?.length; as n) {
          <span class="subtitulo">{{ n }} {{ n === 1 ? 'item selecionado' : 'itens selecionados' }}</span>
        }
      </div>
      @if (carrinho()?.itens?.length) {
        <a routerLink="/" class="link-continuar">
          <span class="material-symbols-outlined">arrow_back</span>
          <span>Continuar comprando</span>
        </a>
      }
    </div>

    @if (carregando()) {
      <div class="layout">
        <div class="itens">
          @for (i of [1,2,3]; track i) {
            <hw-skeleton style="height: 100px; border-radius: 12px;" />
          }
        </div>
        <hw-skeleton style="height: 260px; border-radius: 16px;" />
      </div>
    } @else if (!carrinho() || carrinho()!.itens.length === 0) {
      <hw-empty
        titulo="Seu carrinho está vazio"
        descricao="Explore o catálogo para encontrar máquinas, consumíveis e EPIs com os preços da sua tabela."
        icone="shopping_bag"
      >
        <a routerLink="/" hwButton size="lg">Explorar catálogo</a>
      </hw-empty>
    } @else {
      <div class="layout">
        <ul class="itens">
          @for (item of carrinho()!.itens; track item.produto_id) {
            <li class="item-card">
              <div class="item-info">
                <a class="item-nome" [routerLink]="['/p', item.produto_id]">
                  {{ item.produto?.nome ?? 'Produto ' + item.produto_id }}
                </a>
                <div class="item-metas">
                  @if (item.produto?.sku) {
                    <span class="sku-tag hw-numeric">SKU: {{ item.produto?.sku }}</span>
                  }
                  <span class="unit-tag hw-numeric">{{ item.preco_unitario | brl }} / un</span>
                </div>
              </div>

              <div class="item-controles">
                <hw-qty [valor]="num(item.quantidade)" [mudar]="mudar(item.produto_id)" [min]="0" />

                <div class="total-col">
                  <span class="subtotal-label">Subtotal</span>
                  <span class="item-total hw-numeric">{{ linha(item) | brl }}</span>
                </div>

                <button
                  type="button"
                  class="btn-remover"
                  aria-label="Remover item do carrinho"
                  matTooltip="Remover este produto"
                  (click)="remover(item.produto_id)"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                </button>
              </div>
            </li>
          }
        </ul>

        <!-- Resumo Lateral Minimalista -->
        <aside class="resumo-card">
          <h2>Resumo do Pedido</h2>

          <div class="resumo-linhas">
            <div class="resumo-linha">
              <span>Subtotal dos itens</span>
              <strong class="hw-numeric">{{ subtotal() | brl }}</strong>
            </div>
            <div class="resumo-linha mut">
              <span>Frete estimado</span>
              <span>Calculado no checkout</span>
            </div>
            <div class="resumo-linha mut">
              <span>Condição de pagamento</span>
              <span>A combinar</span>
            </div>
          </div>

          <div class="divisor"></div>

          <div class="resumo-linha total-geral">
            <span>Total estimado</span>
            <strong class="total-valor hw-numeric">{{ subtotal() | brl }}</strong>
          </div>

          <p class="resumo-nota">
            <span class="material-symbols-outlined nota-icon">verified_user</span>
            <span>Preço corporativo faturado com nota fiscal conforme cadastro da sua empresa.</span>
          </p>

          <button hwButton size="lg" class="btn-checkout" (click)="ir()">
            <span>Avançar para o Checkout</span>
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </aside>
      </div>
    }
  `,
  styles: `
    .carrinho-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: var(--hw-space-6);
      padding-bottom: var(--hw-space-3);
      border-bottom: 1px solid var(--hw-border);
      h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 2px; }
      .subtitulo { font-size: 13px; color: var(--hw-text-muted); }
    }
    .link-continuar {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: var(--hw-text-muted);
      text-decoration: none;
      &:hover { color: var(--hw-accent); }
      .material-symbols-outlined { font-size: 16px; }
    }

    .layout {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: var(--hw-space-8);
      align-items: start;
    }

    .itens {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
    }

    .item-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--hw-space-4);
      padding: var(--hw-space-4) var(--hw-space-5);
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);

      &:hover {
        border-color: var(--hw-border-input);
        box-shadow: var(--hw-shadow-card);
      }
    }

    .item-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .item-nome {
      font-size: 14.5px;
      font-weight: 600;
      color: var(--hw-text);
      text-decoration: none;
      &:hover { color: var(--hw-accent); }
    }
    .item-metas {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sku-tag {
      font-family: var(--hw-font-mono);
      font-size: 11px;
      color: var(--hw-text-muted);
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      padding: 1px 6px;
      border-radius: var(--hw-radius-xs);
    }
    .unit-tag {
      font-size: 12px;
      color: var(--hw-text-muted);
    }

    .item-controles {
      display: flex;
      align-items: center;
      gap: var(--hw-space-5);
    }

    .total-col {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      min-width: 110px;
    }
    .subtotal-label {
      font-size: 10.5px;
      text-transform: uppercase;
      color: var(--hw-text-faint);
      letter-spacing: 0.04em;
    }
    .item-total {
      font-size: 16px;
      font-weight: 700;
      color: var(--hw-text);
    }

    .btn-remover {
      border: 0;
      background: transparent;
      color: var(--hw-text-muted);
      cursor: pointer;
      width: 36px;
      height: 36px;
      border-radius: var(--hw-radius-sm);
      display: grid;
      place-items: center;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);

      &:hover {
        background: var(--hw-chip-danger-bg);
        color: var(--hw-danger);
      }
      .material-symbols-outlined { font-size: 20px; }
    }

    /* Resumo Lateral */
    .resumo-card {
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-lg);
      padding: var(--hw-space-6);
      position: sticky;
      top: calc(var(--hw-header-h) + var(--hw-space-4));
    }
    .resumo-card h2 {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin: 0 0 var(--hw-space-4);
      color: var(--hw-text);
    }
    .resumo-linhas {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
    }
    .resumo-linha {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13.5px;
      color: var(--hw-text);
      &.mut { color: var(--hw-text-muted); font-size: 12.5px; }
    }
    .divisor {
      height: 1px;
      background: var(--hw-border);
      margin: var(--hw-space-4) 0;
    }
    .total-geral {
      font-size: 16px;
      font-weight: 600;
    }
    .total-valor {
      font-size: 22px;
      font-weight: 800;
      color: var(--hw-accent);
      letter-spacing: -0.02em;
    }
    .resumo-nota {
      display: flex;
      gap: 6px;
      font-size: 11.5px;
      color: var(--hw-text-muted);
      line-height: 1.4;
      margin: var(--hw-space-4) 0 var(--hw-space-5);
      .nota-icon { font-size: 16px; color: var(--hw-success); flex-shrink: 0; }
    }
    .btn-checkout {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    @media (max-width: 840px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .item-card {
        flex-direction: column;
        align-items: flex-start;
      }
      .item-controles {
        width: 100%;
        justify-content: space-between;
        margin-top: var(--hw-space-2);
        padding-top: var(--hw-space-2);
        border-top: 1px solid var(--hw-border-subtle);
      }
    }
  `,
})
export class CarrinhoPage implements OnInit {
  private svc = inject(CarrinhoService);
  private toast = inject(ToastService);
  private router = inject(Router);

  carrinho = signal<Carrinho | null>(null);
  carregando = signal(true);

  ngOnInit(): void {
    this.svc.atual()
      .then((c) => this.carrinho.set(c))
      .catch(() => this.carrinho.set(null))
      .finally(() => this.carregando.set(false));
  }

  num(q: string): number { return Number(q) || 0; }
  linha(i: { quantidade: string; preco_unitario: string }): string {
    return (Number(i.quantidade) * Number(i.preco_unitario)).toFixed(2);
  }
  subtotal(): string {
    const itens = this.carrinho()?.itens ?? [];
    return itens.reduce((acc, i) => acc + Number(this.linha(i)), 0).toFixed(2);
  }

  mudar(produto_id: number) {
    return (v: number) => {
      if (v === 0) { void this.remover(produto_id); return; }
      void this.svc.atualizarItem(produto_id, v).then((c) => this.carrinho.set(c));
    };
  }

  async remover(produto_id: number): Promise<void> {
    await this.svc.remover(produto_id);
    this.carrinho.set(this.svc.carrinho());
    this.toast.ok('Item removido com sucesso.');
  }

  ir(): void { void this.router.navigate(['/checkout']); }
}
