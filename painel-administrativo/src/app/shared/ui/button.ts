import { Component, input } from '@angular/core';

@Component({
  selector: 'button[hwButton], a[hwButton]',
  standalone: true,
  template: `
    @if (loading()) {
      <span class="spinner" aria-hidden="true"></span>
      <span class="sr">{{ texto() }}</span>
    } @else {
      <ng-content />
    }
  `,
  host: {
    '[class]': 'classe()',
    '[attr.aria-busy]': 'loading() || null',
    '[attr.aria-disabled]': 'disabled() || loading() || null',
  },
  styles: `
    :host { display: inline-flex; align-items: center; justify-content: center; gap: var(--hw-space-2);
      border-radius: var(--hw-radius-md); font: var(--hw-text-sm); font-weight: 600; cursor: pointer;
      border: 1px solid transparent; padding: 0 var(--hw-space-4); height: 40px;
      transition: background var(--hw-motion-fast) var(--hw-motion-ease); text-decoration: none; }
    :host(.hw-btn-sm) { height: 32px; padding: 0 var(--hw-space-3); }
    :host(.hw-btn-lg) { height: 48px; padding: 0 var(--hw-space-5); font-size: 16px; }
    :host(.hw-btn-primary) { background: var(--hw-accent); color: var(--hw-on-accent); }
    :host(.hw-btn-primary:hover:not([aria-disabled])) { background: var(--hw-accent-hover); }
    :host(.hw-btn-secondary) { background: var(--hw-surface-raised); color: var(--hw-text); border-color: var(--hw-border); }
    :host(.hw-btn-secondary:hover:not([aria-disabled])) { background: var(--hw-surface); }
    :host(.hw-btn-ghost) { background: transparent; color: var(--hw-accent); }
    :host(.hw-btn-ghost:hover:not([aria-disabled])) { background: var(--hw-surface); }
    :host(.hw-btn-danger) { background: var(--hw-danger); color: var(--hw-on-danger); }
    :host(.hw-btn-danger:hover:not([aria-disabled])) { background: var(--hw-danger-hover); }
    :host([aria-disabled]) { opacity: .5; cursor: not-allowed; pointer-events: none; }
    .spinner { width: 16px; height: 16px; border: 2px solid currentColor; border-top-color: transparent;
      border-radius: 50%; animation: spin .8s linear infinite; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class HwButton {
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  loading = input(false);
  disabled = input(false);
  /** Label legível para screen readers durante loading. */
  texto = input('Carregando…');

  classe() {
    return `hw-btn-${this.variant()} hw-btn-${this.size()}`;
  }
}
