import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CmsStore } from '../../../../core/cms.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-trust-bar',
  imports: [RouterLink],
  templateUrl: './trust-bar.html',
  styleUrl: './trust-bar.scss',
})
export class HwTrustBar {
  private cms = inject(CmsStore);
  readonly selos = this.cms.selos;
}
