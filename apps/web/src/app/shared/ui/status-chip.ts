import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StatusLabelPipe } from '../../core/pipes';

/** Chip de status semântico — indicador sutil + rótulo textual legível. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-status-chip',
  imports: [StatusLabelPipe],
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.scss',
})
export class HwStatusChip {
  status = input.required<string>();

  papel(): string {
    const mapa: Record<string, string> = {
      aguardando_pagamento: 'warning',
      confirmado: 'info',
      em_separacao: 'progress',
      faturado: 'progress',
      enviado: 'info',
      entregue: 'success',
      concluido: 'success',
      cancelado: 'danger',
    };
    return mapa[this.status()] ?? 'neutral';
  }
}
