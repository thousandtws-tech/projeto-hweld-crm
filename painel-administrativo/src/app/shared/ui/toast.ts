import { Component, Injectable, computed, signal } from '@angular/core';

export interface ToastMsg {
  id: number;
  tipo: 'success' | 'error' | 'info' | 'warning';
  texto: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<ToastMsg[]>([]);
  readonly temErro = computed(() => this.toasts().some((t) => t.tipo === 'error'));

  mostrar(tipo: ToastMsg['tipo'], texto: string): void {
    const toast: ToastMsg = { id: ++this.seq, tipo, texto };
    this.toasts.update((ts) => [...ts.slice(-2), toast]);
    setTimeout(() => this.fechar(toast.id), tipo === 'error' ? 8000 : 5000);
  }

  ok(texto: string): void { this.mostrar('success', texto); }
  erro(texto: string): void { this.mostrar('error', texto); }

  fechar(id: number): void {
    this.toasts.update((ts) => ts.filter((t) => t.id !== id));
  }
}

@Component({
  selector: 'hw-toast-host',
  standalone: true,
  template: `
    <div class="toast-region" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast toast-{{ t.tipo }}" [attr.role]="t.tipo === 'error' ? 'alert' : 'status'">
          <span>{{ t.texto }}</span>
          <button type="button" class="fechar" aria-label="Fechar aviso" (click)="toast.fechar(t.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-region { position: fixed; right: var(--hw-space-4); bottom: var(--hw-space-4);
      display: flex; flex-direction: column; gap: var(--hw-space-2); z-index: 1000; max-width: 360px; }
    .toast { display: flex; align-items: center; justify-content: space-between; gap: var(--hw-space-3);
      padding: var(--hw-space-3) var(--hw-space-4); border-radius: var(--hw-radius-md);
      font: var(--hw-text-sm); box-shadow: var(--hw-shadow-pop); background: var(--hw-surface-raised);
      border-left: 4px solid var(--hw-info); animation: toast-in var(--hw-motion-base) var(--hw-motion-ease); }
    .toast-success { border-left-color: var(--hw-success); }
    .toast-error { border-left-color: var(--hw-danger); }
    .toast-warning { border-left-color: var(--hw-warning); }
    .fechar { background: none; border: 0; font-size: 18px; cursor: pointer; color: var(--hw-text-muted); }
    @keyframes toast-in { from { transform: translateY(8px); opacity: 0; } }
  `,
})
export class ToastHost {
  constructor(public toast: ToastService) {}
}
