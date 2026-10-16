import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Banner Faixa Full-Bleed de Alto Impacto (Semana Especial + Cupom Interativo) */
@Component({
  selector: 'hw-strip-banner',
  imports: [RouterLink],
  templateUrl: './strip-banner.html',
  styleUrl: './strip-banner.scss',
})
export class HwStripBanner {
  copiado = signal(false);

  copiarCupom(): void {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText('HWELDPRO10').then(() => {
        this.copiado.set(true);
        setTimeout(() => this.copiado.set(false), 2500);
      });
    }
  }
}
