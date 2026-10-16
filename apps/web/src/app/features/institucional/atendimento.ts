import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HwInstitucionalNav } from './institucional-nav';
import { ToastService } from '../../shared/ui/toast';

@Component({
  imports: [ReactiveFormsModule, HwInstitucionalNav],
  templateUrl: './atendimento.html',
  styleUrl: './atendimento.scss',
})
export class AtendimentoPage {
  private toast = inject(ToastService);
  enviado = signal(false);
  enviando = signal(false);

  form = new FormGroup({
    empresa: new FormControl('', [Validators.required]),
    cnpj: new FormControl('', [Validators.required]),
    nome: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    telefone: new FormControl('', [Validators.required]),
    assunto: new FormControl('cotacao', [Validators.required]),
    mensagem: new FormControl('', [Validators.required]),
  });

  enviar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    setTimeout(() => {
      this.enviando.set(false);
      this.enviado.set(true);
      this.toast.ok('Mensagem enviada com sucesso! Em breve entraremos em contato.');
    }, 600);
  }
}
