import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';

/**
 * Popover de CEP de entrega ("Enviar para").
 * Reúne o gatilho desktop e a faixa slim mobile, que compartilham
 * o mesmo `mat-menu`. O CEP persiste em `localStorage`.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-cep-popover',
  imports: [MatMenuModule],
  templateUrl: './cep-popover.html',
  styleUrl: './cep-popover.scss',
})
export class HwCepPopover {
  readonly cep = signal<string>(localStorage.getItem('hw_cep') || '');

  aplicarCep(val: string): void {
    const limpo = (val || '').replace(/\D/g, '');
    if (limpo.length >= 8) {
      const formatado = `${limpo.substring(0, 5)}-${limpo.substring(5, 8)}`;
      this.cep.set(formatado);
      localStorage.setItem('hw_cep', formatado);
    } else if (!limpo) {
      this.cep.set('');
      localStorage.removeItem('hw_cep');
    }
  }
}
