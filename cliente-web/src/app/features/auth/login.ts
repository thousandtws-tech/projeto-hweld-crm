import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/auth/auth.store';
import { HwButton } from '../../shared/ui/button';
import { HwField } from '../../shared/ui/field';

/** S01 — Login do portal B2B minimalista com Angular Material. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, HwButton, HwField],
  template: `
    <div class="pagina-login">
      <form class="cartao" [formGroup]="form" (ngSubmit)="entrar()">
        <div class="logo-area">
          <div class="logo-brand">
            <span class="logo-txt">HWELD</span>
            <span class="logo-tag">B2B</span>
          </div>
          <h1>Entrar no Portal</h1>
          <p class="sub">Acesso restrito para clientes industriais com tabela de preços vinculada.</p>
        </div>

        @if (expirada()) {
          <div class="aviso-expirada" role="status">
            <span class="material-symbols-outlined">schedule</span>
            <span>Sua sessão expirou. Entre novamente para continuar.</span>
          </div>
        }
        @if (erro()) {
          <div class="alerta-erro" role="alert">
            <span class="material-symbols-outlined">error</span>
            <span>{{ erro() }}</span>
          </div>
        }

        <div class="campos">
          <hw-field
            [control]="form.controls.email"
            rotulo="E-mail Corporativo"
            id="email"
            tipo="email"
            autocomplete="username"
            erro="Informe um e-mail válido"
          />
          <hw-field
            [control]="form.controls.senha"
            rotulo="Senha de Acesso"
            id="senha"
            tipo="password"
            autocomplete="current-password"
            erro="Informe sua senha"
          />
        </div>

        <button
          hwButton
          size="lg"
          type="submit"
          class="btn-login"
          [loading]="enviando()"
          texto="Acessando o portal…"
          [disabled]="form.invalid"
        >
          <span>Acessar Portal</span>
          <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>

        <div class="rodape-ajuda">
          <span class="material-symbols-outlined seg-icon" aria-hidden="true">lock</span>
          <span>Ainda não possui acesso ou esqueceu sua senha? Entre em contato com seu consultor de vendas HWeld.</span>
        </div>
      </form>
    </div>
  `,
  styles: `
    .pagina-login {
      display: grid;
      place-items: center;
      min-height: calc(100vh - var(--hw-header-h) - 120px);
      padding: var(--hw-space-8) var(--hw-space-4);
    }
    .cartao {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-5);
      width: 100%;
      max-width: 420px;
      padding: var(--hw-space-8);
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-lg);
      box-shadow: var(--hw-shadow-card);
    }
    .logo-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: var(--hw-space-2);
    }
    .logo-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: var(--hw-space-3);
    }
    .logo-txt {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--hw-text);
    }
    .logo-tag {
      font-family: var(--hw-font-mono);
      font-size: 10px;
      font-weight: 700;
      background: var(--hw-accent-tint);
      color: var(--hw-accent);
      border: 1px solid rgba(29, 79, 216, 0.2);
      border-radius: var(--hw-radius-xs);
      padding: 1px 5px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 6px;
      color: var(--hw-text);
    }
    .sub {
      font-size: 13.5px;
      color: var(--hw-text-muted);
      margin: 0;
      line-height: 1.4;
    }
    .campos {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
    }
    .aviso-expirada {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: var(--hw-space-3);
      background: var(--hw-chip-warning-bg);
      border-radius: var(--hw-radius-sm);
      color: var(--hw-warning);
      font-size: 12.5px;
      .material-symbols-outlined { font-size: 18px; flex-shrink: 0; }
    }
    .alerta-erro {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: var(--hw-space-3);
      background: var(--hw-chip-danger-bg);
      border-radius: var(--hw-radius-sm);
      color: var(--hw-danger);
      font-size: 12.5px;
      .material-symbols-outlined { font-size: 18px; flex-shrink: 0; }
    }
    .btn-login {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .rodape-ajuda {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding-top: var(--hw-space-4);
      border-top: 1px solid var(--hw-border-subtle);
      font-size: 11.5px;
      color: var(--hw-text-muted);
      line-height: 1.4;
      .seg-icon { font-size: 15px; color: var(--hw-text-faint); margin-top: 2px; }
    }
  `,
})
export class LoginPage {
  private auth = inject(AuthStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  enviando = signal(false);
  erro = signal<string | null>(null);
  expirada = signal(this.route.snapshot.queryParamMap.has('expired'));

  form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    senha: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

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
