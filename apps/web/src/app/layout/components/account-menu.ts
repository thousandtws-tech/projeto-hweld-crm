import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { AuthStore } from '../../core/auth/auth.store';
import { CnpjPipe } from '../../shared/ui/cnpj.pipe';

/** Botão "Minha Conta" do cabeçalho com menu de perfil, ou link de login. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-account-menu',
  imports: [RouterLink, MatMenuModule, MatDividerModule, CnpjPipe],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
})
export class HwAccountMenu {
  readonly auth = inject(AuthStore);
  private router = inject(Router);

  primeiroNome(nome?: string): string {
    if (!nome) return 'Comprador';
    return nome.trim().split(/\s+/)[0];
  }

  obterIniciais(nome: string): string {
    if (!nome) return 'HW';
    const partes = nome.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
