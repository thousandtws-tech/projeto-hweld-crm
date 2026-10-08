import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'hw-field',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <label class="label" [for]="id()">{{ rotulo() }}</label>
    <input
      class="input"
      [id]="id()"
      [type]="tipo()"
      [placeholder]="placeholder()"
      [formControl]="control()"
      [attr.aria-invalid]="invalido() || null"
      [attr.aria-describedby]="invalido() ? id() + '-erro' : null"
      [autocomplete]="autocomplete()"
    />
    @if (invalido()) {
      <span class="erro" [id]="id() + '-erro'" role="alert">{{ erro() }}</span>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hw-space-1); }
    .label { font: var(--hw-text-xs); color: var(--hw-text-muted); }
    .input { height: 40px; padding: 0 var(--hw-space-3); border: 1px solid var(--hw-border-input);
      border-radius: var(--hw-radius-sm); font: var(--hw-text-sm); color: var(--hw-text);
      background: var(--hw-surface-raised); }
    .input[aria-invalid] { border-color: var(--hw-danger); }
    .erro { font: var(--hw-text-xs); color: var(--hw-danger); }
  `,
})
export class HwField {
  control = input.required<FormControl>();
  rotulo = input.required<string>();
  id = input.required<string>();
  tipo = input<'text' | 'email' | 'password' | 'search'>('text');
  placeholder = input('');
  erro = input('Campo inválido');
  autocomplete = input('off');

  invalido(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}
