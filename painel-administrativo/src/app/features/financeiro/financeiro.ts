import { Component, OnInit, TemplateRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FinanceiroService, Pagamento } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Caixa } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';
import { DatePipe } from '@angular/common';

/** Prefixo de evento que afeta a grade de parcelas. */
const EV_PAGAMENTO = ['pagamento.parcelas', 'pagamento.baixado', 'pagamento.estornado'];
/** Eventos que movem o caixa — baixa/estorno de parcela lança recebimento/estorno. */
const EV_CAIXA = [...EV_PAGAMENTO, 'caixa.aberto', 'caixa.movimento', 'caixa.fechado'];

interface MovCaixa { id: number; tipo: string; valor: string; descricao: string | null; created_at: string }

/** Pagamentos: parcelas, baixa, estorno. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, BrlPipe, StatusLabelPipe],
  template: `
    <div class="d-flex align-items-center mb-3">
      <h1 class="h4 mb-0">Pagamentos</h1>
      <button class="btn btn-primary btn-sm ms-auto" (click)="abrirParcelas()">Gerar parcelas</button>
    </div>

    <div class="card"><div class="table-responsive">
      <table class="table mb-0 align-middle">
        <thead class="table-light"><tr>
          <th>Pedido</th><th>Parcela</th><th class="text-end">Valor</th><th>Venc.</th><th>Status</th><th class="text-end">Ações</th>
        </tr></thead>
        <tbody>
          @for (p of pagamentos(); track p.id) {
            <tr>
              <td>#{{ p.pedido_id }}</td><td>{{ p.parcela }}</td>
              <td class="text-end hw-numeric">{{ p.valor | brl }}</td>
              <td>{{ p.vencimento | date:'dd/MM/yyyy' }}</td>
              <td><span class="chip chip-{{ p.status }}">{{ p.status | statusLabel }}</span></td>
              <td class="text-end">
                @if (p.status === 'pendente' || p.status === 'vencido') {
                  <button class="btn btn-sm btn-success" (click)="abrirBaixa(p)">Baixar</button>
                }
                @if (p.status === 'pago') {
                  <button class="btn btn-sm btn-outline-danger" (click)="abrirEstorno(p)">Estornar</button>
                }
              </td>
            </tr>
          } @empty { <tr><td colspan="6" class="text-center text-body-secondary py-4">Nenhum pagamento.</td></tr> }
        </tbody>
      </table>
    </div></div>

    <ng-template #mParcelas let-m>
      <div class="modal-header"><h5 class="modal-title">Gerar parcelas</h5><button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fParc" (ngSubmit)="gerar(m)">
        <div class="modal-body row g-2">
          <div class="col-md-6"><label class="form-label">Pedido (id)</label><input class="form-control" type="number" formControlName="pedido_id" /></div>
          <div class="col-md-6"><label class="form-label">Nº parcelas</label><input class="form-control" type="number" min="1" formControlName="quantidade" /></div>
          <div class="col-md-6"><label class="form-label">1º vencimento</label><input class="form-control" type="date" formControlName="primeiro_vencimento" /></div>
          <div class="col-md-6"><label class="form-label">Intervalo (dias)</label><input class="form-control" type="number" formControlName="intervalo_dias" placeholder="30" /></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" [disabled]="fParc.invalid">Gerar</button></div>
      </form>
    </ng-template>

    <ng-template #mBaixa let-m>
      <div class="modal-header"><h5 class="modal-title">Baixar parcela</h5><button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fBaixa" (ngSubmit)="baixar(m)">
        <div class="modal-body row g-2">
          <div class="col-12"><label class="form-label">Forma de pagamento (id)</label>
            <input class="form-control" type="number" formControlName="forma_pagamento_id" /></div>
          <div class="col-12"><label class="form-label">Observação</label>
            <input class="form-control" formControlName="observacao" /></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" [disabled]="fBaixa.invalid">Baixar</button></div>
      </form>
    </ng-template>

    <ng-template #mEstorno let-m>
      <div class="modal-header"><h5 class="modal-title">Estornar pagamento</h5><button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fEstorno" (ngSubmit)="estornar(m)">
        <div class="modal-body">
          <label class="form-label">Motivo (obrigatório)</label>
          <input class="form-control" formControlName="motivo" />
        </div>
        <div class="modal-footer"><button class="btn btn-danger" [disabled]="fEstorno.invalid">Estornar</button></div>
      </form>
    </ng-template>
  `,
})
export class PagamentosPage implements OnInit {
  private svc = inject(FinanceiroService);
  private modal = inject(NgbModal);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private fb = inject(FormBuilder);

  readonly pagamentos = signal<Pagamento[]>([]);
  private alvo = signal<Pagamento | null>(null);
  private readonly mParcelas = viewChild<TemplateRef<unknown>>('mParcelas');
  private readonly mBaixa = viewChild<TemplateRef<unknown>>('mBaixa');
  private readonly mEstorno = viewChild<TemplateRef<unknown>>('mEstorno');

  readonly fParc = this.fb.group({
    pedido_id: [null as number | null, Validators.required],
    quantidade: [1, [Validators.required, Validators.min(1)]],
    primeiro_vencimento: ['', Validators.required],
    intervalo_dias: [30],
  });
  readonly fBaixa = this.fb.group({
    forma_pagamento_id: [null as number | null, Validators.required],
    observacao: [''],
  });
  readonly fEstorno = this.fb.group({ motivo: ['', Validators.required] });

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e && EV_PAGAMENTO.includes(e.tipo)) this.carregar();
    });
  }

  ngOnInit(): void { this.carregar(); }
  carregar(): void { this.svc.pagamentos({ por_pagina: 50 }).subscribe((p) => this.pagamentos.set(p.itens)); }

  abrirParcelas(): void { const t = this.mParcelas(); if (t) this.modal.open(t); }
  abrirBaixa(p: Pagamento): void { this.alvo.set(p); const t = this.mBaixa(); if (t) this.modal.open(t); }
  abrirEstorno(p: Pagamento): void { this.alvo.set(p); const t = this.mEstorno(); if (t) this.modal.open(t); }

  gerar(m: { close(): void }): void {
    const v = this.fParc.getRawValue();
    this.svc.gerarParcelas({
      pedido_id: v.pedido_id!, quantidade: v.quantidade!,
      primeiro_vencimento: v.primeiro_vencimento!, intervalo_dias: v.intervalo_dias ?? undefined,
    }).subscribe({
      next: () => { this.carregar(); m.close(); this.toast.ok('Parcelas geradas.'); },
      error: () => this.toast.erro('Falha ao gerar parcelas.'),
    });
  }

  baixar(m: { close(): void }): void {
    const v = this.fBaixa.getRawValue();
    this.svc.baixar(this.alvo()!.id, v.forma_pagamento_id!, v.observacao || undefined).subscribe({
      next: () => { this.carregar(); m.close(); this.toast.ok('Pagamento baixado.'); },
      error: () => this.toast.erro('Falha na baixa.'),
    });
  }

  estornar(m: { close(): void }): void {
    this.svc.estornar(this.alvo()!.id, this.fEstorno.value.motivo!).subscribe({
      next: () => { this.carregar(); m.close(); this.toast.ok('Estornado.'); },
      error: () => this.toast.erro('Falha no estorno.'),
    });
  }
}

/** Caixa: abrir, lançar (suprimento/sangria/despesa), fechar com conferência. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, BrlPipe],
  template: `
    <h1 class="h4 mb-3">Caixa</h1>

    @if (caixa(); as c) {
      <div class="alert alert-success d-flex align-items-center justify-content-between">
        <span>Caixa <strong>aberto</strong> desde {{ c.aberto_em | date:'dd/MM HH:mm' }} · abertura {{ c.valor_abertura | brl }}</span>
        <button class="btn btn-sm btn-outline-dark" (click)="abrirFechamento()">Fechar caixa</button>
      </div>

      <div class="card mb-3"><div class="card-header">Lançar movimentação</div>
        <form class="card-body row g-2 align-items-end" [formGroup]="fLanc" (ngSubmit)="lancar()">
          <div class="col-md-3"><label class="form-label mb-1">Tipo</label>
            <select class="form-select" formControlName="tipo">
              <option value="suprimento">Suprimento</option><option value="sangria">Sangria</option>
              <option value="recebimento">Recebimento</option><option value="despesa">Despesa</option>
              <option value="estorno">Estorno</option>
            </select></div>
          <div class="col-md-3"><label class="form-label mb-1">Valor</label>
            <input class="form-control" type="number" step="0.01" min="0.01" formControlName="valor" /></div>
          <div class="col-md-6"><label class="form-label mb-1">Descrição</label>
            <input class="form-control" formControlName="descricao" /></div>
          <div class="col-12 text-end"><button class="btn btn-primary" [disabled]="fLanc.invalid">Lançar</button></div>
        </form></div>

      <div class="card"><div class="card-header">Movimentações</div>
        <div class="table-responsive">
          <table class="table mb-0"><thead class="table-light"><tr><th>Quando</th><th>Tipo</th><th class="text-end">Valor</th><th>Descrição</th></tr></thead>
            <tbody>
              @for (m of movs(); track m.id) {
                <tr><td>{{ m.created_at | date:'dd/MM HH:mm' }}</td><td>{{ m.tipo }}</td>
                    <td class="text-end hw-numeric">{{ m.valor | brl }}</td><td>{{ m.descricao || '—' }}</td></tr>
              } @empty { <tr><td colspan="4" class="text-center text-body-secondary py-4">Sem movimentações.</td></tr> }
            </tbody>
          </table>
        </div></div>
    } @else if (!carregando()) {
      <div class="card"><div class="card-body text-center py-5">
        <p class="text-body-secondary">Nenhum caixa aberto.</p>
        <form class="d-flex gap-2 justify-content-center" [formGroup]="fAbrir" (ngSubmit)="abrirCaixa()">
          <input class="form-control w-auto" type="number" step="0.01" min="0" formControlName="valor_abertura" placeholder="Valor de abertura" />
          <button class="btn btn-primary" [disabled]="fAbrir.invalid">Abrir caixa</button>
        </form>
      </div></div>
    }

    <ng-template #mFechar let-m>
      <div class="modal-header"><h5 class="modal-title">Fechar caixa</h5><button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fFechar" (ngSubmit)="fechar(m)">
        <div class="modal-body">
          <label class="form-label">Valor informado (conferência)</label>
          <input class="form-control" type="number" step="0.01" formControlName="valor_informado" />
          <small class="text-body-secondary">Se divergir do calculado, o fechamento fica com divergência registrada.</small>
        </div>
        <div class="modal-footer"><button class="btn btn-danger" [disabled]="fFechar.invalid">Fechar</button></div>
      </form>
    </ng-template>
  `,
})
export class CaixaPage implements OnInit {
  private svc = inject(FinanceiroService);
  private modal = inject(NgbModal);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private fb = inject(FormBuilder);

  readonly caixa = signal<Caixa | null>(null);
  readonly movs = signal<MovCaixa[]>([]);
  readonly carregando = signal(true);
  private readonly mFechar = viewChild<TemplateRef<unknown>>('mFechar');

  readonly fAbrir = this.fb.group({ valor_abertura: ['0', Validators.required] });
  readonly fLanc = this.fb.group({
    tipo: ['suprimento', Validators.required], valor: ['', Validators.required], descricao: [''],
  });
  readonly fFechar = this.fb.group({ valor_informado: ['', Validators.required] });

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e && EV_CAIXA.includes(e.tipo)) this.carregar();
    });
  }

  ngOnInit(): void { this.carregar(); }
  carregar(): void {
    this.svc.caixaAberto().subscribe({
      next: (c) => { this.caixa.set(c); this.carregando.set(false); if (c) this.movsDe(c.id); },
      error: () => { this.caixa.set(null); this.carregando.set(false); },
    });
  }
  movsDe(id: number): void {
    this.svc.movimentacoesCaixa(id).subscribe((p) => this.movs.set(p.itens as unknown as MovCaixa[]));
  }

  abrirCaixa(): void {
    this.svc.abrir(String(this.fAbrir.value.valor_abertura)).subscribe({
      next: (c) => { this.caixa.set(c); this.toast.ok('Caixa aberto.'); },
      error: () => this.toast.erro('Falha ao abrir — já existe caixa aberto?'),
    });
  }
  lancar(): void {
    const v = this.fLanc.getRawValue();
    this.svc.lancar({ tipo: v.tipo!, valor: String(v.valor), descricao: v.descricao || undefined }).subscribe({
      next: () => { if (this.caixa()) this.movsDe(this.caixa()!.id); this.toast.ok('Lançado.'); },
      error: () => this.toast.erro('Falha ao lançar.'),
    });
  }
  abrirFechamento(): void { const t = this.mFechar(); if (t) this.modal.open(t); }
  fechar(m: { close(): void }): void {
    this.svc.fechar(String(this.fFechar.value.valor_informado)).subscribe({
      next: () => { this.caixa.set(null); m.close(); this.toast.ok('Caixa fechado.'); },
      error: () => this.toast.erro('Falha ao fechar.'),
    });
  }
}
