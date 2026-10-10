import { Component, input } from '@angular/core';
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

  imagem(): string | null {
    const p = this.item() as ItemCatalogoPortal & {
      imagens?: { url: string; is_principal: boolean }[];
    };
    const principal = p.imagens?.find((i) => i.is_principal) ?? p.imagens?.[0];
    return principal?.url ?? null;
  }
}
