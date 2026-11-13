import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HwButton } from '../../shared/ui/button';
import { HwStatusChip } from '../../shared/ui/status-chip';

/** S08 — Confirmação de pedido com visual moderno e limpo. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HwStatusChip, HwButton],
  templateUrl: './checkout-sucesso.html',
  styleUrl: './checkout-sucesso.scss',
})
export class CheckoutSucessoPage {
  private route = inject(ActivatedRoute);
  numero = signal(this.route.snapshot.paramMap.get('id'));
}
