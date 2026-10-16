import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CmsStore } from '../../../../core/cms.store';

/** Trio de Banners Promocionais (3 Containers Lado a Lado - Ofertas em Destaque) */
@Component({
  selector: 'hw-trio-banners',
  imports: [RouterLink],
  templateUrl: './trio-banners.html',
  styleUrl: './trio-banners.scss',
})
export class HwTrioBanners implements OnInit {
  readonly cms = inject(CmsStore);
  readonly cards = this.cms.trioBanners;

  ngOnInit(): void {
    this.cms.carregar();
  }
}
