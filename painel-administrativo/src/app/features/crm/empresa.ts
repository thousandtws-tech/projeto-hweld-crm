import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalModule, NgbNavModule } from '@ng-bootstrap/ng-bootstrap';
import { CrmService, CatalogoService, TabelaPreco } from '../../core/servicos';
import { Contato, Empresa as EmpresaModel, Oportunidade } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

type Linha = Record<string, unknown>;

/** Empresa 360 — dados, contatos (+portal), endereços, oportunidades, timeline. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, NgbNavModule, NgbModalModule, BrlPipe, StatusLabelPipe],
  template: `
    @if (empresa(); as e) {
      <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 class="h4 mb-0">{{ e.nome_fantasia || e.razao_social }}</h1>
          <small class="text-body-secondary">{{ e.razao_social }} · CNPJ {{ e.cnpj || '—' }}</small>
        </div>
        <span class="badge text-bg-{{ e.status === 'ativo' ? 'success' : 'secondary' }}">{{ e.status | statusLabel }}</span>
        <div class="ms-auto">
          <button class="btn btn-outline-secondary btn-sm" (click)="abrirEdicao(mEdicao)">Editar</button>
        </div>
      </div>

      <ul ngbNav #nav="ngbNav" class="nav-tabs mb-3">
        <li ngbNavItem="1"><button ngbNavLink>Dados</button>
          <ng-template ngbNavContent>
        <div class="card"><div class="card-body row g-3">
          <div class="col-md-4"><small class="text-body-secondary">Segmento</small><div>{{ e.segmento || '—' }}</div></div>
          <div class="col-md-4"><small class="text-body-secondary">Telefone</small><div>{{ e.telefone || '—' }}</div></div>
          <div class="col-md-4"><small class="text-body-secondary">E-mail</small><div>{{ e.email || '—' }}</div></div>
          <div class="col-md-4"><small class="text-body-secondary">Site</small><div>{{ e.site || '—' }}</div></div>
          <div class="col-md-4"><small class="text-body-secondary">IE</small><div>{{ e.inscricao_estadual || '—' }}</div></div>
          <div class="col-md-4"><small class="text-body-secondary">Tabela de preço</small><div>{{ nomeTabela(e.tabela_preco_id) }}</div></div>
          <div class="col-12"><small class="text-body-secondary">Observações</small><div>{{ e.observacoes || '—' }}</div></div>
        </div></div>
          </ng-template></li>

        <li ngbNavItem="2"><button ngbNavLink>Contatos ({{ contatos().length }})</button>
          <ng-template ngbNavContent>
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span>Contatos</span>
            <button class="btn btn-primary btn-sm" (click)="abrirContato(mContato)">+ Contato</button>
          </div>
          <div class="table-responsive">
            <table class="table mb-0 align-middle">
              <thead class="table-light"><tr>
                <th>Nome</th><th>Cargo</th><th>E-mail</th><th>Telefone</th><th>Principal</th><th>Portal</th><th></th>
              </tr></thead>
              <tbody>
                @for (c of contatos(); track c.id) {
                  <tr>
                    <td>{{ c.nome }}</td><td>{{ c.cargo || '—' }}</td><td>{{ c.email || '—' }}</td>
                    <td>{{ c.telefone || c.whatsapp || '—' }}</td>
                    <td>{{ c.is_principal ? 'Sim' : '' }}</td>
                    <td><span class="badge text-bg-{{ c.acesso_portal ? 'success' : 'secondary' }}">{{ c.acesso_portal ? 'Ativo' : 'Inativo' }}</span></td>
                    <td class="text-end">
                      @if (!c.acesso_portal) {
                        <button class="btn btn-sm btn-outline-primary" (click)="abrirPortal(mPortal, c)">Ativar portal</button>
                      } @else {
                        <button class="btn btn-sm btn-outline-danger" (click)="desativarPortal(c)">Revogar</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
          </ng-template></li>

        <li ngbNavItem="3"><button ngbNavLink>Endereços ({{ enderecos().length }})</button>
          <ng-template ngbNavContent>
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span>Endereços</span>
            <button class="btn btn-primary btn-sm" (click)="abrirEndereco(mEndereco)">+ Endereço</button>
          </div>
          <ul class="list-group list-group-flush">
            @for (end of enderecos(); track end['id']) {
              <li class="list-group-item d-flex justify-content-between">
                <span>{{ end['logradouro'] }}, {{ end['numero'] }} — {{ end['cidade'] }}/{{ end['uf'] }} · CEP {{ end['cep'] }}</span>
                <span class="badge text-bg-secondary">{{ end['tipo'] }}</span>
              </li>
            } @empty { <li class="list-group-item text-body-secondary">Nenhum endereço.</li> }
          </ul>
        </div>
          </ng-template></li>

        <li ngbNavItem="4"><button ngbNavLink>Oportunidades ({{ oportunidades().length }})</button>
          <ng-template ngbNavContent>
        <div class="card"><div class="table-responsive">
          <table class="table mb-0 align-middle">
            <thead class="table-light"><tr><th>Título</th><th>Estágio</th><th>Valor est.</th><th>Previsão</th></tr></thead>
            <tbody>
              @for (o of oportunidades(); track o.id) {
                <tr><td>{{ o.titulo }}</td>
                  <td><span class="chip chip-{{ o.estagio }}">{{ o.estagio | statusLabel }}</span></td>
                  <td>{{ o.valor_estimado | brl }}</td><td>{{ o.data_prevista_fechamento || '—' }}</td></tr>
              } @empty { <tr><td colspan="4" class="text-center text-body-secondary py-4">Sem oportunidades.</td></tr> }
            </tbody>
          </table>
        </div></div>
          </ng-template></li>

        <li ngbNavItem="5"><button ngbNavLink>Timeline ({{ interacoes().length }})</button>
          <ng-template ngbNavContent>
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span>Interações</span>
            <button class="btn btn-primary btn-sm" (click)="abrirInteracao(mInteracao)">+ Registrar</button>
          </div>
          <ul class="list-group list-group-flush">
            @for (i of interacoes(); track i['id']) {
              <li class="list-group-item">
                <div class="d-flex justify-content-between">
                  <strong>{{ i['assunto'] || i['tipo'] }}</strong>
                  <small class="text-body-secondary">{{ i['ocorrido_em'] || i['created_at'] }}</small>
                </div>
                <div>{{ i['descricao'] }}</div>
              </li>
            } @empty { <li class="list-group-item text-body-secondary">Nenhuma interação.</li> }
          </ul>
        </div>
          </ng-template></li>
      </ul>
      <div [ngbNavOutlet]="nav"></div>
    } @else {
      <div class="card"><div class="card-body text-center text-body-secondary py-5">
        {{ erro() || 'Carregando…' }}
      </div></div>
    }

    <ng-template #mEdicao let-modal>
      <div class="modal-header"><h5 class="modal-title">Editar empresa</h5>
        <button class="btn-close" (click)="modal.dismiss()"></button></div>
      <form [formGroup]="fEmpresa" (ngSubmit)="salvarEmpresa(modal)">
        <div class="modal-body row g-2">
          <div class="col-12"><label class="form-label">Razão social</label>
            <input class="form-control" formControlName="razao_social" /></div>
          <div class="col-md-6"><label class="form-label">Nome fantasia</label>
            <input class="form-control" formControlName="nome_fantasia" /></div>
          <div class="col-md-6"><label class="form-label">CNPJ</label>
            <input class="form-control" formControlName="cnpj" /></div>
          <div class="col-md-6"><label class="form-label">Status</label>
            <select class="form-select" formControlName="status">
              <option value="prospecto">Prospecto</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option>
            </select></div>
          <div class="col-md-6"><label class="form-label">Tabela de preço</label>
            <select class="form-select" formControlName="tabela_preco_id">
              <option [ngValue]="null">Padrão</option>
              @for (t of tabelas(); track t.id) { <option [ngValue]="t.id">{{ t.nome }}</option> }
            </select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" type="submit" [disabled]="fEmpresa.invalid">Salvar</button>
        </div>
      </form>
    </ng-template>

    <ng-template #mContato let-modal>
      <div class="modal-header"><h5 class="modal-title">Novo contato</h5>
        <button class="btn-close" (click)="modal.dismiss()"></button></div>
      <form [formGroup]="fContato" (ngSubmit)="salvarContato(modal)">
        <div class="modal-body row g-2">
          <div class="col-md-6"><label class="form-label">Nome</label><input class="form-control" formControlName="nome" /></div>
          <div class="col-md-6"><label class="form-label">Cargo</label><input class="form-control" formControlName="cargo" /></div>
          <div class="col-md-6"><label class="form-label">E-mail</label><input class="form-control" type="email" formControlName="email" /></div>
          <div class="col-md-6"><label class="form-label">Telefone</label><input class="form-control" formControlName="telefone" /></div>
          <div class="col-12 form-check ms-2">
            <input class="form-check-input" type="checkbox" id="cPrincipal" formControlName="is_principal" />
            <label class="form-check-label" for="cPrincipal">Contato principal</label>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" type="submit" [disabled]="fContato.invalid">Salvar</button></div>
      </form>
    </ng-template>

    <ng-template #mPortal let-modal>
      <div class="modal-header"><h5 class="modal-title">Ativar acesso ao portal</h5>
        <button class="btn-close" (click)="modal.dismiss()"></button></div>
      <form [formGroup]="fPortal" (ngSubmit)="salvarPortal(modal)">
        <div class="modal-body">
          <p>Defina a senha inicial de <strong>{{ contatoSel()?.nome }}</strong>. Ela poderá ser trocada no primeiro acesso.</p>
          <label class="form-label">Senha inicial</label>
          <input class="form-control" type="password" formControlName="senha" autocomplete="new-password" />
        </div>
        <div class="modal-footer"><button class="btn btn-primary" type="submit" [disabled]="fPortal.invalid">Ativar</button></div>
      </form>
    </ng-template>

    <ng-template #mEndereco let-modal>
      <div class="modal-header"><h5 class="modal-title">Novo endereço</h5>
        <button class="btn-close" (click)="modal.dismiss()"></button></div>
      <form [formGroup]="fEndereco" (ngSubmit)="salvarEndereco(modal)">
        <div class="modal-body row g-2">
          <div class="col-md-4"><label class="form-label">Tipo</label>
            <select class="form-select" formControlName="tipo">
              <option value="fiscal">Fiscal</option><option value="entrega">Entrega</option><option value="correspondencia">Correspondência</option>
            </select></div>
          <div class="col-md-8"><label class="form-label">Logradouro</label><input class="form-control" formControlName="logradouro" /></div>
          <div class="col-md-3"><label class="form-label">Número</label><input class="form-control" formControlName="numero" /></div>
          <div class="col-md-5"><label class="form-label">Bairro</label><input class="form-control" formControlName="bairro" /></div>
          <div class="col-md-4"><label class="form-label">CEP</label><input class="form-control" formControlName="cep" /></div>
          <div class="col-md-8"><label class="form-label">Cidade</label><input class="form-control" formControlName="cidade" /></div>
          <div class="col-md-4"><label class="form-label">UF</label><input class="form-control" maxlength="2" formControlName="uf" /></div>
          <div class="col-12 form-check ms-2">
            <input class="form-check-input" type="checkbox" id="ePrincipal" formControlName="principal" />
            <label class="form-check-label" for="ePrincipal">Endereço principal</label>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" type="submit" [disabled]="fEndereco.invalid">Salvar</button></div>
      </form>
    </ng-template>

    <ng-template #mInteracao let-modal>
      <div class="modal-header"><h5 class="modal-title">Registrar interação</h5>
        <button class="btn-close" (click)="modal.dismiss()"></button></div>
      <form [formGroup]="fInteracao" (ngSubmit)="salvarInteracao(modal)">
        <div class="modal-body row g-2">
          <div class="col-md-6"><label class="form-label">Tipo</label>
            <select class="form-select" formControlName="tipo">
              <option value="ligacao">Ligação</option><option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option><option value="reuniao">Reunião</option>
              <option value="visita">Visita</option><option value="nota_interna">Nota interna</option><option value="outro">Outro</option>
            </select></div>
          <div class="col-md-6"><label class="form-label">Assunto</label><input class="form-control" formControlName="assunto" /></div>
          <div class="col-12"><label class="form-label">Descrição</label><textarea class="form-control" rows="3" formControlName="descricao"></textarea></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" type="submit" [disabled]="fInteracao.invalid">Registrar</button></div>
      </form>
    </ng-template>
  `,
})
export class Empresa360Page implements OnInit {
  private route = inject(ActivatedRoute);
  private crm = inject(CrmService);
  private catalogo = inject(CatalogoService);
  private modal = inject(NgbModal);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly empresa = signal<EmpresaModel | null>(null);
  readonly contatos = signal<Contato[]>([]);
  readonly enderecos = signal<Linha[]>([]);
  readonly oportunidades = signal<Oportunidade[]>([]);
  readonly interacoes = signal<Linha[]>([]);
  readonly tabelas = signal<TabelaPreco[]>([]);
  readonly contatoSel = signal<Contato | null>(null);
  readonly erro = signal<string | null>(null);

  readonly fEmpresa = this.fb.group({
    razao_social: ['', Validators.required], nome_fantasia: [''], cnpj: [''],
    status: ['ativo', Validators.required], tabela_preco_id: [null as number | null],
  });
  readonly fContato = this.fb.group({
    nome: ['', Validators.required], cargo: [''], email: [''], telefone: [''], is_principal: [false],
  });
  readonly fPortal = this.fb.group({ senha: ['', [Validators.required, Validators.minLength(6)]] });
  readonly fEndereco = this.fb.group({
    tipo: ['fiscal', Validators.required], logradouro: [''], numero: [''], bairro: [''],
    cep: ['', Validators.required], cidade: ['', Validators.required], uf: ['', [Validators.required, Validators.maxLength(2)]],
    principal: [false],
  });
  readonly fInteracao = this.fb.group({
    tipo: ['nota_interna', Validators.required], assunto: [''], descricao: [''],
  });

  private id(): number { return Number(this.route.snapshot.paramMap.get('id')); }

  ngOnInit(): void { this.carregar(); }

  carregar(): void {
    const id = this.id();
    this.crm.empresa(id).subscribe({ next: (e) => this.empresa.set(e), error: () => this.erro.set('Empresa não encontrada.') });
    this.crm.contatos({ empresa_id: id }).subscribe((p) => this.contatos.set(p.itens));
    this.crm.enderecos(id).subscribe((p) => this.enderecos.set(p.itens));
    this.crm.oportunidades({ empresa_id: id }).subscribe((p) => this.oportunidades.set(p.itens));
    this.crm.timeline({ empresa_id: id }).subscribe((p) => this.interacoes.set(p.itens));
    this.catalogo.tabelas({ ativa: true }).subscribe((p) => this.tabelas.set(p.itens));
  }

  nomeTabela(id: number | null): string {
    return this.tabelas().find((t) => t.id === id)?.nome ?? 'Padrão';
  }

  abrirEdicao(tpl: unknown): void {
    const e = this.empresa()!;
    this.fEmpresa.patchValue({ razao_social: e.razao_social, nome_fantasia: e.nome_fantasia ?? '', cnpj: e.cnpj ?? '', status: e.status, tabela_preco_id: e.tabela_preco_id });
    this.modal.open(tpl as object, { size: 'lg' });
  }
  salvarEmpresa(modal: { close(): void }): void {
    this.crm.atualizarEmpresa(this.id(), this.fEmpresa.getRawValue()).subscribe({
      next: (e) => { this.empresa.set(e); modal.close(); this.toast.ok('Empresa atualizada.'); },
      error: () => this.toast.erro('Falha ao salvar.'),
    });
  }

  abrirContato(tpl: unknown): void { this.modal.open(tpl as object, { size: 'lg' }); }
  salvarContato(modal: { close(): void }): void {
    this.crm.criarContato({ ...this.fContato.getRawValue(), empresa_id: this.id(), acesso_portal: false }).subscribe({
      next: () => { this.crm.contatos({ empresa_id: this.id() }).subscribe((p) => this.contatos.set(p.itens)); modal.close(); this.toast.ok('Contato criado.'); },
      error: () => this.toast.erro('Falha ao criar contato.'),
    });
  }

  abrirPortal(tpl: unknown, c: Contato): void { this.contatoSel.set(c); this.modal.open(tpl as object); }
  salvarPortal(modal: { close(): void }): void {
    const c = this.contatoSel()!;
    this.crm.ativarPortal(c.id, this.fPortal.value.senha!).subscribe({
      next: () => { this.crm.contatos({ empresa_id: this.id() }).subscribe((p) => this.contatos.set(p.itens)); modal.close(); this.toast.ok('Portal ativado.'); },
      error: () => this.toast.erro('Falha ao ativar portal.'),
    });
  }
  desativarPortal(c: Contato): void {
    this.crm.desativarPortal(c.id).subscribe({
      next: () => this.crm.contatos({ empresa_id: this.id() }).subscribe((p) => this.contatos.set(p.itens)),
      error: () => this.toast.erro('Falha ao revogar acesso.'),
    });
  }

  abrirEndereco(tpl: unknown): void { this.modal.open(tpl as object, { size: 'lg' }); }
  salvarEndereco(modal: { close(): void }): void {
    this.crm.criarEndereco({ ...this.fEndereco.getRawValue(), empresa_id: this.id() }).subscribe({
      next: () => { this.crm.enderecos(this.id()).subscribe((p) => this.enderecos.set(p.itens)); modal.close(); this.toast.ok('Endereço criado.'); },
      error: () => this.toast.erro('Falha ao salvar endereço.'),
    });
  }

  abrirInteracao(tpl: unknown): void { this.modal.open(tpl as object); }
  salvarInteracao(modal: { close(): void }): void {
    this.crm.registrarInteracao({ ...this.fInteracao.getRawValue(), empresa_id: this.id() }).subscribe({
      next: () => { this.crm.timeline({ empresa_id: this.id() }).subscribe((p) => this.interacoes.set(p.itens)); modal.close(); this.toast.ok('Interação registrada.'); },
      error: () => this.toast.erro('Falha ao registrar.'),
    });
  }
}

/** Nova empresa — cadastro mínimo; 360 completa depois. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="h4 mb-3">Nova empresa</h1>
    <form class="card" [formGroup]="f" (ngSubmit)="salvar()">
      <div class="card-body row g-2">
        <div class="col-md-8"><label class="form-label">Razão social</label>
          <input class="form-control" formControlName="razao_social" /></div>
        <div class="col-md-4"><label class="form-label">Nome fantasia</label>
          <input class="form-control" formControlName="nome_fantasia" /></div>
        <div class="col-md-4"><label class="form-label">CNPJ</label>
          <input class="form-control" formControlName="cnpj" /></div>
        <div class="col-md-4"><label class="form-label">Segmento</label>
          <input class="form-control" formControlName="segmento" /></div>
        <div class="col-md-4"><label class="form-label">Status</label>
          <select class="form-select" formControlName="status">
            <option value="prospecto">Prospecto</option><option value="ativo">Ativo</option>
          </select></div>
        <div class="col-md-6"><label class="form-label">E-mail</label>
          <input class="form-control" type="email" formControlName="email" /></div>
        <div class="col-md-6"><label class="form-label">Telefone</label>
          <input class="form-control" formControlName="telefone" /></div>
      </div>
      <div class="card-footer d-flex gap-2">
        <button class="btn btn-primary" [disabled]="f.invalid">Criar</button>
        <a class="btn btn-outline-secondary" routerLink="/crm/empresas">Cancelar</a>
      </div>
    </form>
  `,
})
export class EmpresaNovaPage {
  private crm = inject(CrmService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  readonly f = this.fb.group({
    razao_social: ['', Validators.required], nome_fantasia: [''], cnpj: [''],
    segmento: [''], status: ['prospecto'], email: [''], telefone: [''],
  });
  salvar(): void {
    this.crm.criarEmpresa(this.f.getRawValue()).subscribe({
      next: (e) => { this.toast.ok('Empresa criada.'); void this.router.navigate(['/crm/empresas', e.id]); },
      error: () => this.toast.erro('Falha ao criar empresa.'),
    });
  }
}
