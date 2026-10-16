import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContaService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { PedidoDetalhe, StatusPedido } from '../../core/models';
import { BrlPipe, QtyPipe } from '../../core/pipes';
import { HwStatusChip } from '../../shared/ui/status-chip';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwEmpty } from '../../shared/ui/empty';
import { HwContaNav } from './conta-nav';

/** S10 — Detalhe do pedido com visualizador de progresso e tabela de itens. */
@Component({
  imports: [RouterLink, HwSkeleton, HwEmpty, HwStatusChip, BrlPipe, QtyPipe, HwContaNav],
  templateUrl: './pedido-detalhe.html',
  styleUrl: './pedido-detalhe.scss',
})
export class PedidoDetalhePage implements OnInit {
  private route = inject(ActivatedRoute);
  private conta = inject(ContaService);
  private rt = inject(RealtimeService);
  private id = 0;

  pedido = signal<PedidoDetalhe | null>(null);
  carregando = signal(true);
  etapas = ['Confirmado', 'Em separação', 'Faturado', 'Enviado', 'Entregue'];

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo === 'pedido.status_alterado' && Number(e.dados['id']) === this.id) {
        this.carregar();
      }
    });
  }

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.carregar();
  }

  private carregar(): void {
    this.conta
      .pedido(this.id)
      .then((p) => this.pedido.set(p))
      .catch(() => this.pedido.set(null))
      .finally(() => this.carregando.set(false));
  }

  indiceAtual(status: StatusPedido): number {
    const ordem: StatusPedido[] = ['confirmado', 'em_separacao', 'faturado', 'enviado', 'entregue'];
    return ordem.indexOf(status);
  }

  isFeita(i: number): boolean {
    const p = this.pedido();
    if (!p) return false;
    if (p.status === 'concluido') return true;
    const atual = this.indiceAtual(p.status);
    return i < atual;
  }

  classeEtapa(i: number): string {
    const p = this.pedido();
    if (!p || p.status === 'cancelado' || p.status === 'aguardando_pagamento') return '';
    const atual = this.indiceAtual(p.status);
    if (p.status === 'concluido' || i < atual) return 'feita';
    return i === atual ? 'atual' : '';
  }
}
