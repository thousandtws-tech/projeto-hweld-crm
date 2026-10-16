import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContaService } from '../../core/servicos';
import { HwButton } from '../../shared/ui/button';
import { HwField } from '../../shared/ui/field';
import { ToastService } from '../../shared/ui/toast';
import { HwContaNav } from './conta-nav';

/** S12 — Trocar senha da conta. */
@Component({
  imports: [ReactiveFormsModule, HwButton, HwField, HwContaNav],
  templateUrl: './seguranca.html',
  styleUrl: './seguranca.scss',
})
export class SegurancaPage implements OnInit {
  private conta = inject(ContaService);
  private toast = inject(ToastService);

  enviando = signal(false);
  form = new FormGroup({
    atual: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    nova: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    confirma: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.form.controls.confirma.valueChanges.subscribe(() => {
      const ok = this.form.controls.nova.value === this.form.controls.confirma.value;
      this.form.controls.confirma.setErrors(ok ? null : { confere: true });
    });
  }

  async trocar(): Promise<void> {
    if (this.form.invalid || this.enviando()) return;
    this.enviando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.conta.trocarSenha(v.atual, v.nova);
      this.toast.ok('Senha alterada com sucesso.');
      this.form.reset();
    } catch {
      this.toast.erro('Não foi possível trocar a senha. Confira sua senha atual.');
    } finally {
      this.enviando.set(false);
    }
  }
}
