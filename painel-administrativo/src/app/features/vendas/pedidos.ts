import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmService, CatalogoService, PedidosService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Pedido, Produto } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

/** Máquina de status do pedido (domínio `vendas/pedido.rs`). */
const TRANSICOES: Record<string, { para: string; rotulo: string; cor: string }[]> = {
  aguardando_pagamento: [
    { para: 'confirmado', rotulo: 'Confirmar pagamento', cor: 'success' },
    { para: 'cancelado', rotulo: 'Cancelar', cor: 'outline-danger' },
  ],
  confirmado: [
    { para: 'em_separacao', rotulo: 'Iniciar separação', cor: 'primary' },
    { para: 'cancelado', rotulo: 'Cancelar', cor: 'outline-danger' },
  ],
  em_separacao: [
    { para: 'faturado', rotulo: 'Faturar', cor: 'primary' },
    { para: 'cancelado', rotulo: 'Cancelar', cor: 'outline-danger' },
  ],
  faturado: [{ para: 'enviado', rotulo: 'Marcar enviado', cor: 'primary' }],
  enviado: [{ para: 'entregue', rotulo: 'Marcar entregue', cor: 'success' }],
  entregue: [{ para: 'concluido', rotulo: 'Concluir', cor: 'success' }],
};
const STEPS = ['aguardando_pagamento', 'confirmado', 'em_separacao', 'faturado', 'enviado', 'entregue', 'concluido'];

type PedidoDetalhe = Pedido & { itens?: { descricao: string; sku: string; quantidade: string; preco_unitario: string; desconto: string; total: string }[] };

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, BrlPipe, StatusLabelPipe],
  template: `
    @if (pedido(); as p) {
      <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
        <h1 class="h4 mb-0">Pedido {{ p.numero }}</h1>
        <span class="chip chip-{{ p.status }}">{{ p.status | statusLabel }}</span>
        <small class="text-body-secondary">origem {{ p.origem }} · {{ p.created_at | date:'dd/MM/yyyy HH:mm' }}</small>
        <div class="ms-auto d-flex gap-2">
          @for (t of transicoes(p.status); track t.para) {
            <button class="btn btn-{{ t.cor }} btn-sm" (click)="transicionar(p, t.para)">{{ t.rotulo }}</button>
          }
        </div>
      </div>

      <ol class="steps mb-4" aria-label="Progresso do pedido">
        @for (s of steps; track s; let i = $index) {
          <li class="step {{ i < idx(p.status) ? 'feito' : '' }} {{ i === idx(p.status) ? 'atual' : '' }}">
            {{ s | statusLabel }}
          </li>
        }
      </ol>

      <div class="row g-3">
        <div class="col-lg-8">
          <div class="card">
            <div class="card-header">Itens</div>
            <div class="table-responsive">
              <table class="table mb-0 align-middle">
                <thead class="table-light"><tr><th>SKU</th><th>Descrição</th><th>Qtd</th><th>Unit.</th><th>Desc.</th><th class="text-end">Total</th></tr></thead>
                <tbody>
                  @for (i of p.itens ?? []; track $index) {
                    <tr>
                      <td class="hw-numeric">{{ i.sku }}</td><td>{{ i.descricao }}</td>
                      <td class="hw-numeric">{{ i.quantidade }}</td>
                      <td class="hw-numeric">{{ i.preco_unitario | brl }}</td>
                      <td class="hw-numeric">{{ i.desconto | brl }}</td>
                      <td class="text-end hw-numeric">{{ i.total | brl }}</td>
                    </tr>
                  } @empty { <tr><td colspan="6" class="text-center text-body-secondary py-4">Sem itens.</td></tr> }
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="card"><div class="card-body">
            <h2 class="h6">Totais</h2>
            <dl class="row mb-0 hw-numeric">
              <dt class="col-6 fw-normal text-body-secondary">Subtotal</dt><dd class="col-6 text-end">{{ p.subtotal | brl }}</dd>
              <dt class="col-6 fw-normal text-body-secondary">Desconto</dt><dd class="col-6 text-end">−{{ p.desconto | brl }}</dd>
              <dt class="col-6 fw-normal text-body-secondary">Frete</dt><dd class="col-6 text-end">{{ p.frete | brl }}</dd>
              <dt class="col-6 fw-bold border-top pt-2">Total</dt><dd class="col-6 text-end fw-bold border-top pt-2">{{ p.total | brl }}</dd>
            </dl>
            <hr />
            <p class="mb-1"><small class="text-body-secondary">Condição</small><br>{{ p.condicao_pagamento || '—' }}</p>
            <p class="mb-0"><small class="text-body-secondary">Observações</small><br>{{ p.observacoes || '—' }}</p>
          </div></div>
        </div>
      </div>
    } @else {
      <div class="card"><div class="card-body text-center text-body-secondary py-5">{{ erro() || 'Carregando…' }}</div></div>
    }
  `,
  styles: `
    .steps { display: flex; list-style: none; padding: 0; gap: 0; counter-reset: s; }
    .step { flex: 1; text-align: center; font-size: .75rem; color: var(--hw-text-3); padding-top: 18px; position: relative; }
    .step::before { content: counter(s); counter-increment: s; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
      width: 16px; height: 16px; border-radius: 50%; background: var(--hw-surface-3); font-size: 0; }
    .step.feito { color: var(--hw-success); } .step.feito::before { background: var(--hw-success); }
    .step.atual { color: var(--hw-accent); font-weight: 700; } .step.atual::before { background: var(--hw-accent); box-shadow: 0 0 0 3px var(--hw-chip-info-bg); }
  `,
})
export class PedidoDetalhePage implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(PedidosService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  readonly pedido = signal<PedidoDetalhe | null>(null);
  readonly erro = signal<string | null>(null);
  readonly steps = STEPS;
  readonly transicoes = (s: string) => TRANSICOES[s] ?? [];
  readonly idx = (s: string) => Math.max(0, STEPS.indexOf(s));

  constructor() {
    // Transição feita por outro usuário (ou pelo próprio portal) revalida a tela.
    effect(() => {
      const e = this.rt.ultimo();
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (e && ['pedido.status_alterado', 'pagamento.baixado', 'pagamento.estornado'].includes(e.tipo)
          && Number(e.dados['id'] ?? e.dados['pedido_id']) === id) {
        this.carregar(id);
      }
    });
  }

  ngOnInit(): void {
    this.carregar(Number(this.route.snapshot.paramMap.get('id')));
  }

  private carregar(id: number): void {
    this.svc.detalhe(id).subscribe({
      next: (p) => this.pedido.set(p),
      error: () => this.erro.set('Pedido não encontrado.'),
    });
  }

  transicionar(p: PedidoDetalhe, status: string): void {
    this.svc.transicionar(p.id, status).subscribe({
      next: (novo) => { this.pedido.set({ ...p, ...novo }); this.toast.ok(`Pedido → ${status}`); },
      error: () => this.toast.erro('Transição recusada pelo backend.'),
    });
  }
}

/** Pedido manual (televendas) — POST /pedidos com origem=manual implícito no backend. */
@Component({
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  template: `
    <h1 class="h4 mb-3">Novo pedido manual</h1>
    <form [formGroup]="f" (ngSubmit)="criar()">
      <div class="card mb-3"><div class="card-body row g-2">
        <div class="col-md-4"><label class="form-label">Empresa</label>
          <select class="form-select" formControlName="empresa_id" (change)="aoTrocarEmpresa()">
            <option [ngValue]="null">—</option>
            @for (e of empresas(); track e.id) { <option [ngValue]="e.id">{{ e.nome_fantasia || e.razao_social }}</option> }
          </select></div>
        <div class="col-md-4"><label class="form-label">Contato</label>
          <select class="form-select" formControlName="contato_id">
            <option [ngValue]="null">—</option>
            @for (c of contatos(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select></div>
        <div class="col-md-4"><label class="form-label">Condição de pagamento</label>
          <input class="form-control" formControlName="condicao_pagamento" placeholder="ex.: faturado 30dd" /></div>
        <div class="col-md-6"><label class="form-label">End. faturamento (id)</label>
          <select class="form-select" formControlName="endereco_faturamento_id">
            @for (e of enderecos(); track e['id']) { <option [ngValue]="e['id']">{{ e['logradouro'] }} — {{ e['cidade'] }}/{{ e['uf'] }}</option> }
          </select></div>
        <div class="col-md-6"><label class="form-label">End. entrega (id)</label>
          <select class="form-select" formControlName="endereco_entrega_id">
            @for (e of enderecos(); track e['id']) { <option [ngValue]="e['id']">{{ e['logradouro'] }} — {{ e['cidade'] }}/{{ e['uf'] }}</option> }
          </select></div>
      </div></div>

      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span>Itens</span>
          <button class="btn btn-outline-primary btn-sm" type="button" (click)="addItem()">+ Item</button>
        </div>
        <div class="table-responsive">
          <table class="table mb-0 align-middle">
            <thead class="table-light"><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Desc.</th><th></th></tr></thead>
            <tbody formArrayName="itens">
              @for (g of itens.controls; track $index) {
                <tr [formGroupName]="$index">
                  <td>
                    <select class="form-select form-select-sm" (change)="aoEscolher($index, $event)" aria-label="Produto">
                      <option [value]="null">—</option>
                      @for (p of produtos(); track p.id) { <option [value]="p.id">{{ p.sku }} · {{ p.nome }}</option> }
                    </select>
                    <input type="hidden" formControlName="produto_id" />
                    <input type="hidden" formControlName="sku" />
                    <input type="hidden" formControlName="descricao" />
                  </td>
                  <td><input class="form-control form-control-sm" type="number" step="0.001" formControlName="quantidade" /></td>
                  <td><input class="form-control form-control-sm" type="number" step="0.01" formControlName="preco_unitario" /></td>
                  <td><input class="form-control form-control-sm" type="number" step="0.01" formControlName="desconto" /></td>
                  <td><button class="btn btn-sm btn-outline-danger" type="button" (click)="itens.removeAt($index)">×</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card mb-3"><div class="card-body">
        <label class="form-label">Observações</label>
        <textarea class="form-control" rows="2" formControlName="observacoes"></textarea>
      </div></div>

      <div class="d-flex gap-2">
        <button class="btn btn-primary" type="submit" [disabled]="f.invalid || itens.length === 0">Criar pedido</button>
        <a class="btn btn-outline-secondary" routerLink="/vendas/pedidos">Cancelar</a>
      </div>
    </form>
  `,
})
export class PedidoNovoPage implements OnInit {
  private svc = inject(PedidosService);
  private crm = inject(CrmService);
  private catalogo = inject(CatalogoService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly empresas = signal<import('../../core/models').Empresa[]>([]);
  readonly contatos = signal<import('../../core/models').Contato[]>([]);
  readonly enderecos = signal<Record<string, unknown>[]>([]);
  readonly produtos = signal<Produto[]>([]);

  readonly f = this.fb.group({
    empresa_id: [null as number | null, Validators.required],
    contato_id: [null as number | null, Validators.required],
    endereco_faturamento_id: [null as number | null, Validators.required],
    endereco_entrega_id: [null as number | null, Validators.required],
    condicao_pagamento: [''],
    observacoes: [''],
    itens: this.fb.array([] as ReturnType<FormBuilder['group']>[]),
  });
  get itens(): FormArray { return this.f.controls.itens; }

  ngOnInit(): void {
    this.crm.empresas({ por_pagina: 500, status: 'ativo' }).subscribe((p) => this.empresas.set(p.itens));
    this.catalogo.produtos({ por_pagina: 500, ativo: true }).subscribe((p) => this.produtos.set(p.itens));
    this.addItem();
  }

  aoTrocarEmpresa(): void {
    const id = this.f.value.empresa_id;
    if (!id) return;
    this.crm.contatos({ empresa_id: id }).subscribe((p) => this.contatos.set(p.itens));
    this.crm.enderecos(id).subscribe((p) => this.enderecos.set(p.itens));
  }

  addItem(): void {
    this.itens.push(this.fb.group({
      produto_id: [null as number | null, Validators.required],
      sku: ['', Validators.required], descricao: ['', Validators.required],
      quantidade: ['1', Validators.required], preco_unitario: ['0', Validators.required], desconto: ['0'],
    }));
  }

  aoEscolher(i: number, ev: Event): void {
    const id = Number((ev.target as HTMLSelectElement).value);
    const p = this.produtos().find((x) => x.id === id);
    if (p) this.itens.at(i).patchValue({ produto_id: p.id, sku: p.sku, descricao: p.nome, preco_unitario: p.preco_venda });
  }

  criar(): void {
    const v = this.f.getRawValue();
    this.svc.criarManual({
      empresa_id: v.empresa_id, contato_id: v.contato_id,
      endereco_faturamento_id: v.endereco_faturamento_id, endereco_entrega_id: v.endereco_entrega_id,
      condicao_pagamento: v.condicao_pagamento || null, observacoes: v.observacoes || null,
      itens: (v.itens as Record<string, unknown>[]).map((i) => ({ ...i })),
    }).subscribe({
      next: (p) => { this.toast.ok(`Pedido ${p.numero} criado.`); void this.router.navigate(['/vendas/pedidos', p.id]); },
      error: () => this.toast.erro('Falha ao criar pedido.'),
    });
  }
}
