import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'hw-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="hw-mat-field" [subscriptSizing]="'dynamic'">
      <mat-label>{{ rotulo() }}</mat-label>
      <input
        matInput
        [id]="id()"
        [type]="tipo()"
        [placeholder]="placeholder()"
        [formControl]="control()"
        [autocomplete]="autocomplete()"
      />
      @if (invalido()) {
        <mat-error [id]="id() + '-erro'">{{ erro() }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .hw-mat-field {
      width: 100%;
    }
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
