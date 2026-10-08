import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/auth';
import { HwButton } from '../../shared/ui/button';
import { HwField } from '../../shared/ui/field';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, HwButton, HwField],
  template: `
    <main class="pagina">
      <section class="brand-panel">
        <div class="brand-inner">
          <span class="logo" aria-hidden="true"><i class="bi bi-lightning-charge-fill"></i></span>
          <h1>HWeld <em>Admin</em></h1>
          <p class="tag">Backoffice do e-commerce B2B de soldagem — CRM, catálogo, vendas, estoque e financeiro em um só lugar.</p>
          <ul class="feats">
            <li><i class="bi bi-check2-circle"></i> Pipeline de oportunidades e orçamentos</li>
            <li><i class="bi bi-check2-circle"></i> Pedidos com máquina de status auditável</li>
            <li><i class="bi bi-check2-circle"></i> Estoque, NF e caixa integrados</li>
          </ul>
        </div>
      </section>
      <section class="form-panel">
        <form class="card" [formGroup]="form" (ngSubmit)="entrar()">
          <h2>Entrar</h2>
          <p class="sub">Acesso restrito à equipe</p>
          @if (expirada()) {
            <div class="alert alert-warning py-2 small" role="status">Sessão expirada. Entre novamente.</div>
          }
          @if (erro()) {
            <div class="alert alert-danger py-2 small" role="alert">{{ erro() }}</div>
          }
          <hw-field rotulo="E-mail" id="login-email" tipo="email" autocomplete="username"
                    [control]="form.controls.email" erro="Informe um e-mail válido" />
          <hw-field rotulo="Senha" id="login-senha" tipo="password" autocomplete="current-password"
                    [control]="form.controls.senha" erro="Informe a senha" />
          <button hwButton type="submit" variant="primary" [disabled]="form.invalid || entrando()"
                  [loading]="entrando()" texto="Entrando…">
            Entrar
          </button>
        </form>
      </section>
    </main>
  `,
  styles: `
    .pagina { min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
    .brand-panel {
      display: flex; align-items: center; justify-content: center; padding: var(--hw-space-8);
      background:
        radial-gradient(ellipse 90% 60% at 10% 0%, rgb(59 130 246 / 22%), transparent 55%),
        radial-gradient(ellipse 70% 50% at 90% 100%, rgb(29 79 216 / 18%), transparent 60%),
        #0d1420;
      color: #e6ecf4;
    }
    .brand-inner { max-width: 440px; }
    .logo {
      width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center;
      background: linear-gradient(135deg, var(--hw-accent), #3b82f6);
      color: #fff; font-size: 26px; box-shadow: 0 8px 24px rgb(29 79 216 / 45%);
      margin-bottom: var(--hw-space-6);
    }
    h1 { margin: 0 0 var(--hw-space-2); font-size: 2rem; font-weight: 800; letter-spacing: -.02em; }
    h1 em { font-style: normal; color: #7ea4f8; font-weight: 500; }
    .tag { color: #9fb0c6; font-size: 1rem; line-height: 1.55; margin: 0 0 var(--hw-space-8); }
    .feats { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--hw-space-3); }
    .feats li { display: flex; gap: 10px; align-items: center; color: #c3cedd; font-size: .9rem; }
    .feats i { color: #4ade80; }
    .form-panel { display: grid; place-items: center; background: var(--hw-app-bg); padding: var(--hw-space-4); }
    .card { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: var(--hw-space-4); padding: var(--hw-space-8); }
    h2 { margin: 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -.02em; }
    .sub { margin: calc(var(--hw-space-3) * -1) 0 0; color: var(--hw-text-muted); font-size: .9rem; }
    @media (max-width: 860px) {
      .pagina { grid-template-columns: 1fr; }
      .brand-panel { display: none; }
    }
  `,
})
export class LoginPage {
  private auth = inject(AuthStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    senha: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly erro = signal<string | null>(null);
  readonly entrando = signal(false);
  readonly expirada = signal(this.route.snapshot.queryParamMap.get('expired') === '1');

  async entrar(): Promise<void> {
    if (this.form.invalid) return;
    this.entrando.set(true);
    this.erro.set(null);
    try {
      const { email, senha } = this.form.getRawValue();
      await this.auth.login(email, senha);
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.erro.set('Credenciais inválidas ou usuário inativo.');
    } finally {
      this.entrando.set(false);
    }
  }
}
