import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BrlPipe } from '../../core/pipes';

/** Bloco de preço B2B — mostra o preço efetivo (tabela da empresa) com hierarquia visual clara. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-price',
  imports: [BrlPipe],
  templateUrl: './price.html',
  styleUrl: './price.scss',
})
export class HwPrice {
  valor = input.required<string | null | undefined>();
  tabela = input<string | null>(null);
}
