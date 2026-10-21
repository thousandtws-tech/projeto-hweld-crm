import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-field',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './field.html',
  styleUrl: './field.scss',
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
