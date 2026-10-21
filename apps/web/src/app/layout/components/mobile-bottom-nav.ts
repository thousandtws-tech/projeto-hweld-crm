import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { CarrinhoService } from '../../core/servicos';
import { HwCategoriesMenu } from './categories-menu';

/** Barra de navegação inferior fixa (mobile ≤ 768px). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-mobile-bottom-nav',
  imports: [RouterLink, RouterLinkActive, HwCategoriesMenu],
  templateUrl: './mobile-bottom-nav.html',
  styleUrl: './mobile-bottom-nav.scss',
})
export class HwMobileBottomNav {
  readonly auth = inject(AuthStore);
  readonly carrinho = inject(CarrinhoService);
}
