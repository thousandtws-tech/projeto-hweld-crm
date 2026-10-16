import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatRippleModule } from '@angular/material/core';
import { ItemCatalogoPortal } from '../../core/models';
import { HwPrice } from './price';

/**
 * Card de produto minimalista para e-commerce B2B.
 * Focado no produto, tipografia refinada, imagem com micro-interação e preço da tabela do cliente.
 */
@Component({
  selector: 'hw-product-card',
  imports: [RouterLink, MatRippleModule, HwPrice],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
})
export class HwProductCard {
  item = input.required<ItemCatalogoPortal>();
  imgFalhou = signal(false);

  readonly imagem = computed<string | null>(() => {
    if (this.imgFalhou()) return null;
    const imgs = this.item().imagens;
    if (!imgs || imgs.length === 0) return null;
    const principal = imgs.find((i) => i.is_principal && i.url) ?? imgs.find((i) => !!i.url);
    return principal?.url ?? null;
  });

  onImgError(): void {
    this.imgFalhou.set(true);
  }
}
