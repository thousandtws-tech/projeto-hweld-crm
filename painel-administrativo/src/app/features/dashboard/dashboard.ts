import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DashboardService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Oportunidade, Pedido } from '../../core/models';
import { BrlPipe, StatusLabelPipe } from '../../core/pipes';

interface Stat {
  label: string; valor: string; rota?: string;
  icone: string; cor: string; // classe de cor do ícone
}

const ESTAGIOS = ['lead', 'qualificacao', 'proposta', 'negociacao'] as const;

@Component({
  standalone: true,
  imports: [RouterLink, BrlPipe, StatusLabelPipe],
  template: `
    <div class="page-header">
      <div>
        <h1 class="titulo"><i class="bi bi-speedometer2"></i> Dashboard</h1>
        <p class="sub">Visão geral da operação em tempo real</p>
      </div>
    </div>

    <div class="stats" [class.loading]="carregando()">
      @for (s of stats(); track s.label) {
        <a class="stat" [routerLink]="s.rota ?? '/dashboard'">
          <span class="icone {{ s.cor }}"><i class="bi bi-{{ s.icone }}"></i></span>
          <span class="stat-valor">{{ s.valor }}</span>
          <span class="stat-label">{{ s.label }}</span>
          <i class="bi bi-arrow-right seta"></i>
        </a>
      } @empty {
        @for (i of [1,2,3,4]; track i) { <div class="stat skeleton"></div> }
      }
    </div>

    <div class="colunas">
      <section class="card">
        <div class="card-head">
          <h2>Pedidos recentes</h2>
          <a routerLink="/vendas/pedidos" class="ver-todos">Ver todos <i class="bi bi-arrow-right"></i></a>
        </div>
        @if (pedidos().length === 0) {
          <p class="vazio"><i class="bi bi-inbox"></i> Nenhum pedido ainda.</p>
        } @else {
          <div class="table-responsive"><table>
            <thead><tr><th>Nº</th><th>Status</th><th class="text-end">Total</th></tr></thead>
            <tbody>
              @for (p of pedidos(); track p.id) {
                <tr>
                  <td><a [routerLink]="['/vendas/pedidos', p.id]">{{ p.numero }}</a></td>
                  <td><span class="chip chip-{{ p.status }}">{{ p.status | statusLabel }}</span></td>
                  <td class="hw-numeric text-end">{{ p.total | brl }}</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Pipeline</h2>
          <a routerLink="/crm/oportunidades" class="ver-todos">Abrir kanban <i class="bi bi-arrow-right"></i></a>
        </div>
        @if (pipeline().length === 0) {
          <p class="vazio"><i class="bi bi-funnel"></i> Sem oportunidades abertas.</p>
        } @else {
          <div class="funil">
            @for (e of estagios; track e) {
              <div class="funil-linha">
                <span class="funil-nome">{{ e | statusLabel }}</span>
                <div class="funil-barra">
                  <div class="funil-fill" [style.width.%]="pct(e)"></div>
                </div>
                <span class="funil-n">{{ contar(e) }}</span>
              </div>
            }
          </div>
          <ul class="pipe">
            @for (o of pipeline().slice(0, 5); track o.id) {
              <li>
                <a [routerLink]="['/crm/oportunidades']">{{ o.titulo }}</a>
                <span class="hw-numeric valor">{{ o.valor_estimado | brl }}</span>
                <span class="chip chip-{{ o.estagio }}">{{ o.estagio | statusLabel }}</span>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: `
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--hw-space-4); margin-bottom: var(--hw-space-6); }
    .stat {
      display: grid; grid-template-columns: auto 1fr; grid-template-areas: 'icon valor' 'icon label';
      column-gap: var(--hw-space-3); align-items: center; position: relative;
      padding: var(--hw-space-4) var(--hw-space-5);
      background: var(--hw-surface-1); border: 1px solid var(--hw-border-1);
      border-radius: var(--hw-radius-md); text-decoration: none; color: inherit;
      box-shadow: var(--hw-shadow-card);
      transition: transform var(--hw-motion-fast) var(--hw-motion-ease), box-shadow var(--hw-motion-fast);
    }
    .stat:hover { transform: translateY(-2px); box-shadow: var(--hw-shadow-raised); text-decoration: none; }
    .icone {
      grid-area: icon; width: 44px; height: 44px; border-radius: 11px;
      display: grid; place-items: center; font-size: 1.15rem;
    }
    .icone.azul { background: var(--hw-chip-info-bg); color: var(--hw-chip-info-fg); }
    .icone.verde { background: var(--hw-chip-success-bg); color: var(--hw-chip-success-fg); }
    .icone.roxo { background: var(--hw-chip-progress-bg); color: var(--hw-chip-progress-fg); }
    .icone.ambar { background: var(--hw-chip-warning-bg); color: var(--hw-chip-warning-fg); }
    .stat-valor { grid-area: valor; font-size: 1.45rem; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; line-height: 1.1; }
    .stat-label { grid-area: label; font-size: .78rem; color: var(--hw-text-2); }
    .seta { position: absolute; right: 12px; top: 12px; color: var(--hw-text-3); font-size: .8rem; opacity: 0; transition: opacity var(--hw-motion-fast); }
    .stat:hover .seta { opacity: 1; }
    .stat.skeleton { min-height: 88px; }

    .colunas { display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--hw-space-5); }
    @media (max-width: 960px) { .colunas { grid-template-columns: 1fr; } }
    .card { padding: 0; overflow: hidden; }
    .card-head { display: flex; align-items: center; justify-content: space-between; padding: var(--hw-space-4) var(--hw-space-5) var(--hw-space-2); }
    .card-head h2 { margin: 0; font-size: 1rem; font-weight: 700; }
    .ver-todos { font-size: .8rem; display: inline-flex; align-items: center; gap: 4px; }
    .vazio { color: var(--hw-text-3); font-size: .9rem; padding: var(--hw-space-5); display: flex; gap: 8px; align-items: center; }
    .pipe { list-style: none; margin: 0; padding: 0 var(--hw-space-5) var(--hw-space-4); display: flex; flex-direction: column; gap: var(--hw-space-2); }
    .pipe li { display: flex; align-items: center; gap: var(--hw-space-3); font-size: .88rem; }
    .pipe .valor { margin-left: auto; color: var(--hw-text-2); font-size: .82rem; }

    .funil { padding: var(--hw-space-2) var(--hw-space-5) var(--hw-space-4); display: grid; gap: 8px; }
    .funil-linha { display: grid; grid-template-columns: 92px 1fr 28px; align-items: center; gap: 10px; font-size: .8rem; }
    .funil-nome { color: var(--hw-text-2); text-transform: capitalize; }
    .funil-barra { height: 8px; border-radius: 99px; background: var(--hw-surface-3); overflow: hidden; }
    .funil-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--hw-accent), #3b82f6); min-width: 4px; transition: width var(--hw-motion-base); }
    .funil-n { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  `,
})
export class DashboardPage implements OnInit {
  private svc = inject(DashboardService);
  private rt = inject(RealtimeService);
  readonly carregando = signal(true);
  readonly stats = signal<Stat[]>([]);
  readonly pedidos = signal<Pedido[]>([]);
  readonly pipeline = signal<Oportunidade[]>([]);
  readonly estagios = ESTAGIOS;

  /** Eventos que afetam os KPIs — qualquer um dispara revalidação silenciosa. */
  private static readonly EVENTOS = [
    'pedido.criado',
    'pedido.status_alterado',
    'orcamento.criado',
    'orcamento.status_alterado',
    'orcamento.convertido',
    'oportunidade.estagio',
    'empresa.criada',
    'empresa.atualizada',
    'empresa.arquivada',
    'catalogo.produtos',
    'estoque.movimentado',
    'pagamento.baixado',
    'pagamento.estornado',
  ];

  constructor() {
    // KPIs ao vivo — evento da loja/backoffice reconcilia o painel via REST.
    effect(() => {
      const e = this.rt.ultimo();
      if (e && DashboardPage.EVENTOS.includes(e.tipo)) this.carregar();
    });
  }

  contar(est: string): number {
    return this.pipeline().filter((o) => o.estagio === est).length;
  }
  pct(est: string): number {
    const max = Math.max(1, ...ESTAGIOS.map((e) => this.contar(e)));
    return (this.contar(est) / max) * 100;
  }

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    const vazio = of({ itens: [] as never[], total: 0, pagina: 1, por_pagina: 0, total_paginas: 0 });
    forkJoin({
      pedidos: this.svc.pedidosRecentes().pipe(catchError(() => vazio)),
      empresas: this.svc.empresas().pipe(catchError(() => vazio)),
      produtos: this.svc.produtos().pipe(catchError(() => vazio)),
      ops: this.svc.oportunidadesAbertas().pipe(catchError(() => vazio)),
      estoque: this.svc.estoqueBaixo().pipe(catchError(() => vazio)),
    }).subscribe(({ pedidos, empresas, produtos, ops, estoque }) => {
      this.pedidos.set(pedidos.itens as Pedido[]);
      const abertas = (ops.itens as Oportunidade[]).filter((o) => !['ganha', 'perdida'].includes(o.estagio));
      this.pipeline.set(ops.itens as Oportunidade[]);
      this.stats.set([
        { label: 'Empresas', valor: String(empresas.total), rota: '/crm/empresas', icone: 'buildings', cor: 'azul' },
        { label: 'Oportunidades abertas', valor: String(abertas.length), rota: '/crm/oportunidades', icone: 'funnel', cor: 'roxo' },
        { label: 'Produtos no catálogo', valor: String(produtos.total), rota: '/catalogo/produtos', icone: 'box-seam', cor: 'verde' },
        { label: 'Abaixo do estoque mínimo', valor: String(estoque.total), rota: '/estoque', icone: 'exclamation-triangle', cor: 'ambar' },
      ]);
      this.carregando.set(false);
    });
  }
}
