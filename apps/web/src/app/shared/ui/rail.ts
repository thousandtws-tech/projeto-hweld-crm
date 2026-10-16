import { afterNextRender, Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Rail horizontal de produtos — padrão marketplace (ML/Amazon).
 * Setas flutuantes, scroll-snap, swipe nativo no mobile, scrollbar oculta.
 * Itens projetados devem usar a classe `.rail-item` (largura fixa do slot).
 */
@Component({
  selector: 'hw-rail',
  imports: [RouterLink],
  templateUrl: './rail.html',
  styleUrl: './rail.scss',
})
export class HwRail {
  titulo = input.required<string>();
  /** Link "Ver todos" — rota ou url; omita para esconder. */
  verTodos = input<string | unknown[] | null>(null);
  verParams = input<Record<string, string | number | null | undefined> | null>(null);

  trilho = viewChild<ElementRef<HTMLElement>>('trilho');

  podeEsq = signal(false);
  podeDir = signal(false);

  constructor() {
    // Setas só após a projeção renderizar (largura real do conteúdo).
    afterNextRender(() => this.atualizar());
  }

  rolar(dir: 1 | -1): void {
    const el = this.trilho()?.nativeElement;
    el?.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  atualizar(): void {
    const el = this.trilho()?.nativeElement;
    if (!el) return;
    this.podeEsq.set(el.scrollLeft > 4);
    this.podeDir.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }
}
