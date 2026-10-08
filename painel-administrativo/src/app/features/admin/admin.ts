import { Component, OnInit, TemplateRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { AuditoriaService, BuscaService, UsuariosService } from '../../core/servicos';
import { LogAuditoria, Usuario } from '../../core/models';
import { AuthStore } from '../../core/auth';
import { ToastService } from '../../shared/ui/toast';

/** Usuários staff — CRUD + ativo (admin only). */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="d-flex align-items-center mb-3">
      <h1 class="h4 mb-0">Usuários</h1>
      <button class="btn btn-primary btn-sm ms-auto" (click)="abrir(mForm)">+ Usuário</button>
    </div>
    <div class="card"><div class="table-responsive">
      <table class="table mb-0 align-middle">
        <thead class="table-light"><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ativo</th><th class="text-end">Ações</th></tr></thead>
        <tbody>
          @for (u of usuarios(); track u.id) {
            <tr>
              <td>{{ u.nome }}</td><td>{{ u.email }}</td>
              <td><span class="badge text-bg-secondary">{{ u.perfil }}</span></td>
              <td><span class="badge text-bg-{{ u.ativo ? 'success' : 'secondary' }}">{{ u.ativo ? 'Sim' : 'Não' }}</span></td>
              <td class="text-end">
                <button class="btn btn-sm btn-outline-secondary" (click)="abrir(mForm, u)">Editar</button>
                <button class="btn btn-sm btn-outline-{{ u.ativo ? 'danger' : 'success' }}" (click)="alternarAtivo(u)">
                  {{ u.ativo ? 'Desativar' : 'Ativar' }}
                </button>
              </td>
            </tr>
          } @empty { <tr><td colspan="5" class="text-center text-body-secondary py-4">Nenhum usuário.</td></tr> }
        </tbody>
      </table>
    </div></div>

    <ng-template #mForm let-m>
      <div class="modal-header"><h5 class="modal-title">{{ editando ? 'Editar' : 'Novo' }} usuário</h5>
        <button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="f" (ngSubmit)="salvar(m)">
        <div class="modal-body row g-2">
          <div class="col-md-6"><label class="form-label">Nome</label><input class="form-control" formControlName="nome" /></div>
          <div class="col-md-6"><label class="form-label">E-mail</label><input class="form-control" type="email" formControlName="email" /></div>
          @if (!editando) {
            <div class="col-md-6"><label class="form-label">Senha</label><input class="form-control" type="password" formControlName="senha" autocomplete="new-password" /></div>
          }
          <div class="col-md-6"><label class="form-label">Perfil</label>
            <select class="form-select" formControlName="perfil">
              <option value="admin">Admin</option><option value="vendedor">Vendedor</option>
              <option value="financeiro">Financeiro</option><option value="estoque">Estoque</option>
              <option value="tecnico">Técnico</option>
            </select></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" [disabled]="f.invalid">Salvar</button></div>
      </form>
    </ng-template>
  `,
})
export class UsuariosPage implements OnInit {
  private svc = inject(UsuariosService);
  private modal = inject(NgbModal);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly usuarios = signal<Usuario[]>([]);
  editando: Usuario | null = null;

  readonly f = this.fb.group({
    nome: ['', Validators.required], email: ['', [Validators.required, Validators.email]],
    senha: [''], perfil: ['vendedor', Validators.required],
  });

  ngOnInit(): void { this.carregar(); }
  carregar(): void { this.svc.listar({ por_pagina: 100 }).subscribe((p) => this.usuarios.set(p.itens)); }

  abrir(tpl: TemplateRef<unknown>, u?: Usuario): void {
    this.editando = u ?? null;
    this.f.reset({ nome: u?.nome ?? '', email: u?.email ?? '', senha: '', perfil: u?.perfil ?? 'vendedor' });
    this.f.controls.senha.setValidators(this.editando ? null : [Validators.required, Validators.minLength(6)]);
    this.f.controls.senha.updateValueAndValidity();
    this.modal.open(tpl);
  }

  salvar(m: { close(): void }): void {
    const v = this.f.getRawValue();
    const op = this.editando
      ? this.svc.atualizar(this.editando.id, { nome: v.nome!, email: v.email!, perfil: v.perfil! })
      : this.svc.criar({ nome: v.nome!, email: v.email!, senha: v.senha!, perfil: v.perfil! });
    op.subscribe({
      next: () => { this.carregar(); m.close(); this.toast.ok('Usuário salvo.'); },
      error: () => this.toast.erro('Falha ao salvar usuário.'),
    });
  }

  alternarAtivo(u: Usuario): void {
    this.svc.definirAtivo(u.id, !u.ativo).subscribe({
      next: () => this.carregar(),
      error: () => this.toast.erro('Falha ao alterar status.'),
    });
  }
}

/** Busca global staff + reindexar (admin). */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <h1 class="h4 mb-3">Busca</h1>
    <div class="card mb-3"><div class="card-body">
      <form class="d-flex gap-2" [formGroup]="f" (ngSubmit)="buscar()">
        <input class="form-control" formControlName="q" placeholder="Buscar produtos…" aria-label="Buscar" />
        <button class="btn btn-primary">Buscar</button>
      </form>
      <hr />
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-body-secondary">Reindexar o Elasticsearch (admin). Se o ES estiver fora, a busca responde 503.</small>
        <button class="btn btn-outline-danger btn-sm" (click)="reindexar()">Reindexar</button>
      </div>
    </div></div>
    @if (resultados(); as r) {
      <div class="card"><div class="card-body">
        @if (r.length === 0) { <p class="text-body-secondary mb-0">Nenhum resultado.</p> }
        <ul class="list-group list-group-flush">
          @for (i of r; track i['id']) {
            <li class="list-group-item">{{ i['nome'] }} <small class="text-body-secondary">{{ i['sku'] }}</small></li>
          }
        </ul>
      </div></div>
    }
  `,
})
export class BuscaPage implements OnInit {
  private svc = inject(BuscaService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  readonly resultados = signal<Record<string, unknown>[] | null>(null);
  readonly f = this.fb.group({ q: ['', Validators.required] });

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) { this.f.setValue({ q }); this.buscar(); }
  }

  buscar(): void {
    this.svc.buscar({ q: this.f.value.q ?? undefined }).subscribe({
      next: (p) => this.resultados.set(p.itens),
      error: () => { this.resultados.set([]); this.toast.erro('Busca indisponível (ES offline?).'); },
    });
  }
  reindexar(): void {
    this.svc.reindexar().subscribe({
      next: () => this.toast.ok('Reindexação solicitada.'),
      error: () => this.toast.erro('Falha ao reindexar.'),
    });
  }
}

/** Auditoria — read-only, diff antes/depois expansível. */
@Component({
  standalone: true,
  imports: [JsonPipe],
  template: `
    <h1 class="h4 mb-3">Auditoria</h1>
    <div class="card"><div class="table-responsive">
      <table class="table mb-0 align-middle">
        <thead class="table-light"><tr><th>Quando</th><th>Usuário</th><th>Entidade</th><th>Ação</th><th></th></tr></thead>
        <tbody>
          @for (l of logs(); track l.id) {
            <tr>
              <td><small>{{ l.created_at }}</small></td>
              <td>#{{ l.usuario_id ?? '—' }}</td>
              <td>{{ l.entidade }} #{{ l.entidade_id }}</td>
              <td><span class="badge text-bg-secondary">{{ l.acao }}</span></td>
              <td class="text-end">
                @if (l.antes || l.depois) {
                  <button class="btn btn-sm btn-outline-secondary" (click)="toggle(l.id)">
                    {{ aberto() === l.id ? 'ocultar diff' : 'ver diff' }}
                  </button>
                }
              </td>
            </tr>
            @if (aberto() === l.id) {
              <tr class="table-light"><td colspan="5">
                <div class="row g-2 small">
                  <div class="col-md-6"><strong>Antes</strong><pre class="bg-white border rounded p-2 mb-0"><code>{{ l.antes | json }}</code></pre></div>
                  <div class="col-md-6"><strong>Depois</strong><pre class="bg-white border rounded p-2 mb-0"><code>{{ l.depois | json }}</code></pre></div>
                </div>
              </td></tr>
            }
          } @empty { <tr><td colspan="5" class="text-center text-body-secondary py-4">Sem logs.</td></tr> }
        </tbody>
      </table>
    </div></div>
  `,
})
export class AuditoriaPage implements OnInit {
  private svc = inject(AuditoriaService);
  readonly logs = signal<LogAuditoria[]>([]);
  readonly aberto = signal<number | null>(null);

  ngOnInit(): void { this.svc.listar({ por_pagina: 100 }).subscribe((p) => this.logs.set(p.itens)); }
  toggle(id: number): void { this.aberto.set(this.aberto() === id ? null : id); }
}

/** Minha conta — troca a senha do staff logado (`POST /auth/senha`). */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <h1 class="h4 mb-3">Minha conta</h1>
    <form class="card" style="max-width: 420px" [formGroup]="f" (ngSubmit)="trocar()">
      <div class="card-header">Trocar senha</div>
      <div class="card-body d-grid gap-2">
        <div><label class="form-label" for="s-atual">Senha atual</label>
          <input id="s-atual" class="form-control" type="password" formControlName="senha_atual" autocomplete="current-password" /></div>
        <div><label class="form-label" for="s-nova">Nova senha</label>
          <input id="s-nova" class="form-control" type="password" formControlName="nova_senha" autocomplete="new-password" /></div>
        <div><label class="form-label" for="s-conf">Confirmar nova senha</label>
          <input id="s-conf" class="form-control" type="password" formControlName="confirmar" autocomplete="new-password"
                 [class.is-invalid]="f.errors?.['mismatch'] && f.controls.confirmar.touched" />
          @if (f.errors?.['mismatch'] && f.controls.confirmar.touched) {
            <small class="text-danger">As senhas não conferem.</small>
          }</div>
        <button class="btn btn-primary" [disabled]="f.invalid">Salvar nova senha</button>
      </div>
    </form>
  `,
})
export class SenhaPage {
  private auth = inject(AuthStore);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly f = this.fb.group(
    {
      senha_atual: ['', Validators.required],
      nova_senha: ['', [Validators.required, Validators.minLength(6)]],
      confirmar: ['', Validators.required],
    },
    { validators: (g) => (g.get('nova_senha')?.value === g.get('confirmar')?.value ? null : { mismatch: true }) },
  );

  async trocar(): Promise<void> {
    const v = this.f.getRawValue();
    try {
      await this.auth.trocarSenha(v.senha_atual!, v.nova_senha!);
      this.f.reset();
      this.toast.ok('Senha alterada.');
    } catch (e) {
      this.toast.erro((e as { status?: number }).status === 422 ? 'Senha atual incorreta.' : 'Falha ao trocar a senha.');
    }
  }
}
