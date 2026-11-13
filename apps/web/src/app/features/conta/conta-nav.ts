import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';

/** Navegação compartilhada da área logada (`/conta`). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-conta-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './conta-nav.html',
  styleUrl: './conta-nav.scss',
})
export class HwContaNav {
  private auth = inject(AuthStore);
  private router = inject(Router);

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
