import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { DatePipe } from '@angular/common';
import { EstoqueService, Movimentacao, CatalogoService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Produto, SaldoEstoque } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { QtyPipe } from '../../core/pipes';

/** Estoque: alertas de reposição + lançamento de movimentação + extrato. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, QtyPipe],
  template: `
    <h1 class="h4 mb-3">Estoque</h1>

    @if (baixos().length) {
      <div class="alert alert-warning d-flex align-items-center gap-2" role="alert">
        <strong>{{ baixos().length }}</strong> produto(s) abaixo do mínimo.
        <a class="alert-link" href="#abaixo" (click)="mostrarBaixos.set(!mostrarBaixos())">{{ mostrarBaixos() ? 'ocultar' : 'ver' }}</a>
      </div>
      @if (mostrarBaixos()) {
        <div class="card mb-3"><div class="table-responsive">
          <table class="table mb-0"><thead class="table-light"><tr><th>Produto</th><th class="text-end">Saldo</th></tr></thead>
            <tbody>@for (s of baixos(); track s.produto_id) {
              <tr><td>{{ nomeProduto(s.produto_id) }}</td><td class="text-end hw-numeric">{{ s.saldo | qty }}</td></tr>
            }</tbody>
          </table>
        </div></div>
      }
    }

    <div class="card mb-3">
      <div class="card-header">Lançar movimentação</div>
      <form class="card-body row g-2 align-items-end" [formGroup]="f" (ngSubmit)="lancar()">
        <div class="col-md-4"><label class="form-label mb-1">Produto</label>
          <select class="form-select" formControlName="produto_id">
            @for (p of produtos(); track p.id) { <option [ngValue]="p.id">{{ p.sku }} · {{ p.nome }}</option> }
          </select></div>
        <div class="col-md-2"><label class="form-label mb-1">Tipo</label>
          <select class="form-select" formControlName="tipo">
            <option value="entrada">Entrada</option><option value="saida">Saída</option>
            <option value="ajuste">Ajuste</option><option value="reserva">Reserva</option>
            <option value="liberacao_reserva">Liberação de reserva</option>
          </select></div>
        <div class="col-md-2"><label class="form-label mb-1">Quantidade</label>
          <input class="form-control" type="number" step="0.001" min="0.001" formControlName="quantidade" /></div>
        <div class="col-md-4"><label class="form-label mb-1">Motivo</label>
          <input class="form-control" formControlName="motivo" /></div>
        <div class="col-12 text-end"><button class="btn btn-primary" [disabled]="f.invalid">Lançar</button></div>
      </form>
    </div>

    <div class="card">
      <div class="card-header">Extrato (append-only — correção é novo lançamento)</div>
      <div class="table-responsive">
        <table class="table mb-0 align-middle">
          <thead class="table-light"><tr><th>Quando</th><th>Produto</th><th>Tipo</th><th class="text-end">Qtd</th><th>Motivo</th></tr></thead>
          <tbody>
            @for (m of movimentacoes(); track m.id) {
              <tr>
                <td><small>{{ m.created_at | date:'dd/MM HH:mm' }}</small></td>
                <td>{{ nomeProduto(m.produto_id) }}</td>
                <td><span class="badge text-bg-{{ m.tipo === 'entrada' ? 'success' : m.tipo === 'saida' ? 'danger' : 'secondary' }}">{{ m.tipo }}</span></td>
                <td class="text-end hw-numeric">{{ m.quantidade | qty }}</td>
                <td>{{ m.motivo || '—' }}</td>
              </tr>
            } @empty { <tr><td colspan="5" class="text-center text-body-secondary py-4">Sem movimentações.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class EstoquePage implements OnInit {
  private svc = inject(EstoqueService);
  private catalogo = inject(CatalogoService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private fb = inject(FormBuilder);

  /* Reserva/saída de pedido e baixa por OS também movem estoque — extrato
   * e alertas revalidam quando qualquer origem movimenta. */
  private static readonly EVENTOS = [
    'estoque.movimentado',
    'pedido.status_alterado',
    'os.criada',
    'os.status_alterada',
  ];

  readonly baixos = signal<SaldoEstoque[]>([]);
  readonly movimentacoes = signal<Movimentacao[]>([]);
  readonly produtos = signal<Produto[]>([]);
  readonly mostrarBaixos = signal(true);

  readonly f = this.fb.group({
    produto_id: [null as number | null, Validators.required],
    tipo: ['entrada', Validators.required],
    quantidade: ['1', Validators.required],
    motivo: [''],
  });

  nomeProduto(id: number): string { return this.produtos().find((p) => p.id === id)?.nome ?? `#${id}`; }

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e && EstoquePage.EVENTOS.includes(e.tipo)) {
        this.carregarMovs();
        this.svc.abaixoDoMinimo().subscribe((p) => this.baixos.set(p.itens));
      }
    });
  }

  ngOnInit(): void {
    this.catalogo.produtos({ por_pagina: 500 }).subscribe((p) => this.produtos.set(p.itens));
    this.svc.abaixoDoMinimo().subscribe((p) => this.baixos.set(p.itens));
    this.carregarMovs();
  }

  carregarMovs(): void {
    this.svc.movimentacoes({ por_pagina: 50 }).subscribe((p) => this.movimentacoes.set(p.itens));
  }

  lancar(): void {
    const v = this.f.getRawValue();
    this.svc.lancar({ produto_id: v.produto_id!, tipo: v.tipo!, quantidade: String(v.quantidade), motivo: v.motivo || undefined }).subscribe({
      next: () => { this.carregarMovs(); this.svc.abaixoDoMinimo().subscribe((p) => this.baixos.set(p.itens)); this.toast.ok('Lançamento registrado.'); },
      error: () => this.toast.erro('Falha ao lançar.'),
    });
  }
}
