import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'button[hwButton], a[hwButton]',
  imports: [MatRippleModule, MatProgressSpinnerModule],
  templateUrl: './button.html',
  host: {
    'mat-ripple': '',
    '[class]': 'classe()',
    '[attr.aria-busy]': 'loading() || null',
    '[attr.aria-disabled]': 'disabled() || loading() || null',
    // aria-disabled não bloqueia o clique — sem o atributo real, duplo
    // clique em pagar disparava dois POST /payments. attr.disabled (não a
    // property) porque o selector também casa <a>, que não tem `disabled`.
    '[attr.disabled]': 'disabled() || loading() ? "" : null',
    '[style.pointer-events]': 'disabled() || loading() ? "none" : null',
  },
  styleUrl: './button.scss',
})
export class HwButton {
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger' | 'cta'>('primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  loading = input(false);
  disabled = input(false);
  texto = input('Carregando…');

  classe() {
    return `hw-btn-${this.variant()} hw-btn-${this.size()}`;
  }
}
