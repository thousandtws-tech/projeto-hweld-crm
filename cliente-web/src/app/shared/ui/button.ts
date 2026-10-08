import { Component, input } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'button[hwButton], a[hwButton]',
  standalone: true,
  imports: [MatRippleModule, MatProgressSpinnerModule],
  template: `
    @if (loading()) {
      <mat-spinner diameter="18" strokeWidth="2.5" class="hw-btn-spinner" aria-hidden="true" />
      <span class="sr">{{ texto() }}</span>
    } @else {
      <ng-content />
    }
  `,
  host: {
    'mat-ripple': '',
    '[class]': 'classe()',
    '[attr.aria-busy]': 'loading() || null',
    '[attr.aria-disabled]': 'disabled() || loading() || null',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--hw-space-2);
      border-radius: var(--hw-radius-sm);
      font-family: var(--hw-font-sans);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: -0.01em;
      cursor: pointer;
      border: 1px solid transparent;
      padding: 0 var(--hw-space-4);
      height: 40px;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);
      text-decoration: none;
      position: relative;
      overflow: hidden;
      user-select: none;
      white-space: nowrap;
    }
    :host(.hw-btn-sm) { height: 32px; padding: 0 var(--hw-space-3); font-size: 13px; }
    :host(.hw-btn-lg) { height: 46px; padding: 0 var(--hw-space-6); font-size: 15px; font-weight: 600; }
    :host(.hw-btn-primary) {
      background: var(--hw-accent);
      color: var(--hw-on-accent);
      box-shadow: 0 1px 2px rgba(29, 79, 216, 0.2);
    }
    :host(.hw-btn-primary:hover:not([aria-disabled])) {
      background: var(--hw-accent-hover);
      box-shadow: 0 4px 12px rgba(29, 79, 216, 0.25);
      transform: translateY(-1px);
    }
    :host(.hw-btn-secondary) {
      background: var(--hw-surface-raised);
      color: var(--hw-text);
      border-color: var(--hw-border);
    }
    :host(.hw-btn-secondary:hover:not([aria-disabled])) {
      background: var(--hw-surface);
      border-color: var(--hw-border-input);
    }
    :host(.hw-btn-ghost) {
      background: transparent;
      color: var(--hw-text-muted);
    }
    :host(.hw-btn-ghost:hover:not([aria-disabled])) {
      background: var(--hw-surface);
      color: var(--hw-text);
    }
    :host(.hw-btn-danger) {
      background: var(--hw-danger);
      color: var(--hw-on-danger);
    }
    :host(.hw-btn-danger:hover:not([aria-disabled])) {
      background: var(--hw-danger-hover);
    }
    :host([aria-disabled="true"]),
    :host([disabled]) {
      opacity: 0.55;
      cursor: not-allowed;
      pointer-events: none;
      box-shadow: none !important;
      transform: none !important;
    }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    :host ::ng-deep .hw-btn-spinner circle {
      stroke: currentColor !important;
    }
  `,
})
export class HwButton {
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  loading = input(false);
  disabled = input(false);
  texto = input('Carregando…');

  classe() {
    return `hw-btn-${this.variant()} hw-btn-${this.size()}`;
  }
}
