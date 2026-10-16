import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Faixa promocional acima do header principal.
 * Padrão de marketplaces (ML, Amazon, Kabum): barra fina
 * com oferta em destaque à esquerda e links utilitários à direita.
 */
@Component({
  selector: 'hw-shell-topbar',
  imports: [RouterLink],
  templateUrl: './shell-topbar.html',
  styleUrl: './shell-topbar.scss',
})
export class HwShellTopbar {}
