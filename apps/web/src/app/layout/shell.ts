import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from '../core/auth/auth.store';
import { RealtimeService } from '../core/realtime';
import { CarrinhoService } from '../core/servicos';
import { ToastHost } from '../shared/ui/toast';
import { HwShellHeader } from './components/shell-header';
import { HwShellTopbar } from './components/shell-topbar';
import { HwShellFooter } from './components/shell-footer';
import { HwMobileBottomNav } from './components/mobile-bottom-nav';
import { HwCartDrawer } from './components/cart-drawer';

/**
 * Casca do portal: compõe header, outlet, footer e bottom-nav.
 * O bootstrap da sessão (perfil, carrinho, realtime) acontece aqui;
 * cada região vive em um componente dedicado em `layout/components`.
 */
@Component({
  selector: 'hw-shell',
  imports: [
    RouterOutlet,
    ToastHost,
    HwShellTopbar,
    HwShellHeader,
    HwShellFooter,
    HwMobileBottomNav,
    HwCartDrawer,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private auth = inject(AuthStore);
  private carrinho = inject(CarrinhoService);
  private rt = inject(RealtimeService);

  ngOnInit(): void {
    if (this.auth.autenticado()) {
      void this.auth.carregarPerfil();
    }
    void this.carrinho.atual().catch(() => {});
  }
}
