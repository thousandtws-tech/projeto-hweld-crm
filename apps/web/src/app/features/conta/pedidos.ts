import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContaService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Pagina, PedidoResumo, StatusPedido } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwStatusChip } from '../../shared/ui/status-chip';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwEmpty } from '../../shared/ui/empty';
import { HwContaNav } from './conta-nav';

type FiltroRastreio = 'todos' | 'preparacao' | 'a_caminho' | 'entregues' | 'cancelados';

interface FiltroChip {
  id: FiltroRastreio;
  rotulo: string;
  icone: string;
  statuses: StatusPedido[];
}

/** Fases de entrega no padrão do e-commerce BR — agrupam os status internos. */
const FILTROS: FiltroChip[] = [
  { id: 'todos', rotulo: 'Todos', icone: 'list_alt', statuses: [] },
  {
    id: 'preparacao',
    rotulo: 'Em preparação',
    icone: 'inventory',
    statuses: ['aguardando_pagamento', 'confirmado', 'em_separacao', 'faturado'],
  },
  { id: 'a_caminho', rotulo: 'A caminho', icone: 'local_shipping', statuses: ['enviado'] },
  { id: 'entregues', rotulo: 'Entregues', icone: 'task_alt', statuses: ['entregue', 'concluido'] },
  { id: 'cancelados', rotulo: 'Cancelados', icone: 'cancel', statuses: ['cancelado'] },
];

/** S09 — Meus pedidos com filtro de rastreamento por fase da entrega. */
@Component({
  imports: [RouterLink, DatePipe, HwStatusChip, HwSkeleton, HwEmpty, HwButton, BrlPipe, HwContaNav],
  templateUrl: './pedidos.html',
  styleUrl: './pedidos.scss',
})
export class PedidosPage implements OnInit {
  private conta = inject(ContaService);
  private rt = inject(RealtimeService);
  pedidos = signal<Pagina<PedidoResumo> | null>(null);
  carregando = signal(true);
  filtroAtivo = signal<FiltroRastreio>('todos');
  filtros = FILTROS;

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo.startsWith('pedido.')) this.carregar();
    });
  }

  ngOnInit(): void {
    this.carregar();
  }

  selecionar(filtro: FiltroRastreio): void {
    if (this.filtroAtivo() === filtro) return;
    this.filtroAtivo.set(filtro);
    this.carregar();
  }

  filtroCorrente(): FiltroChip {
    return FILTROS.find((f) => f.id === this.filtroAtivo())!;
  }

  private carregar(): void {
    this.carregando.set(true);
    this.conta
      .pedidos({ status: this.filtroCorrente().statuses })
      .then((p) => this.pedidos.set(p))
      .catch(() => this.pedidos.set(null))
      .finally(() => this.carregando.set(false));
  }
}
