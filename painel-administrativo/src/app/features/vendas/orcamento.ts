import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ItemOrcamento, Orcamento, OrcamentosService, CatalogoService, CrmService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Produto } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

/** Máquina de status do orçamento (domínio `crm/orcamento.rs`). */
const TRANSICOES: Record<string, { para: string; rotulo: string; cor: string }[]> = {
  rascunho: [{ para: 'enviado', rotulo: 'Enviar ao cliente', cor: 'primary' }],
  enviado: [
    { para: 'em_analise', rotulo: 'Marcar em análise', cor: 'secondary' },
    { para: 'expirado', rotulo: 'Expirar', cor: 'outline-danger' },
  ],
  em_analise: [
    { para: 'aprovado', rotulo: 'Aprovar', cor: 'success' },
    { para: 'recusado', rotulo: 'Recusar', cor: 'danger' },
    { para: 'expirado', rotulo: 'Expirar', cor: 'outline-danger' },
  ],
  aprovado: [{ para: 'expirado', rotulo: 'Expirar', cor: 'outline-danger' }],
};

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, BrlPipe, StatusLabelPipe],
  template: `
    @if (orc(); as o) {
      <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
        <h1 class="h4 mb-0">Orçamento #{{ o.id }}</h1>
        <span class="chip chip-{{ o.status }}">{{ o.status | statusLabel }}</span>
        <small class="text-body-secondary">{{ empresaNome(o.empresa_id) }} · válido até {{ o.valido_ate || '—' }}</small>
        <div class="ms-auto d-flex gap-2">
          @for (t of transicoes(o.status); track t.para) {
            <button class="btn btn-{{ t.cor }} btn-sm" (click)="transicionar(o, t.para)">{{ t.rotulo }}</button>
          }
          @if (o.status === 'aprovado') {
            <button class="btn btn-success btn-sm" (click)="converter(o)">Converter em pedido</button>
          }
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span>Itens</span>
          @if (o.status === 'rascunho') {
            <button class="btn btn-outline-primary btn-sm" (click)="addItem()">+ Item</button>
          }
        </div>
        <form [formGroup]="fItens">
          <div class="table-responsive">
            <table class="table mb-0 align-middle">
              <thead class="table-light"><tr>
                <th style="min-width:220px">Produto</th><th>Qtd</th><th>Preço unit.</th>
                <th>Desc.</th><th class="text-end">Total</th><th></th>
              </tr></thead>
              <tbody formArrayName="itens">
                @for (g of itens.controls; track $index) {
                  <tr [formGroupName]="$index">
                    <td>
                      @if (o.status === 'rascunho') {
                        <select class="form-select form-select-sm" [value]="$any($any(itens.at($index)).value.produto_id)"
                                (change)="aoEscolherProduto($index, $event)" aria-label="Produto">
                          <option [value]="null">—</option>
                          @for (p of produtos(); track p.id) { <option [value]="p.id">{{ p.sku }} · {{ p.nome }}</option> }
                        </select>
                        <input class="form-control form-control-sm mt-1" formControlName="descricao" placeholder="Descrição" />
                      } @else {
                        {{ $any($any(itens.at($index)).value.descricao) }}
                      }
                    </td>
                    <td><input class="form-control form-control-sm" type="number" step="0.001" min="0.001"
                               formControlName="quantidade" /></td>
                    <td><input class="form-control form-control-sm" type="number" step="0.01" min="0"
                               formControlName="preco_unitario" /></td>
                    <td><input class="form-control form-control-sm" type="number" step="0.01" min="0"
                               formControlName="desconto" /></td>
                    <td class="text-end hw-numeric">{{ totalItem($index) | brl }}</td>
                    <td>
                      @if (o.status === 'rascunho') {
                        <button class="btn btn-sm btn-outline-danger" type="button" (click)="itens.removeAt($index)">×</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card-body row g-2 align-items-end">
            <div class="col-auto"><label class="form-label mb-1">Desconto</label>
              <input class="form-control form-control-sm" type="number" step="0.01" formControlName="desconto" /></div>
            <div class="col-auto"><label class="form-label mb-1">Frete</label>
              <input class="form-control form-control-sm" type="number" step="0.01" formControlName="frete" /></div>
            <div class="col-auto ms-auto">
              <div class="fs-5 fw-bold hw-numeric">Total: {{ totalGeral() | brl }}</div>
            </div>
          </div>
          @if (o.status === 'rascunho') {
            <div class="card-footer text-end">
              <button class="btn btn-primary btn-sm" type="button" (click)="salvar(o)">Salvar itens</button>
            </div>
          }
        </form>
      </div>
    } @else {
      <div class="card"><div class="card-body text-center text-body-secondary py-5">{{ erro() || 'Carregando…' }}</div></div>
    }
  `,
})
export class OrcamentoPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private svc = inject(OrcamentosService);
  private crm = inject(CrmService);
  private catalogo = inject(CatalogoService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private fb = inject(FormBuilder);

  readonly orc = signal<Orcamento | null>(null);
  readonly erro = signal<string | null>(null);
  readonly empresas = signal<Map<number, string>>(new Map());
  readonly produtos = signal<Produto[]>([]);

  readonly fItens = this.fb.group({
    desconto: ['0', Validators.required],
    frete: ['0', Validators.required],
    itens: this.fb.array([] as ReturnType<FormBuilder['group']>[]),
  });
  get itens(): FormArray { return this.fItens.controls.itens; }

  transicoes = (status: string) => TRANSICOES[status] ?? [];
  empresaNome = (id: number) => this.empresas().get(id) ?? `#${id}`;

  constructor() {
    // Outra sessão alterou o orçamento → revalida. Form "dirty" preserva a edição local.
    effect(() => {
      const e = this.rt.ultimo();
      if (e && e.tipo.startsWith('orcamento.') && Number(e.dados['id']) === Number(this.route.snapshot.paramMap.get('id'))) {
        this.carregar();
      }
    });
  }

  ngOnInit(): void {
    this.crm.empresas({ por_pagina: 500 }).subscribe((p) =>
      this.empresas.set(new Map(p.itens.map((e) => [e.id, e.nome_fantasia || e.razao_social]))));
    this.catalogo.produtos({ por_pagina: 500, ativo: true }).subscribe((p) => this.produtos.set(p.itens));
    this.carregar();
  }

  private carregar(): void {
    this.svc.buscar(Number(this.route.snapshot.paramMap.get('id'))).subscribe({
      next: (o) => { this.orc.set(o); if (!this.fItens.dirty) this.preencher(o); },
      error: () => this.erro.set('Orçamento não encontrado.'),
    });
  }

  private preencher(o: Orcamento): void {
    this.fItens.patchValue({ desconto: o.desconto, frete: o.frete });
    this.itens.clear();
    for (const i of o.itens) {
      this.itens.push(this.fb.group({
        produto_id: [i.produto_id, Validators.required],
        descricao: [i.descricao, Validators.required],
        quantidade: [i.quantidade, Validators.required],
        preco_unitario: [i.preco_unitario, Validators.required],
        desconto: [i.desconto, Validators.required],
      }));
    }
  }

  addItem(): void {
    this.itens.push(this.fb.group({
      produto_id: [null as number | null, Validators.required],
      descricao: ['', Validators.required],
      quantidade: ['1', Validators.required],
      preco_unitario: ['0', Validators.required],
      desconto: ['0', Validators.required],
    }));
  }

  aoEscolherProduto(i: number, ev: Event): void {
    const id = Number((ev.target as HTMLSelectElement).value);
    const p = this.produtos().find((x) => x.id === id);
    if (p) this.itens.at(i).patchValue({ produto_id: p.id, descricao: p.nome, preco_unitario: p.preco_venda });
  }

  totalItem(i: number): string {
    const g = this.itens.at(i);
    const v = g.value as { quantidade: string; preco_unitario: string; desconto: string };
    const t = Number(v.preco_unitario) * Number(v.quantidade) - Number(v.desconto);
    return Math.max(0, t).toFixed(2);
  }
  totalGeral(): string {
    const soma = this.itens.controls.reduce((acc, _, i) => acc + Number(this.totalItem(i)), 0);
    const v = this.fItens.value as { desconto: string; frete: string };
    return Math.max(0, soma - Number(v.desconto) + Number(v.frete)).toFixed(2);
  }

  salvar(o: Orcamento): void {
    const v = this.fItens.getRawValue();
    this.svc.salvarItens(o.id, {
      itens: (v.itens as ItemOrcamento[]).map((i) => ({
        ...i, quantidade: String(i.quantidade), preco_unitario: String(i.preco_unitario), desconto: String(i.desconto),
      })),
      desconto: v.desconto, frete: v.frete,
    }).subscribe({
      next: (novo) => { this.orc.set(novo); this.toast.ok('Itens salvos.'); },
      error: () => this.toast.erro('Falha ao salvar itens.'),
    });
  }

  transicionar(o: Orcamento, status: string): void {
    this.svc.transicionar(o.id, status).subscribe({
      next: (novo) => { this.orc.set(novo); this.toast.ok(`Status: ${status}`); },
      error: () => this.toast.erro('Transição recusada pelo backend.'),
    });
  }

  converter(o: Orcamento): void {
    this.svc.converter(o.id).subscribe({
      next: (pedido) => { this.toast.ok(`Pedido ${pedido.numero} criado.`); void this.router.navigate(['/vendas/pedidos', pedido.id]); },
      error: () => this.toast.erro('Falha na conversão.'),
    });
  }
}
