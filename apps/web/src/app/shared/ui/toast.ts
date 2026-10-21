import { ChangeDetectionStrategy, Component, Injectable, computed, signal } from '@angular/core';

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

  ok(texto: string): void {
    this.mostrar('success', texto);
  }
  erro(texto: string): void {
    this.mostrar('error', texto);
  }

  fechar(id: number): void {
    this.toasts.update((ts) => ts.filter((t) => t.id !== id));
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-toast-host',
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
})
export class ToastHost {
  constructor(public toast: ToastService) {}
}
