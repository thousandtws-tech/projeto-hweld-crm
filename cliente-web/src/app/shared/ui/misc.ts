import { Component, input } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

/** Bloco de preço B2B — mostra o preço efetivo (tabela da empresa) com hierarquia visual clara. */
@Component({
  selector: 'hw-price',
  standalone: true,
  imports: [BrlPipe],
  template: `
    <div class="wrap">
      <span class="preco hw-numeric">{{ valor() | brl }}</span>
      @if (tabela()) {
        <span class="tabela">{{ tabela() }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: inline-flex; }
    .wrap { display: flex; flex-direction: column; align-items: flex-start; }
    .preco {
      font-family: var(--hw-font-sans);
      font-weight: 700;
      font-size: 18px;
      line-height: 24px;
      color: var(--hw-text);
      letter-spacing: -0.02em;
    }
    :host(.hw-price-lg) .preco {
      font-size: 26px;
      line-height: 32px;
      color: var(--hw-accent);
    }
    .tabela {
      font-size: 11px;
      font-weight: 500;
      color: var(--hw-text-muted);
      letter-spacing: 0.01em;
      margin-top: 1px;
    }
  `,
})
export class HwPrice {
  valor = input.required<string | null | undefined>();
  tabela = input<string | null>(null);
}

/** Stepper de quantidade minimalista com micro-interações acessíveis e suporte a decimais. */
@Component({
  selector: 'hw-qty',
  standalone: true,
  imports: [MatRippleModule],
  template: `
    <button
      type="button"
      class="passo"
      mat-ripple
      aria-label="Diminuir quantidade"
      (click)="passo(-1)"
      [disabled]="valor() <= min()"
    >
      <span class="material-symbols-outlined" aria-hidden="true">remove</span>
    </button>
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
    <button
      type="button"
      class="passo"
      mat-ripple
      aria-label="Aumentar quantidade"
      (click)="passo(1)"
      [disabled]="max() !== null && valor() >= max()!"
    >
      <span class="material-symbols-outlined" aria-hidden="true">add</span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-sm);
      background: var(--hw-surface-raised);
      height: 40px;
      transition: border-color var(--hw-motion-fast) var(--hw-motion-ease);
      overflow: hidden;
    }
    :host:hover {
      border-color: var(--hw-border-input);
    }
    :host:focus-within {
      border-color: var(--hw-focus-ring);
      box-shadow: 0 0 0 1px var(--hw-focus-ring);
    }
    .passo {
      width: 36px;
      height: 100%;
      border: 0;
      background: transparent;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--hw-text-muted);
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);
    }
    .passo:hover:not(:disabled) {
      background: var(--hw-surface);
      color: var(--hw-text);
    }
    .passo:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .passo .material-symbols-outlined {
      font-size: 18px;
    }
    .num {
      width: 48px;
      height: 100%;
      border: 0;
      text-align: center;
      font-family: var(--hw-font-sans);
      font-size: 14px;
      font-weight: 600;
      color: var(--hw-text);
      background: transparent;
      outline: none;
      -moz-appearance: textfield;
      appearance: textfield;
    }
    .num::-webkit-inner-spin-button,
    .num::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
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

/** Chip de status semântico — indicador sutil + rótulo textual legível. */
@Component({
  selector: 'hw-status-chip',
  standalone: true,
  imports: [StatusLabelPipe],
  template: `
    <span class="chip" [class]="'chip ' + papel()">
      <span class="dot" aria-hidden="true"></span>
      <span class="label">{{ status() | statusLabel }}</span>
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 24px;
      padding: 0 10px;
      border-radius: var(--hw-radius-pill);
      font-family: var(--hw-font-sans);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .neutral { background: var(--hw-chip-neutral-bg); color: var(--hw-chip-neutral-fg); .dot { background: var(--hw-chip-neutral-fg); } }
    .info { background: var(--hw-chip-info-bg); color: var(--hw-chip-info-fg); border-color: rgba(29, 79, 216, 0.15); .dot { background: var(--hw-chip-info-fg); } }
    .progress { background: var(--hw-chip-progress-bg); color: var(--hw-chip-progress-fg); border-color: rgba(100, 32, 212, 0.15); .dot { background: var(--hw-chip-progress-fg); } }
    .success { background: var(--hw-chip-success-bg); color: var(--hw-chip-success-fg); border-color: rgba(22, 101, 52, 0.15); .dot { background: var(--hw-chip-success-fg); } }
    .warning { background: var(--hw-chip-warning-bg); color: var(--hw-chip-warning-fg); border-color: rgba(146, 64, 14, 0.15); .dot { background: var(--hw-chip-warning-fg); } }
    .danger { background: var(--hw-chip-danger-bg); color: var(--hw-chip-danger-fg); border-color: rgba(185, 28, 28, 0.15); .dot { background: var(--hw-chip-danger-fg); } }
  `,
})
export class HwStatusChip {
  status = input.required<string>();

  papel(): string {
    const mapa: Record<string, string> = {
      aguardando_pagamento: 'warning',
      confirmado: 'info',
      em_separacao: 'progress',
      faturado: 'progress',
      enviado: 'info',
      entregue: 'success',
      concluido: 'success',
      cancelado: 'danger',
    };
    return mapa[this.status()] ?? 'neutral';
  }
}

/** Estado vazio padrão — minimalista, com ícone visual claro e chamada para ação. */
@Component({
  selector: 'hw-empty',
  standalone: true,
  template: `
    <div class="vazio">
      <div class="icone-box">
        <span class="material-symbols-outlined icone" aria-hidden="true">{{ resolveIcone() }}</span>
      </div>
      <strong>{{ titulo() }}</strong>
      @if (descricao()) {
        <p>{{ descricao() }}</p>
      }
      <div class="acoes">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .vazio {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--hw-space-3);
      padding: var(--hw-space-12) var(--hw-space-6);
      text-align: center;
      color: var(--hw-text-muted);
    }
    .icone-box {
      width: 56px;
      height: 56px;
      border-radius: var(--hw-radius-md);
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      display: grid;
      place-items: center;
      color: var(--hw-text-muted);
      margin-bottom: var(--hw-space-1);
    }
    .icone {
      font-size: 28px;
    }
    strong {
      font-family: var(--hw-font-sans);
      font-size: 17px;
      font-weight: 600;
      color: var(--hw-text);
      letter-spacing: -0.01em;
    }
    p {
      margin: 0;
      max-width: 44ch;
      font-size: 14px;
      line-height: 1.5;
    }
    .acoes {
      margin-top: var(--hw-space-3);
      display: flex;
      gap: var(--hw-space-2);
    }
  `,
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

/** Skeleton de loading — gradiente suave e elegante. */
@Component({
  selector: 'hw-skeleton',
  standalone: true,
  template: ``,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: block;
      border-radius: var(--hw-radius-sm);
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s ease-in-out infinite;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
        background: #f1f5f9;
      }
    }
  `,
})
export class HwSkeleton {}
