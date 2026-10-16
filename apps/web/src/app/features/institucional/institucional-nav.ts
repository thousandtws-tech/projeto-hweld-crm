import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'hw-institucional-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './institucional-nav.html',
  styleUrl: './institucional-nav.scss',
})
export class HwInstitucionalNav {
  paginaAtual = input.required<string>();
}
