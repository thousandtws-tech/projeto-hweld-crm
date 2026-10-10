import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Trio de Banners Promocionais (3 Containers Lado a Lado - Ofertas em Destaque) */
@Component({
  selector: 'hw-trio-banners',
  imports: [RouterLink],
  templateUrl: './trio-banners.html',
  styleUrl: './trio-banners.scss',
})
export class HwTrioBanners {}
