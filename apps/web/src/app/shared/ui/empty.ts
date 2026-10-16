import { Component, input } from '@angular/core';

/** Estado vazio padrão — minimalista, com ícone visual claro e chamada para ação. */
@Component({
  selector: 'hw-empty',
  templateUrl: './empty.html',
  styleUrl: './empty.scss',
})
export class HwEmpty {
  titulo = input.required<string>();
  descricao = input('');
  icone = input('package_2');

  resolveIcone(): string {
    const i = this.icone();
    if (i === '🛒') return 'shopping_bag';
    if (i === '📦') return 'inventory_2';
    if (i === '📍') return 'location_on';
    if (i === '?') return 'help_outline';
    if (i === '◇') return 'category';
    return i;
  }
}
