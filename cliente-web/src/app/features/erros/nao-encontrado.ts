import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HwButton } from '../../shared/ui/button';
import { HwEmpty } from '../../shared/ui/misc';

/** S13 — 404 genérico do portal. */
@Component({
  standalone: true,
  imports: [RouterLink, HwButton, HwEmpty],
  template: `
    <hw-empty titulo="Página não encontrada" icone="🧭"
      descricao="O endereço pode ter mudado ou a página foi removida.">
      <a routerLink="/" hwButton>Voltar ao início</a>
    </hw-empty>
  `,
})
export class NaoEncontradoPage {}
