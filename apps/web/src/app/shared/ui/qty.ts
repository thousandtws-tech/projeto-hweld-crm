import { Component, input } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';

/** Stepper de quantidade minimalista com micro-interações acessíveis e suporte a decimais. */
@Component({
  selector: 'hw-qty',
  imports: [MatRippleModule],
  templateUrl: './qty.html',
  styleUrl: './qty.scss',
})
export class HwQty {
  valor = input.required<number>();
  min = input(1);
  max = input<number | null>(null);
  decimal = input(false);
  mudar = input.required<(v: number) => void>();

  passo(d: number): void {
    const proximo = this.valor() + d;
    if (proximo < this.min()) return;
    if (this.max() !== null && proximo > this.max()!) return;
    this.mudar()(proximo);
  }

  digitar(ev: Event): void {
    const n = Number((ev.target as HTMLInputElement).value);
    if (!Number.isFinite(n) || n < this.min()) return;
    this.mudar()(this.max() !== null ? Math.min(n, this.max()!) : n);
  }
}
