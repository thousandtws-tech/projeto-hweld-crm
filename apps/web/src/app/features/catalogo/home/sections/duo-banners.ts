import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CmsStore } from '../../../../core/cms.store';

/** Duo de Banners Promocionais (2 Banners Largos Split 50/50) */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-duo-banners',
  imports: [RouterLink],
  templateUrl: './duo-banners.html',
  styleUrl: './duo-banners.scss',
})
export class HwDuoBanners implements OnInit {
  readonly cms = inject(CmsStore);
  readonly cards = this.cms.duoBanners;

  ngOnInit(): void {
    this.cms.carregar();
  }
}
