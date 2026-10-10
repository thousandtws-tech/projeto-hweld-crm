import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CatalogoService, Categoria, TabelaPreco } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Produto } from '../../core/models';
import { ToastService } from '../../shared/ui/toast';
import { BrlPipe } from '../../core/pipes';

/** Formulário completo de produto (fiscal + dimensões + flags). */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="h4 mb-3">{{ edicao() ? 'Editar' : 'Novo' }} produto</h1>
    <form [formGroup]="f" (ngSubmit)="salvar()">
      <div class="card mb-3"><div class="card-header">Identificação</div>
        <div class="card-body row g-2">
          <div class="col-md-3"><label class="form-label">SKU</label><input class="form-control" formControlName="sku" /></div>
          <div class="col-md-6"><label class="form-label">Nome</label><input class="form-control" formControlName="nome" /></div>
          <div class="col-md-3"><label class="form-label">Slug</label><input class="form-control" formControlName="slug" placeholder="auto" /></div>
          <div class="col-md-4"><label class="form-label">Categoria</label>
            <select class="form-select" formControlName="categoria_id">
              <option [ngValue]="null">—</option>
              @for (c of categorias(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
            </select></div>
          <div class="col-md-4"><label class="form-label">Marca</label><input class="form-control" formControlName="marca" /></div>
          <div class="col-md-4"><label class="form-label">Unidade (kg, cx, un…)</label><input class="form-control" formControlName="unidade_medida" /></div>
        </div></div>

      <div class="card mb-3"><div class="card-header">Fiscal & medidas</div>
        <div class="card-body row g-2">
          <div class="col-md-3"><label class="form-label">NCM</label><input class="form-control" formControlName="ncm" /></div>
          <div class="col-md-3"><label class="form-label">Origem mercadoria</label>
            <select class="form-select" formControlName="origem_mercadoria">
              <option value="">—</option><option value="0">0 — Nacional</option><option value="1">1 — Importada</option>
            </select></div>
          <div class="col-md-3"><label class="form-label">Peso (kg)</label><input class="form-control" type="number" step="0.001" formControlName="peso_kg" /></div>
          <div class="col-md-3"><label class="form-label">Dimensões A×L×C (cm)</label>
            <div class="input-group input-group-sm">
              <input class="form-control" type="number" step="0.01" formControlName="altura_cm" placeholder="A" />
              <input class="form-control" type="number" step="0.01" formControlName="largura_cm" placeholder="L" />
              <input class="form-control" type="number" step="0.01" formControlName="comprimento_cm" placeholder="C" />
            </div></div>
        </div></div>

      <div class="card mb-3"><div class="card-header">Comercial</div>
        <div class="card-body row g-2">
          <div class="col-md-3"><label class="form-label">Preço de venda</label><input class="form-control" type="number" step="0.01" formControlName="preco_venda" /></div>
          <div class="col-md-3"><label class="form-label">Preço de custo</label><input class="form-control" type="number" step="0.01" formControlName="preco_custo" /></div>
          <div class="col-md-3"><label class="form-label">Estoque mínimo</label><input class="form-control" type="number" step="0.001" formControlName="estoque_minimo" /></div>
          <div class="col-md-3 d-flex align-items-end gap-3">
            <div class="form-check"><input class="form-check-input" type="checkbox" id="pAtivo" formControlName="ativo" /><label class="form-check-label" for="pAtivo">Ativo</label></div>
            <div class="form-check"><input class="form-check-input" type="checkbox" id="pDestaque" formControlName="destaque" /><label class="form-check-label" for="pDestaque">Destaque</label></div>
            <div class="form-check"><input class="form-check-input" type="checkbox" id="pCtrl" formControlName="controla_estoque" /><label class="form-check-label" for="pCtrl">Ctrl. estoque</label></div>
          </div>
          <div class="col-12"><label class="form-label">Descrição curta</label><input class="form-control" formControlName="descricao_curta" /></div>
          <div class="col-12"><label class="form-label">Descrição técnica</label><textarea class="form-control" rows="3" formControlName="descricao_tecnica"></textarea></div>
        </div></div>

      <div class="d-flex gap-2">
        <button class="btn btn-primary" type="submit" [disabled]="f.invalid">Salvar</button>
        <a class="btn btn-outline-secondary" routerLink="/catalogo/produtos">Voltar</a>
      </div>
    </form>
  `,
})
export class ProdutoFormPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private svc = inject(CatalogoService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly categorias = signal<Categoria[]>([]);
  readonly edicao = signal(false);
  private id = 0;

  readonly f = this.fb.group({
    sku: ['', Validators.required], nome: ['', Validators.required], slug: [''],
    categoria_id: [null as number | null, Validators.required],
    marca: [''], unidade_medida: [''],
    ncm: [''], origem_mercadoria: [''],
    peso_kg: [''], altura_cm: [''], largura_cm: [''], comprimento_cm: [''],
    preco_venda: ['', Validators.required], preco_custo: [''], estoque_minimo: [''],
    ativo: [true], destaque: [false], controla_estoque: [true],
    descricao_curta: [''], descricao_tecnica: [''],
  });

  ngOnInit(): void {
    this.svc.categorias().subscribe((p) => this.categorias.set(p));
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.edicao.set(true);
      this.id = id;
      this.svc.produto(id).subscribe((p) => this.f.patchValue({
        ...p, slug: p.slug, descricao_curta: null, descricao_tecnica: null,
      } as never));
    }
  }

  salvar(): void {
    const v = this.f.getRawValue();
    const body = { ...v, categoria_id: v.categoria_id, preco_venda: String(v.preco_venda) };
    const op = this.edicao() ? this.svc.atualizarProduto(this.id, body) : this.svc.criarProduto(body);
    op.subscribe({
      next: (p) => { this.toast.ok('Produto salvo.'); void this.router.navigate(['/catalogo/produtos']); },
      error: () => this.toast.erro('Falha ao salvar produto.'),
    });
  }
}

/** Árvore de categorias com criação/edição inline. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, NgTemplateOutlet],
  template: `
    <div class="d-flex align-items-center mb-3">
      <h1 class="h4 mb-0">Categorias</h1>
      <button class="btn btn-primary btn-sm ms-auto" (click)="abrir(mForm)">+ Categoria</button>
    </div>
    <div class="card"><div class="card-body">
      <ul class="tree">
        @for (c of raizes(); track c.id) {
          <ng-container *ngTemplateOutlet="no; context: { $implicit: c, nivel: 0 }" />
        }
      </ul>
    </div></div>

    <ng-template #no let-c let-nivel="nivel">
      <li [style.padding-left.px]="nivel * 20" class="tree-item">
        <span [class.text-body-secondary]="!c.ativa">{{ c.nome }}</span>
        <small class="text-body-secondary">/{{ c.slug }}</small>
        <button class="btn btn-sm btn-link" (click)="abrir(mForm, c)">editar</button>
      </li>
      @for (f of filhos(c.id); track f.id) {
        <ng-container *ngTemplateOutlet="no; context: { $implicit: f, nivel: nivel + 1 }" />
      }
    </ng-template>

    <ng-template #mForm let-m>
      <div class="modal-header"><h5 class="modal-title">Categoria</h5><button class="btn-close" (click)="m.dismiss()"></button></div>
      <form [formGroup]="f" (ngSubmit)="salvar(m)">
        <div class="modal-body row g-2">
          <div class="col-12"><label class="form-label">Nome</label><input class="form-control" formControlName="nome" /></div>
          <div class="col-md-6"><label class="form-label">Slug</label><input class="form-control" formControlName="slug" placeholder="auto" /></div>
          <div class="col-md-6"><label class="form-label">Pai</label>
            <select class="form-select" formControlName="categoria_pai_id">
              <option [ngValue]="null">Raiz</option>
              @for (c of todas(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
            </select></div>
          <div class="col-md-6"><label class="form-label">Ordem</label><input class="form-control" type="number" formControlName="ordem" /></div>
          <div class="col-md-6 d-flex align-items-end"><div class="form-check">
            <input class="form-check-input" type="checkbox" id="catAtiva" formControlName="ativa" />
            <label class="form-check-label" for="catAtiva">Ativa</label></div></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary" type="submit" [disabled]="f.invalid">Salvar</button></div>
      </form>
    </ng-template>
  `,
  styles: `
    .tree { list-style: none; padding: 0; margin: 0; }
    .tree-item { padding: var(--hw-space-2) 0; border-bottom: 1px solid var(--hw-border); }
  `,
})
export class CategoriasPage implements OnInit {
  private svc = inject(CatalogoService);
  private modal = inject(NgbModal);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private fb = inject(FormBuilder);

  readonly todas = signal<Categoria[]>([]);
  private editando: Categoria | null = null;

  readonly f = this.fb.group({
    nome: ['', Validators.required], slug: [''], categoria_pai_id: [null as number | null],
    ordem: [0], ativa: [true],
  });

  raizes(): Categoria[] { return this.todas().filter((c) => !c.categoria_pai_id).sort((a, b) => a.ordem - b.ordem); }
  filhos(id: number): Categoria[] { return this.todas().filter((c) => c.categoria_pai_id === id).sort((a, b) => a.ordem - b.ordem); }

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo === 'catalogo.categorias') this.carregar();
    });
  }

  ngOnInit(): void { this.carregar(); }
  carregar(): void { this.svc.categorias().subscribe((p) => this.todas.set(p)); }

  abrir(tpl: unknown, c?: Categoria): void {
    this.editando = c ?? null;
    this.f.reset({ nome: c?.nome ?? '', slug: c?.slug ?? '', categoria_pai_id: c?.categoria_pai_id ?? null, ordem: c?.ordem ?? 0, ativa: c?.ativa ?? true });
    this.modal.open(tpl as object);
  }

  salvar(m: { close(): void }): void {
    const v = this.f.getRawValue();
    const body = { ...v, slug: v.slug || null };
    const op = this.editando ? this.svc.atualizarCategoria(this.editando.id, body) : this.svc.criarCategoria(body);
    op.subscribe({
      next: () => { this.carregar(); m.close(); this.toast.ok('Categoria salva.'); },
      error: () => this.toast.erro('Falha ao salvar categoria.'),
    });
  }
}

/** Itens de uma tabela de preço — define/remove preço por produto. */
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, BrlPipe],
  template: `
    @if (tabela(); as t) {
      <div class="d-flex align-items-center gap-3 mb-3">
        <h1 class="h4 mb-0">Tabela: {{ t.nome }}</h1>
        <span class="badge text-bg-{{ t.ativa ? 'success' : 'secondary' }}">{{ t.ativa ? 'Ativa' : 'Inativa' }}</span>
      </div>
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span>Preços por produto</span>
          <form class="d-flex gap-2" [formGroup]="fPreco" (ngSubmit)="definir()">
            <select class="form-select form-select-sm" formControlName="produto_id" aria-label="Produto">
              @for (p of produtos(); track p.id) { <option [ngValue]="p.id">{{ p.sku }} · {{ p.nome }}</option> }
            </select>
            <input class="form-control form-control-sm w-auto" type="number" step="0.01" formControlName="preco" placeholder="Preço" aria-label="Preço" />
            <button class="btn btn-primary btn-sm" [disabled]="fPreco.invalid">Definir</button>
          </form>
        </div>
        <div class="table-responsive">
          <table class="table mb-0 align-middle">
            <thead class="table-light"><tr><th>Produto</th><th class="text-end">Preço</th><th></th></tr></thead>
            <tbody>
              @for (i of t.itens ?? []; track i.produto_id) {
                <tr>
                  <td>{{ nomeProduto(i.produto_id) }}</td>
                  <td class="text-end hw-numeric">{{ i.preco | brl }}</td>
                  <td class="text-end"><button class="btn btn-sm btn-outline-danger" (click)="remover(t, i.produto_id)">Remover</button></td>
                </tr>
              } @empty { <tr><td colspan="3" class="text-center text-body-secondary py-4">Nenhum preço definido.</td></tr> }
            </tbody>
          </table>
        </div>
      </div>
    } @else {
      <div class="card"><div class="card-body text-center text-body-secondary py-5">Carregando…</div></div>
    }
  `,
})
export class TabelaPrecoPage implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(CatalogoService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private fb = inject(FormBuilder);

  readonly tabela = signal<TabelaPreco | null>(null);
  readonly produtos = signal<Produto[]>([]);
  readonly fPreco = this.fb.group({ produto_id: [null as number | null, Validators.required], preco: ['', Validators.required] });

  nomeProduto(id: number): string { return this.produtos().find((p) => p.id === id)?.nome ?? `#${id}`; }
  private id(): number { return Number(this.route.snapshot.paramMap.get('id')); }

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo === 'catalogo.precos') this.carregarTabela();
    });
  }

  ngOnInit(): void {
    this.carregarTabela();
    this.svc.produtos({ por_pagina: 500, ativo: true }).subscribe((p) => this.produtos.set(p.itens));
  }

  private carregarTabela(): void {
    this.svc.tabela(this.id()).subscribe((t) => this.tabela.set(t));
  }

  definir(): void {
    const v = this.fPreco.getRawValue();
    this.svc.definirPreco(this.id(), v.produto_id!, String(v.preco)).subscribe({
      next: () => { this.svc.tabela(this.id()).subscribe((t) => this.tabela.set(t)); this.toast.ok('Preço definido.'); },
      error: () => this.toast.erro('Falha ao definir preço.'),
    });
  }

  remover(t: TabelaPreco, produtoId: number): void {
    this.svc.removerItemTabela(t.id, produtoId).subscribe({
      next: () => this.svc.tabela(this.id()).subscribe((x) => this.tabela.set(x)),
      error: () => this.toast.erro('Falha ao remover.'),
    });
  }
}
