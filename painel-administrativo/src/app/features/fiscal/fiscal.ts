import { Component, OnInit, TemplateRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FiscalService, NotaFiscal } from '../../core/servicos';
import { ToastService } from '../../shared/ui/toast';
import { StatusLabelPipe } from '../../core/pipes';

/** Notas fiscais — emitir (por pedido), autorizar (stub SEFAZ), cancelar com motivo. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, StatusLabelPipe],
  template: `
    <div class="d-flex align-items-center mb-3">
      <h1 class="h4 mb-0">Notas fiscais</h1>
      <button class="btn btn-primary btn-sm ms-auto" (click)="modal.open(mEmitir)">Emitir NF</button>
    </div>

    <div class="card"><div class="table-responsive">
      <table class="table mb-0 align-middle">
        <thead class="table-light"><tr><th>#</th><th>Pedido</th><th>Número</th><th>Status</th><th>Chave</th><th class="text-end">Ações</th></tr></thead>
        <tbody>
          @for (n of notas(); track n.id) {
            <tr>
              <td>{{ n.id }}</td><td>#{{ n.pedido_id }}</td><td>{{ n.numero || '—' }}</td>
              <td><span class="chip chip-{{ n.status }}">{{ n.status | statusLabel }}</span></td>
              <td><small class="text-body-secondary">{{ (n.chave || '—').slice(0, 24) }}</small></td>
              <td class="text-end">
                @if (n.status === 'rascunho' || n.status === 'rejeitada') {
                  <button class="btn btn-sm btn-success" (click)="autorizar(n)">Autorizar</button>
                }
                @if (n.status === 'autorizada' || n.status === 'rascunho') {
                  <button class="btn btn-sm btn-outline-danger" (click)="abrirCancelar(n)">Cancelar</button>
                }
              </td>
            </tr>
          } @empty { <tr><td colspan="6" class="text-center text-body-secondary py-4">Nenhuma NF.</td></tr> }
        </tbody>
      </table>
    </div></div>

    <ng-template #mEmitir let-m>
      <div class="modal-header"><h5 class="modal-title">Emitir NF</h5><button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fEmitir" (ngSubmit)="emitir(m)">
        <div class="modal-body">
          <label class="form-label">Pedido (id)</label>
          <input class="form-control" type="number" formControlName="pedido_id" />
          <small class="text-body-secondary">A NF nasce em rascunho; autorização usa o gateway fiscal (stub em dev).</small>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" [disabled]="fEmitir.invalid">Emitir</button></div>
      </form>
    </ng-template>

    <ng-template #mCancelar let-m>
      <div class="modal-header"><h5 class="modal-title">Cancelar NF #{{ alvo()?.id }}</h5><button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fCancelar" (ngSubmit)="cancelar(m)">
        <div class="modal-body">
          <label class="form-label">Motivo (obrigatório)</label>
          <input class="form-control" formControlName="motivo" />
        </div>
        <div class="modal-footer"><button class="btn btn-danger" [disabled]="fCancelar.invalid">Cancelar NF</button></div>
      </form>
    </ng-template>
  `,
})
export class FiscalPage implements OnInit {
  private svc = inject(FiscalService);
  private modal = inject(NgbModal);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly notas = signal<NotaFiscal[]>([]);
  readonly alvo = signal<NotaFiscal | null>(null);
  private readonly mCancelar = viewChild<TemplateRef<unknown>>('mCancelar');

  readonly fEmitir = this.fb.group({ pedido_id: [null as number | null, Validators.required] });
  readonly fCancelar = this.fb.group({ motivo: ['', Validators.required] });

  ngOnInit(): void { this.carregar(); }
  carregar(): void { this.svc.listar({ por_pagina: 50 }).subscribe((p) => this.notas.set(p.itens)); }

  emitir(m: { close(): void }): void {
    this.svc.emitir(this.fEmitir.value.pedido_id!).subscribe({
      next: () => { this.carregar(); m.close(); this.toast.ok('NF emitida.'); },
      error: () => this.toast.erro('Falha ao emitir — pedido precisa estar faturado.'),
    });
  }

  abrirCancelar(n: NotaFiscal): void {
    this.alvo.set(n);
    const tpl = this.mCancelar();
    if (tpl) this.modal.open(tpl);
  }

  autorizar(n: NotaFiscal): void {
    this.svc.autorizar(n.id).subscribe({
      next: () => { this.carregar(); this.toast.ok('Autorização solicitada.'); },
      error: () => this.toast.erro('Falha ao autorizar.'),
    });
  }

  cancelar(m: { close(): void }): void {
    this.svc.cancelar(this.alvo()!.id, this.fCancelar.value.motivo!).subscribe({
      next: () => { this.carregar(); m.close(); this.toast.ok('NF cancelada.'); },
      error: () => this.toast.erro('Falha ao cancelar.'),
    });
  }
}
