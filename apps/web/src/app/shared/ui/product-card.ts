import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { ItemCatalogoPortal } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { CarrinhoService } from '../../core/servicos';
import { HwPrice } from './price';
import { ToastService } from './toast';

/**
 * Card de produto no padrão WooCommerce Shop Loop:
 * - Badge de oferta/destaque sobre a imagem
 * - SKU + marca
 * - Título com link para a PDP
 * - Preço PJ (com preço de lista riscado quando há desconto da tabela)
 * - Botão "Adicionar ao carrinho" direto no card (abre o mini-cart drawer)
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-product-card',
  imports: [RouterLink, HwPrice, BrlPipe],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
})
export class HwProductCard {
  private carrinho = inject(CarrinhoService);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private toast = inject(ToastService);

  item = input.required<ItemCatalogoPortal>();
  imgFalhou = signal(false);
  adicionando = signal(false);

  readonly imagem = computed<string | null>(() => {
    if (this.imgFalhou()) return null;
    const imgs = this.item().imagens;
    if (!imgs || imgs.length === 0) return null;
    const principal = imgs.find((i) => i.is_principal && i.url) ?? imgs.find((i) => !!i.url);
    return principal?.url ?? null;
  });

  readonly temDesconto = computed(() => {
    const p = this.item();
    const ef = Number(p.preco_efetivo ?? p.preco_venda);
    const vd = Number(p.preco_venda);
    return vd > 0 && ef < vd;
  });

  onImgError(): void {
    this.imgFalhou.set(true);
  }

  async adicionarAoCarrinho(ev: Event): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();
    if (this.adicionando()) return;
    const p = this.item();
    if (!this.auth.autenticado()) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: `/p/${p.id}-${p.slug}` } });
      return;
    }
    this.adicionando.set(true);
    try {
      await this.carrinho.adicionar(p.id, 1);
      this.toast.ok(`"${p.nome}" adicionado ao carrinho.`);
      this.carrinho.abrirDrawer();
    } catch {
      this.toast.erro('Não foi possível adicionar ao carrinho.');
    } finally {
      this.adicionando.set(false);
    }
  }
}
