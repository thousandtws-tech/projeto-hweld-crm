import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CarrinhoService } from '../../core/servicos';
import { HwCategoriesMenu } from './categories-menu';
import { HwCepPopover } from './cep-popover';
import { HwSearchBox } from './search-box';
import { HwAccountMenu } from './account-menu';
import { HwNotificationsMenu } from './notifications-menu';

/** Cabeçalho do portal: logo, categorias, CEP, busca e ações de conta/carrinho. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-shell-header',
  imports: [
    RouterLink,
    MatTooltipModule,
    HwCategoriesMenu,
    HwCepPopover,
    HwSearchBox,
    HwAccountMenu,
    HwNotificationsMenu,
  ],
  templateUrl: './shell-header.html',
  styleUrl: './shell-header.scss',
})
export class HwShellHeader {
  readonly carrinho = inject(CarrinhoService);
}
