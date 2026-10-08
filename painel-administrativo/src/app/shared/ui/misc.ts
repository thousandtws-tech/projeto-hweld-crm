import { Component, input } from '@angular/core';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

/** Bloco de preço B2B — mostra o preço efetivo (tabela da empresa). */
@Component({
  selector: 'hw-price',
  standalone: true,
  imports: [BrlPipe],
  template: `
    <span class="preco hw-numeric">{{ valor() | brl }}</span>
    @if (tabela()) {
      <span class="tabela">{{ tabela() }}</span>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; }
    .preco { font: var(--hw-text-lg); color: var(--hw-text); }
    :host(.hw-price-lg) .preco { font: var(--hw-text-xl); }
    .tabela { font: var(--hw-text-xs); color: var(--hw-text-muted); }
  `,
})
export class HwPrice {
  valor = input.required<string | null | undefined>();
  tabela = input<string | null>(null);
}

/** Stepper de quantidade — decimal se a unidade pedir (kg, m). */
@Component({
  selector: 'hw-qty',
  standalone: true,
  template: `
    <button type="button" class="passo" aria-label="Diminuir quantidade" (click)="passo(-1)" [disabled]="valor() <= min()">−</button>
    <input
      class="num hw-numeric"
      type="number"
      inputmode="decimal"
      [value]="valor()"
      [min]="min()"
      [attr.max]="max() ?? null"
      [step]="decimal() ? '0.001' : '1'"
      (change)="digitar($event)"
      aria-label="Quantidade"
    />
    <button type="button" class="passo" aria-label="Aumentar quantidade" (click)="passo(1)">+</button>
  `,
  styles: `
    :host { display: inline-flex; align-items: stretch; border: 1px solid var(--hw-border-input);
      border-radius: var(--hw-radius-sm); overflow: hidden; }
    .passo { width: 36px; border: 0; background: var(--hw-surface); font-size: 18px; cursor: pointer;
      color: var(--hw-text); }
    .passo:hover:not(:disabled) { background: var(--hw-border); }
    .passo:disabled { opacity: .4; cursor: not-allowed; }
    .num { width: 64px; border: 0; text-align: center; font: var(--hw-text-sm);
      -moz-appearance: textfield; appearance: textfield; }
    .num::-webkit-inner-spin-button { display: none; }
  `,
})
export class HwQty {
  valor = input.required<number>();
  min = input(1);
  max = input<number | null>(null);
  decimal = input(false);
  mudar = input.required<(v: number) => void>();

  passo(d: number): void {
    const proximo = this.valor() + d;
    if (proximo < this.min()) return;
    if (this.max() !== null && proximo > this.max()!) return;
    this.mudar()(proximo);
  }

  digitar(ev: Event): void {
    const n = Number((ev.target as HTMLInputElement).value);
    if (!Number.isFinite(n) || n < this.min()) return;
    this.mudar()(this.max() !== null ? Math.min(n, this.max()!) : n);
  }
}

/** Chip de status com papel semântico — cor nunca sozinha. */
@Component({
  selector: 'hw-status-chip',
  standalone: true,
  imports: [StatusLabelPipe],
  template: `<span class="chip" [class]="'chip ' + papel()">{{ status() | statusLabel }}</span>`,
  styles: `
    .chip { display: inline-flex; align-items: center; height: 24px; padding: 0 var(--hw-space-3);
      border-radius: var(--hw-radius-pill); font: var(--hw-text-xs); white-space: nowrap; }
    .neutral { background: var(--hw-chip-neutral-bg); color: var(--hw-chip-neutral-fg); }
    .info { background: var(--hw-chip-info-bg); color: var(--hw-chip-info-fg); }
    .progress { background: var(--hw-chip-progress-bg); color: var(--hw-chip-progress-fg); }
    .success { background: var(--hw-chip-success-bg); color: var(--hw-chip-success-fg); }
    .warning { background: var(--hw-chip-warning-bg); color: var(--hw-chip-warning-fg); }
    .danger { background: var(--hw-chip-danger-bg); color: var(--hw-chip-danger-fg); }
  `,
})
export class HwStatusChip {
  status = input.required<string>();

  papel(): string {
    const mapa: Record<string, string> = {
      aguardando_pagamento: 'warning', confirmado: 'info', em_separacao: 'progress',
      faturado: 'progress', enviado: 'info', entregue: 'success',
      concluido: 'success', cancelado: 'danger',
    };
    return mapa[this.status()] ?? 'neutral';
  }
}

/** Estado vazio padrão — nunca deixar lista em branco. */
@Component({
  selector: 'hw-empty',
  standalone: true,
  template: `
    <div class="vazio">
      <span class="icone" aria-hidden="true">{{ icone() }}</span>
      <strong>{{ titulo() }}</strong>
      <p>{{ descricao() }}</p>
      <ng-content />
    </div>
  `,
  styles: `
    .vazio { display: flex; flex-direction: column; align-items: center; gap: var(--hw-space-2);
      padding: var(--hw-space-12) var(--hw-space-6); text-align: center; color: var(--hw-text-muted); }
    .icone { font-size: 40px; }
    strong { font: var(--hw-text-lg); color: var(--hw-text); }
    p { margin: 0 0 var(--hw-space-3); max-width: 40ch; }
  `,
})
export class HwEmpty {
  titulo = input.required<string>();
  descricao = input('');
  icone = input('◇');
}

/** Skeleton de loading — shimmer desliga com reduced-motion. */
@Component({
  selector: 'hw-skeleton',
  standalone: true,
  template: ``,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host { display: block; border-radius: var(--hw-radius-sm);
      background: linear-gradient(90deg, var(--hw-surface) 25%, var(--hw-border) 50%, var(--hw-surface) 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    @media (prefers-reduced-motion: reduce) { :host { animation: none; background: var(--hw-surface); } }
  `,
})
export class HwSkeleton {}
