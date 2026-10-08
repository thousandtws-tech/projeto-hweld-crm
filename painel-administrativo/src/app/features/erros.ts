import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="pagina">
      <h1>Sem permissão</h1>
      <p>Seu perfil não tem acesso a esta área. Fale com um administrador.</p>
      <a routerLink="/dashboard">Voltar ao dashboard</a>
    </main>
  `,
  styles: `.pagina { padding: var(--hw-space-8); text-align: center; }`,
})
export class SemPermissaoPage {}

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="pagina">
      <h1>Página não encontrada</h1>
      <a routerLink="/dashboard">Voltar ao dashboard</a>
    </main>
  `,
  styles: `.pagina { padding: var(--hw-space-8); text-align: center; }`,
})
export class NaoEncontradoPage {}
