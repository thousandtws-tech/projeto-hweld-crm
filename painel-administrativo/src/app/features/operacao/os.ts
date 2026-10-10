import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { OrdemServico, OsService, CatalogoService, CrmService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Produto } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

const TRANSICOES: Record<string, { para: string; rotulo: string; cor: string }[]> = {
  aberta: [
    { para: 'em_andamento', rotulo: 'Iniciar', cor: 'primary' },
    { para: 'aguardando_material', rotulo: 'Aguardar material', cor: 'secondary' },
    { para: 'cancelada', rotulo: 'Cancelar', cor: 'outline-danger' },
  ],
  em_andamento: [
    { para: 'aguardando_material', rotulo: 'Aguardar material', cor: 'secondary' },
    { para: 'concluida', rotulo: 'Concluir', cor: 'success' },
    { para: 'cancelada', rotulo: 'Cancelar', cor: 'outline-danger' },
  ],
  aguardando_material: [
    { para: 'em_andamento', rotulo: 'Retomar', cor: 'primary' },
    { para: 'cancelada', rotulo: 'Cancelar', cor: 'outline-danger' },
  ],
};

/** OS detalhe — transições + consumo de material (baixa de estoque atômica). */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, BrlPipe, StatusLabelPipe],
  template: `
    @if (os(); as o) {
      <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
        <h1 class="h4 mb-0">OS #{{ o.id }}</h1>
        <span class="chip chip-{{ o.status }}">{{ o.status | statusLabel }}</span>
        <span class="badge text-bg-{{ o.prioridade === 'urgente' ? 'danger' : o.prioridade === 'alta' ? 'warning' : 'secondary' }}">{{ o.prioridade }}</span>
        <div class="ms-auto d-flex gap-2">
          @for (t of transicoes(o.status); track t.para) {
            <button class="btn btn-{{ t.cor }} btn-sm" (click)="transicionar(o, t.para)">{{ t.rotulo }}</button>
          }
        </div>
      </div>

      <div class="row g-3">
        <div class="col-lg-7">
          <div class="card mb-3"><div class="card-body">
            <h2 class="h6">Detalhes</h2>
            <p class="mb-1"><small class="text-body-secondary">Empresa</small><br>{{ empresaNome(o.empresa_id) }}</p>
            <p class="mb-1"><small class="text-body-secondary">Descrição</small><br>{{ o.descricao || '—' }}</p>
            <p class="mb-1"><small class="text-body-secondary">Prevista</small><br>{{ o.prevista_em || '—' }}</p>
            <p class="mb-0"><small class="text-body-secondary">Mão de obra</small><br>{{ o.valor_mao_obra | brl }}</p>
          </div></div>
          <div class="card">
            <div class="card-header">Materiais consumidos (baixa de estoque)</div>
            <ul class="list-group list-group-flush">
              @for (m of o.materiais ?? []; track $index) {
                <li class="list-group-item d-flex justify-content-between">
                  <span>{{ nomeProduto(m.produto_id) }}</span><span class="hw-numeric">{{ m.quantidade }}</span>
                </li>
              } @empty { <li class="list-group-item text-body-secondary">Nenhum material.</li> }
            </ul>
          </div>
        </div>
        <div class="col-lg-5">
          @if (['aberta','em_andamento','aguardando_material'].includes(o.status)) {
            <div class="card"><div class="card-header">Consumir material</div>
              <form class="card-body row g-2" [formGroup]="fMat" (ngSubmit)="consumir(o)">
                <div class="col-12"><label class="form-label mb-1">Produto</label>
                  <select class="form-select" formControlName="produto_id">
                    @for (p of produtos(); track p.id) { <option [ngValue]="p.id">{{ p.sku }} · {{ p.nome }}</option> }
                  </select></div>
                <div class="col-12"><label class="form-label mb-1">Quantidade</label>
                  <input class="form-control" type="number" step="0.001" formControlName="quantidade" /></div>
                <div class="col-12"><button class="btn btn-primary" [disabled]="fMat.invalid">Consumir</button></div>
              </form></div>
          }
        </div>
      </div>
    } @else {
      <div class="card"><div class="card-body text-center text-body-secondary py-5">{{ erro() || 'Carregando…' }}</div></div>
    }
  `,
})
export class OsDetalhePage implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(OsService);
  private catalogo = inject(CatalogoService);
  private crm = inject(CrmService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private fb = inject(FormBuilder);

  readonly os = signal<OrdemServico | null>(null);
  readonly produtos = signal<Produto[]>([]);
  readonly empresas = signal<Map<number, string>>(new Map());
  readonly erro = signal<string | null>(null);
  readonly transicoes = (s: string) => TRANSICOES[s] ?? [];

  readonly fMat = this.fb.group({
    produto_id: [null as number | null, Validators.required],
    quantidade: ['1', Validators.required],
  });

  empresaNome = (id: number) => this.empresas().get(id) ?? `#${id}`;
  nomeProduto = (id: number) => this.produtos().find((p) => p.id === id)?.nome ?? `#${id}`;

  constructor() {
    // Transição/consumo feitos por outro técnico revalidam a OS aberta.
    effect(() => {
      const e = this.rt.ultimo();
      if (e && e.tipo.startsWith('os.') && Number(e.dados['id']) === Number(this.route.snapshot.paramMap.get('id'))) {
        this.carregarOs();
      }
    });
  }

  ngOnInit(): void {
    this.catalogo.produtos({ por_pagina: 500 }).subscribe((p) => this.produtos.set(p.itens));
    this.crm.empresas({ por_pagina: 500 }).subscribe((p) =>
      this.empresas.set(new Map(p.itens.map((e) => [e.id, e.nome_fantasia || e.razao_social]))));
    this.carregarOs();
  }

  private carregarOs(): void {
    this.svc.buscar(Number(this.route.snapshot.paramMap.get('id'))).subscribe({
      next: (o) => this.os.set(o), error: () => this.erro.set('OS não encontrada.'),
    });
  }

  transicionar(o: OrdemServico, status: string): void {
    this.svc.transicionar(o.id, status).subscribe({
      next: (novo) => { this.os.set(novo); this.toast.ok(`OS → ${status}`); },
      error: () => this.toast.erro('Transição recusada.'),
    });
  }

  consumir(o: OrdemServico): void {
    const v = this.fMat.getRawValue();
    this.svc.consumirMaterial(o.id, v.produto_id!, String(v.quantidade)).subscribe({
      next: (novo) => { this.os.set(novo); this.toast.ok('Material consumido.'); },
      error: () => this.toast.erro('Falha ao consumir material.'),
    });
  }
}
