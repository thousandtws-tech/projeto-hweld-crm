import { Component, OnInit, TemplateRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { CrmService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { EstagioOportunidade, Oportunidade } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

const ESTAGIOS: EstagioOportunidade[] = ['lead', 'qualificacao', 'proposta', 'negociacao', 'ganha', 'perdida'];

/** Kanban do funil — arrastar entre colunas chama PATCH /oportunidades/{id}/estagio. */
@Component({
  standalone: true,
  imports: [DragDropModule, ReactiveFormsModule, NgbModalModule, BrlPipe, StatusLabelPipe],
  template: `
    <div class="d-flex align-items-center gap-3 mb-3">
      <h1 class="h4 mb-0">Pipeline</h1>
      <button class="btn btn-primary btn-sm ms-auto" (click)="modal.open(mNovo, { size: 'lg' })">+ Oportunidade</button>
    </div>

    <div class="kanban" cdkDropListGroup>
      @for (est of estagiosAbertos; track est) {
        <section class="coluna">
          <header class="coluna-titulo">
            <span class="chip chip-{{ est }}">{{ est | statusLabel }}</span>
            <span class="badge text-bg-secondary">{{ itens(est).length }}</span>
          </header>
          <div class="lista" cdkDropList [cdkDropListData]="est" (cdkDropListDropped)="soltar($event)">
            @for (o of itens(est); track o.id) {
              <article class="cartao" cdkDrag [cdkDragData]="o">
                <div class="cartao-titulo">{{ o.titulo }}</div>
                <small class="text-body-secondary">{{ empresaNome(o.empresa_id) }}</small>
                <div class="d-flex justify-content-between mt-1">
                  <span class="valor">{{ o.valor_estimado | brl }}</span>
                  <small class="text-body-secondary">{{ o.data_prevista_fechamento || '' }}</small>
                </div>
              </article>
            }
          </div>
        </section>
      }
    </div>

    <ng-template #mNovo let-m>
      <div class="modal-header"><h5 class="modal-title">Nova oportunidade</h5>
        <button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fNovo" (ngSubmit)="criar(m)">
        <div class="modal-body row g-2">
          <div class="col-12"><label class="form-label">Título</label>
            <input class="form-control" formControlName="titulo" /></div>
          <div class="col-md-6"><label class="form-label">Empresa (id)</label>
            <input class="form-control" type="number" formControlName="empresa_id" /></div>
          <div class="col-md-6"><label class="form-label">Valor estimado</label>
            <input class="form-control" type="number" step="0.01" formControlName="valor_estimado" /></div>
          <div class="col-md-6"><label class="form-label">Origem</label>
            <select class="form-select" formControlName="origem">
              <option value="">—</option>
              <option value="site">Site</option><option value="telefone">Telefone</option>
              <option value="indicacao">Indicação</option><option value="prospeccao">Prospecção</option>
              <option value="ecommerce">E-commerce</option><option value="outro">Outro</option>
            </select></div>
          <div class="col-md-6"><label class="form-label">Previsão de fechamento</label>
            <input class="form-control" type="date" formControlName="data_prevista_fechamento" /></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" type="submit" [disabled]="fNovo.invalid">Criar</button></div>
      </form>
    </ng-template>

    <ng-template #mPerda let-m>
      <div class="modal-header"><h5 class="modal-title">Motivo da perda</h5>
        <button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="fPerda" (ngSubmit)="confirmarPerda(m)">
        <div class="modal-body">
          <label class="form-label">Motivo (obrigatório)</label>
          <input class="form-control" formControlName="motivo_perda" />
        </div>
        <div class="modal-footer"><button class="btn btn-danger" type="submit" [disabled]="fPerda.invalid">Marcar como perdida</button></div>
      </form>
    </ng-template>
  `,
  styles: `
    .kanban { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr);
      gap: var(--hw-space-3); overflow-x: auto; padding-bottom: var(--hw-space-3); }
    .coluna { background: var(--hw-surface-2); border-radius: var(--hw-radius-md); padding: var(--hw-space-2); }
    .coluna-titulo { display: flex; justify-content: space-between; align-items: center;
      padding: var(--hw-space-2); margin-bottom: var(--hw-space-2); }
    .lista { display: flex; flex-direction: column; gap: var(--hw-space-2); min-height: 80px; }
    .cartao { background: var(--hw-surface-raised); border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-sm); padding: var(--hw-space-3); cursor: grab;
      box-shadow: var(--hw-shadow-card); }
    .cartao:active { cursor: grabbing; }
    .cartao-titulo { font-weight: 600; font-size: .9rem; }
    .valor { font-variant-numeric: tabular-nums; font-weight: 600; }
    .cdk-drag-preview { box-shadow: var(--hw-shadow-pop); }
    .cdk-drop-list-dragging .cartao:not(.cdk-drag-placeholder) { transition: transform .2s; }
  `,
})
export class OportunidadesPage implements OnInit {
  private crm = inject(CrmService);
  private modal = inject(NgbModal);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private rt = inject(RealtimeService);

  readonly estagiosAbertos = ESTAGIOS;
  readonly ops = signal<Oportunidade[]>([]);
  readonly empresas = signal<Map<number, string>>(new Map());
  private pendentePerda: { o: Oportunidade; para: EstagioOportunidade } | null = null;

  readonly fNovo = this.fb.group({
    titulo: ['', Validators.required], empresa_id: [null as number | null, Validators.required],
    valor_estimado: [''], origem: [''], data_prevista_fechamento: [''],
  });
  readonly fPerda = this.fb.group({ motivo_perda: ['', Validators.required] });
  private readonly mPerda = viewChild<TemplateRef<unknown>>('mPerda');

  itens(est: EstagioOportunidade): Oportunidade[] {
    return this.ops().filter((o) => o.estagio === est);
  }

  empresaNome(id: number): string {
    return this.empresas().get(id) ?? `#${id}`;
  }

  ngOnInit(): void {
    this.carregar();
    this.crm.empresas({ por_pagina: 500 }).subscribe((p) =>
      this.empresas.set(new Map(p.itens.map((e) => [e.id, e.nome_fantasia || e.razao_social]))));
  }

  constructor() {
    // Outro vendedor moveu um card → reconcilia o quadro sem F5.
    effect(() => {
      if (this.rt.ultimo()?.tipo === 'oportunidade.estagio') this.carregar();
    });
  }

  carregar(): void {
    this.crm.oportunidades({ por_pagina: 200 }).subscribe((p) => this.ops.set(p.itens));
  }

  soltar(ev: CdkDragDrop<EstagioOportunidade, EstagioOportunidade, Oportunidade>): void {
    const o = ev.item.data as Oportunidade;
    const de = ev.previousContainer.data;
    const para = ev.container.data;
    if (de === para) { moveItemInArray(this.itens(de), ev.previousIndex, ev.currentIndex); return; }
    if (para === 'perdida') {
      // motivo_perda é obrigatório — abre modal antes de chamar a API
      this.pendentePerda = { o, para };
      const tpl = this.mPerda();
      if (tpl) this.modal.open(tpl);
      return;
    }
    this.moverPara(o, para);
  }

  private moverPara(o: Oportunidade, para: EstagioOportunidade, motivo?: string): void {
    this.crm.moverEstagio(o.id, para, motivo).subscribe({
      next: (atual) => this.ops.update((l) => l.map((x) => (x.id === atual.id ? atual : x))),
      error: () => this.toast.erro('Transição recusada pelo backend.'),
    });
  }

  confirmarPerda(m: { close(): void }): void {
    if (this.pendentePerda) {
      this.moverPara(this.pendentePerda.o, 'perdida', this.fPerda.value.motivo_perda!);
      this.pendentePerda = null;
    }
    m.close();
  }

  criar(m: { close(): void }): void {
    const v = this.fNovo.getRawValue();
    this.crm.criarOportunidade({
      titulo: v.titulo, empresa_id: v.empresa_id, valor_estimado: v.valor_estimado || null,
      origem: v.origem || null, data_prevista_fechamento: v.data_prevista_fechamento || null,
    }).subscribe({
      next: (o) => { this.ops.update((l) => [...l, o]); m.close(); this.toast.ok('Oportunidade criada.'); },
      error: () => this.toast.erro('Falha ao criar.'),
    });
  }
}
