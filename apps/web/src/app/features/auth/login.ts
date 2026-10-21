import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/auth/auth.store';
import { HwButton } from '../../shared/ui/button';

export type ProvedorSocial = 'google' | 'apple';

const NOME_PROVEDOR: Record<ProvedorSocial, string> = {
  google: 'Google',
  apple: 'Apple',
};

/** S01 — Login do portal B2B minimalista com Angular Material. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, HwButton],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private auth = inject(AuthStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  enviando = signal(false);
  erro = signal<string | null>(null);
  avisoSocial = signal<string | null>(null);
  expirada = signal(this.route.snapshot.queryParamMap.has('expired'));

  form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    senha: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  invalido(campo: 'email' | 'senha'): boolean {
    const c = this.form.controls[campo];
    return c.invalid && (c.touched || c.dirty);
  }

  /** Login social ainda não habilitado — exibe aviso mantendo o layout. */
  social(provedor: ProvedorSocial): void {
    this.avisoSocial.set(
      `Login com ${NOME_PROVEDOR[provedor]} em breve — use e-mail e senha.`,
    );
  }

  async entrar(): Promise<void> {
    if (this.form.invalid || this.enviando()) return;
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const { email, senha } = this.form.getRawValue();
      await this.auth.login(email, senha);
      await this.router.navigate(['/']);
    } catch {
      this.erro.set('E-mail ou senha incorretos.');
    } finally {
      this.enviando.set(false);
    }
  }
}
