import { ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthStore } from '../../core/auth/auth.store';
import { NotificacoesService } from '../../core/notificacoes';
import { Notificacao } from '../../core/models';
import { HumanizeNotifPipe } from '../../core/pipes';

/** Sino de notificações do cabeçalho com Inbox Zero + Modal de Detalhes. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-notifications-menu',
  imports: [RouterLink, MatMenuModule, MatTooltipModule, DatePipe, HumanizeNotifPipe],
  templateUrl: './notifications-menu.html',
  styleUrl: './notifications-menu.scss',
})
export class HwNotificationsMenu {
  @ViewChild(MatMenuTrigger) menuTrigger?: MatMenuTrigger;
  readonly auth = inject(AuthStore);
  readonly notifs = inject(NotificacoesService);

  abrirNotif(n: Notificacao): void {
    this.menuTrigger?.closeMenu();
    void this.notifs.abrir(n);
  }

  dispensarNotif(id: number, e: Event): void {
    void this.notifs.dispensar(id, e);
  }

  getIconeNotif(n: Notificacao): string {
    const m = (n.mensagem || '').toLowerCase();
    const t = (n.titulo || '').toLowerCase();
    if (m.includes('entregue') || m.includes('concluido')) return 'check_circle';
    if (m.includes('enviado') || m.includes('transporte')) return 'local_shipping';
    if (m.includes('faturado') || m.includes('pagamento') || m.includes('boleto'))
      return 'receipt_long';
    if (m.includes('cancelado')) return 'cancel';
    if (t.includes('pedido') || n.tipo.startsWith('pedido.')) return 'shopping_bag';
    return 'notifications';
  }
}
