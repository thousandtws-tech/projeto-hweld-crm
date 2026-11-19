import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContaService, LogisticaService, PagamentoService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import {
  CotacaoFrete,
  Pagamento,
  PedidoDetalhe,
  StatusPagamento,
  StatusPedido,
} from '../../core/models';
import { BrlPipe, QtyPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwStatusChip } from '../../shared/ui/status-chip';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwEmpty } from '../../shared/ui/empty';
import { HwContaNav } from './conta-nav';
import { ToastService } from '../../shared/ui/toast';

/** S10 — Detalhe do pedido: progresso, itens, pagamento online e cotação de frete. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HwSkeleton, HwEmpty, HwStatusChip, HwButton, BrlPipe, QtyPipe, HwContaNav],
  templateUrl: './pedido-detalhe.html',
  styleUrl: './pedido-detalhe.scss',
})
export class PedidoDetalhePage implements OnInit {
  private route = inject(ActivatedRoute);
  private conta = inject(ContaService);
  private pagamentos = inject(PagamentoService);
  private logistica = inject(LogisticaService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private id = 0;

  pedido = signal<PedidoDetalhe | null>(null);
  pagamento = signal<Pagamento | null>(null);
  erroPagamento = signal(false);
  cotacao = signal<CotacaoFrete | null>(null);
  carregando = signal(true);
  cotando = signal(false);
  copiado = signal(false);
  etapas = ['Confirmado', 'Em separação', 'Faturado', 'Enviado', 'Entregue'];

  /** `pixQrCode` varia por PSP: URL (PagBank) ou base64 puro (Mercado Pago). */
  qrImagem = computed(() => {
    const v = this.pagamento()?.pixQrCode;
    if (!v) return null;
    if (v.startsWith('http')) return v;
    if (/^[A-Za-z0-9+/=\s]{300,}$/.test(v)) return `data:image/png;base64,${v}`;
    return null;
  });

  constructor() {
    this.rt.reagirA(
      (e) => e.tipo === 'pedido.status_alterado' && Number(e.dados['id']) === this.id,
      () => this.carregar(),
    );
    // Confirmação/recusa do PSP atualiza a cobrança sem refresh.
    this.rt.reagirA(
      (e) => e.tipo.startsWith('pagamento.') && Number(e.dados['pedidoId']) === this.id,
      () => this.carregarPagamento(),
    );
    // Angular reutiliza o componente ao navegar pedido→pedido: o snapshot
    // manteria o id antigo — a tela mostraria dados do pedido anterior.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const novo = Number(params.get('id'));
      if (novo && novo !== this.id) {
        this.id = novo;
        this.pagamento.set(null);
        this.carregar();
        this.carregarPagamento();
      }
    });
  }

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.carregar();
    this.carregarPagamento();
  }

  private carregar(): void {
    this.conta
      .pedido(this.id)
      .then((p) => this.pedido.set(p))
      .catch(() => this.pedido.set(null))
      .finally(() => this.carregando.set(false));
  }

  private carregarPagamento(): void {
    // Falha de load não pode parecer "sem cobrança" — esconderia uma
    // cobrança existente e exibiria o botão de gerar outra.
    this.erroPagamento.set(false);
    this.pagamentos
      .doPedido(this.id)
      .then((lista) =>
        this.pagamento.set(
          lista.find((p) => ['PENDING', 'PROCESSING'].includes(p.status)) ?? lista[0] ?? null,
        ),
      )
      .catch(() => this.erroPagamento.set(true));
  }

  /** Nova cobrança (Pix) — idempotente por pedido+método, retry seguro. */
  async pagarComPix(): Promise<void> {
    try {
      const pg = await this.pagamentos.criar({
        pedidoId: this.id,
        method: 'PIX',
        idempotencyKey: `pedido-${this.id}-pix`,
      });
      this.pagamento.set(pg);
    } catch (e: unknown) {
      this.toast.erro(this.mensagemErro(e, 'Não foi possível gerar a cobrança Pix.'));
    }
  }

  /** Nova cobrança (cartão) — devolve link hospedado do PSP. */
  async pagarComCartao(): Promise<void> {
    try {
      const pg = await this.pagamentos.criar({
        pedidoId: this.id,
        method: 'CREDIT_CARD',
        idempotencyKey: `pedido-${this.id}-credit_card`,
      });
      this.pagamento.set(pg);
      if (pg.checkoutUrl) window.open(pg.checkoutUrl, '_blank', 'noopener');
    } catch (e: unknown) {
      this.toast.erro(this.mensagemErro(e, 'Não foi possível gerar o link de pagamento.'));
    }
  }

  async cotarFrete(): Promise<void> {
    if (this.cotando()) return;
    this.cotando.set(true);
    try {
      this.cotacao.set(await this.logistica.cotarPedido(this.id));
    } catch (e: unknown) {
      this.toast.erro(this.mensagemErro(e, 'Não foi possível cotar o frete deste pedido.'));
    } finally {
      this.cotando.set(false);
    }
  }

  async copiarPix(codigo: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(codigo);
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2500);
    } catch {
      this.toast.erro('Não foi possível copiar — selecione o código manualmente.');
    }
  }

  statusPagamentoRotulo(s: StatusPagamento): string {
    const mapa: Record<StatusPagamento, string> = {
      PENDING: 'Aguardando pagamento',
      PROCESSING: 'Em análise',
      CONFIRMED: 'Pago',
      FAILED: 'Recusado',
      CANCELLED: 'Cancelado',
      EXPIRED: 'Expirado',
      REFUNDED: 'Estornado',
    };
    return mapa[s];
  }

  private mensagemErro(e: unknown, fallback: string): string {
    // Envelopes distintos: core-api { erro: { mensagem } } / ops-api { mensagem | message }.
    const err = e as { error?: { erro?: { mensagem?: string }; mensagem?: string; message?: string } };
    return err?.error?.erro?.mensagem ?? err?.error?.mensagem ?? err?.error?.message ?? fallback;
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
