import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/auth/auth.store';
import { HwButton } from '../../shared/ui/button';

/**
 * Auto-cadastro do portal B2B — estilo e-commerce: só dados de acesso,
 * entra logado ao concluir. Dados da empresa são completados depois
 * em "Minha conta → Dados Cadastrais".
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, HwButton],
  templateUrl: './cadastro.html',
  styleUrl: './cadastro.scss',
})
export class CadastroPage {
  private auth = inject(AuthStore);
  private router = inject(Router);

  enviando = signal(false);
  erro = signal<string | null>(null);

  form = new FormGroup({
    nome: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    senha: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    confirmarSenha: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    telefone: new FormControl('', { nonNullable: true }),
  });

  invalido(campo: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[campo];
    return c.invalid && (c.touched || c.dirty);
  }

  senhasDivergem(): boolean {
    const { senha, confirmarSenha } = this.form.getRawValue();
    return confirmarSenha.length > 0 && senha !== confirmarSenha;
  }

  async criar(): Promise<void> {
    if (this.form.invalid || this.senhasDivergem() || this.enviando()) return;
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const v = this.form.getRawValue();
      await this.auth.cadastrar({
        nome: v.nome.trim(),
        email: v.email.trim(),
        senha: v.senha,
        telefone: v.telefone.trim() || null,
      });
      await this.router.navigate(['/']);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      this.erro.set(
        status === 409
          ? 'Este e-mail já possui cadastro. Faça login.'
          : 'Não foi possível concluir o cadastro. Revise os dados.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
