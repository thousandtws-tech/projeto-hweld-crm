import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { NgbPaginationModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Api, Filtros } from '../core/servicos';
import { Pagina } from '../core/models';
import { BrlPipe, QtyPipe, StatusLabelPipe } from '../core/pipes';
import { RealtimeService } from '../core/realtime';

export interface Coluna {
  campo: string;
  rotulo: string;
  tipo?: 'texto' | 'dinheiro' | 'qtd' | 'status' | 'bool' | 'data' | 'numero';
  /** rota para detalhe: `link: '/vendas/pedidos'` gera `/vendas/pedidos/{row.id}` */
  link?: string;
}

export interface ListaCfg {
  titulo: string;
  recurso: string;
  colunas: Coluna[];
  /** campo de busca enviado como `?busca=` */
  busca?: boolean;
  /** filtro extra fixo: {campo, opcoes:[{valor,rotulo}]} — ex.: status */
  filtro?: { campo: string; rotulo: string; opcoes: { valor: string; rotulo: string }[] };
  novaRota?: string;      // botão "Novo"
  detalhePrefixo?: string; // clique na linha → {prefixo}/{id}
  /** tipos de evento realtime que disparam reload (ex.: ['pedido.criado']). */
  eventos?: string[];
}

type Linha = Record<string, unknown>;

/**
 * Listagem server-side config-driven — as rotas declaram `data: ListaCfg`.
 * Estados: loading, vazio, erro com retry, paginação.
 */
@Component({
  selector: 'app-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, NgbPaginationModule, NgbTooltipModule],
  template: `
    <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
      <h1 class="h4 mb-0">{{ cfg().titulo }}</h1>
      <div class="ms-auto d-flex gap-2">
        @if (cfg().busca) {
          <input class="form-control form-control-sm w-auto" type="search" placeholder="Buscar…"
                 aria-label="Buscar" [formControl]="busca" />
        }
        @if (cfg().filtro; as f) {
          <select class="form-select form-select-sm w-auto" [attr.aria-label]="f.rotulo"
                  [formControl]="filtro">
            <option value="">{{ f.rotulo }}: todos</option>
            @for (o of f.opcoes; track o.valor) {
              <option [value]="o.valor">{{ o.rotulo }}</option>
            }
          </select>
        }
        @if (cfg().novaRota) {
          <a class="btn btn-primary btn-sm" [routerLink]="cfg().novaRota">+ Novo</a>
        }
      </div>
    </div>

    @if (erro()) {
      <div class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
        <span>{{ erro() }}</span>
        <button class="btn btn-sm btn-outline-danger" (click)="carregar()">Tentar novamente</button>
      </div>
    }

    <div class="card">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" [class.table-loading]="carregando()">
          <thead class="table-light">
            <tr>@for (c of cfg().colunas; track c.campo) { <th>{{ c.rotulo }}</th> }</tr>
          </thead>
          <tbody>
            @if (carregando()) {
              @for (i of [1,2,3,4,5]; track i) {
                <tr>@for (c of cfg().colunas; track c.campo) { <td><span class="placeholder col-8"></span></td> }</tr>
              }
            } @else if (pagina(); as p) {
              @if (p.itens.length === 0) {
                <tr><td [attr.colspan]="cfg().colunas.length" class="text-center text-body-secondary py-5">
                  Nenhum registro.
                </td></tr>
              } @else {
                @for (linha of p.itens; track idDe(linha)) {
                  <tr [class.cursor-pointer]="!!cfg().detalhePrefixo">
                    @for (c of cfg().colunas; track c.campo) {
                      <td>
                        @if (c.link) {
                          <a [routerLink]="[c.link, idDe(linha)]">{{ celula(linha, c) }}</a>
                        } @else {
                          {{ celula(linha, c) }}
                        }
                      </td>
                    }
                  </tr>
                }
              }
            }
          </tbody>
        </table>
      </div>
      @if (pagina(); as p) {
        @if (p.total_paginas > 1) {
          <div class="card-footer d-flex justify-content-between align-items-center">
            <small class="text-body-secondary">{{ p.total }} registro(s)</small>
            <ngb-pagination [collectionSize]="p.total" [page]="paginaNum()"
                            [pageSize]="20" [maxSize]="5" [boundaryLinks]="true" size="sm"
                            (pageChange)="irPara($event)" />
          </div>
        }
      }
    </div>
  `,
  styles: `
    .cursor-pointer { cursor: pointer; }
    .table-loading { opacity: .55; }
  `,
})
export class ListaPage implements OnInit {
  private api = inject(Api);
  private rt = inject(RealtimeService);
  readonly cfg = input.required<ListaCfg>({ alias: 'cfg' });
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly pagina = signal<Pagina<Linha> | null>(null);
  readonly paginaNum = signal(1);
  readonly busca = new FormControl('', { nonNullable: true });
  readonly filtro = new FormControl('', { nonNullable: true });

  constructor() {
    // Reconciliação: evento realtime → reload via REST (silencioso, sem skeleton).
    effect(() => {
      const e = this.rt.ultimo();
      if (e && this.cfg().eventos?.includes(e.tipo)) this.carregar(true);
    });
  }

  ngOnInit(): void {
    this.busca.valueChanges.pipe(debounceTime(350), distinctUntilChanged())
      .subscribe(() => { this.paginaNum.set(1); this.carregar(); });
    this.filtro.valueChanges.subscribe(() => { this.paginaNum.set(1); this.carregar(); });
    this.carregar();
  }

  irPara(p: number): void {
    this.paginaNum.set(p);
    this.carregar();
  }

  carregar(silencioso = false): void {
    if (!silencioso) this.carregando.set(true);
    this.erro.set(null);
    const f: Filtros = { pagina: this.paginaNum(), por_pagina: 20 };
    if (this.cfg().busca && this.busca.value) f['busca'] = this.busca.value;
    const fc = this.cfg().filtro;
    if (fc && this.filtro.value) f[fc.campo] = this.filtro.value;
    this.api.lista<Linha>(this.cfg().recurso, f).subscribe({
      next: (p) => { this.pagina.set(p); this.carregando.set(false); },
      error: (e: { status?: number }) => {
        this.erro.set(e.status === 403 ? 'Sem permissão para este recurso.' : 'Falha ao carregar. O backend está no ar?');
        this.carregando.set(false);
      },
    });
  }

  idDe(linha: Linha): number | string {
    return (linha['id'] as number | string) ?? '';
  }

  celula(linha: Linha, c: Coluna): string {
    const v = linha[c.campo];
    switch (c.tipo) {
      case 'dinheiro': return new BrlPipe().transform(v as string);
      case 'qtd': return new QtyPipe().transform(v as string);
      case 'status': {
        const s = new StatusLabelPipe().transform(v as string);
        return s;
      }
      case 'bool': return v ? 'Sim' : 'Não';
      case 'data': return v ? new Date(v as string).toLocaleDateString('pt-BR') : '—';
      case 'numero': return v == null ? '—' : String(v);
      default:
        if (v === null || v === undefined) return '—';
        if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
        return String(v).slice(0, 80);
    }
  }
}
