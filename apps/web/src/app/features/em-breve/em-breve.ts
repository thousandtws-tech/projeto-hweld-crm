import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HwButton } from '../../shared/ui/button';

const STORAGE_KEY = 'hweld-em-breve-inscrito';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HwButton],
  templateUrl: './em-breve.html',
  styleUrl: './em-breve.scss',
})
export class EmBrevePage {
  email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  inscrito = signal(localStorage.getItem(STORAGE_KEY) === '1');

  invalido(): boolean {
    return this.email.invalid && this.email.touched;
  }

  avisar(): void {
    if (this.email.invalid) {
      this.email.markAsTouched();
      return;
    }
    localStorage.setItem(STORAGE_KEY, '1');
    this.inscrito.set(true);
  }
}
