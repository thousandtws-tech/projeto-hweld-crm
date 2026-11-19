import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContaService, PagamentoService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Pagamento, StatusPagamento, StatusPedido } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwStatusChip } from '../../shared/ui/status-chip';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { ToastService } from '../../shared/ui/toast';

/** S08 — Confirmação de pedido + instrumentos de pagamento (Pix/checkout cartão). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, HwStatusChip, HwButton, HwSkeleton, BrlPipe],
  templateUrl: './checkout-sucesso.html',
  styleUrl: './checkout-sucesso.scss',
})
export class CheckoutSucessoPage implements OnInit {
  private route = inject(ActivatedRoute);
  private pagamentos = inject(PagamentoService);
  private conta = inject(ContaService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  pedidoId = 0;

  // `numero` é o número real do pedido (PV-XXXXXX) — o :id da rota é o
  // id numérico interno; exibir o id parecia número de pedido mas não era.
  numero = signal<string | null>(null);
  statusPedido = signal<StatusPedido>('aguardando_pagamento');
  pagamento = signal<Pagamento | null>(null);
  carregandoPagamento = signal(true);
  erroPagamento = signal(false);
  copiado = signal(false);

  /** `pixQrCode` varia por PSP: PagBank envia URL PNG; Mercado Pago, base64 puro.
   *  Fallback do PagBank (payload EMV) não vira imagem — o copia-e-cola cobre. */
  qrImagem = computed(() => {
    const v = this.pagamento()?.pixQrCode;
    if (!v) return null;
    if (v.startsWith('http')) return v;
    if (/^[A-Za-z0-9+/=\s]{300,}$/.test(v)) return `data:image/png;base64,${v}`;
    return null;
  });

  constructor() {
    // `pagamento.*` do SSE — confirmação do PSP aparece na tela sem refresh.
    this.rt.reagirA(
      (e) => e.tipo.startsWith('pagamento.') && Number(e.dados['pedidoId']) === this.pedidoId,
      () => this.carregarPagamento(),
    );
    // Reuso do componente ao trocar de pedido — o snapshot prenderia o id
    // anterior e a tela exibiria a cobrança do pedido errado.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const novo = Number(params.get('id'));
      if (novo && novo !== this.pedidoId) {
        this.pedidoId = novo;
        this.pagamento.set(null);
        this.carregarPedido();
        this.carregarPagamento();
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.pedidoId = Number(id);
    this.numero.set(id);
    this.carregarPedido();
    this.carregarPagamento();
  }

  private carregarPedido(): void {
    this.conta
      .pedido(this.pedidoId)
      .then((p) => {
        this.numero.set(p.numero);
        this.statusPedido.set(p.status);
      })
      .catch(() => {});
  }

  private carregarPagamento(): void {
    // Falha de rede virava "sem cobrança" silencioso — sinaliza o erro
    // para a tela poder dizer que não conseguiu carregar.
    this.erroPagamento.set(false);
    this.pagamentos
      .doPedido(this.pedidoId)
      .then((lista) => this.pagamento.set(this.maisRelevante(lista)))
      .catch(() => this.erroPagamento.set(true))
      .finally(() => this.carregandoPagamento.set(false));
  }

  /** Cobrança ativa primeiro; depois a mais recente. */
  private maisRelevante(lista: Pagamento[]): Pagamento | null {
    const ativa = lista.find((p) => ['PENDING', 'PROCESSING'].includes(p.status));
    return ativa ?? lista[0] ?? null;
  }

  statusRotulo(s: StatusPagamento): string {
    const mapa: Record<StatusPagamento, string> = {
      PENDING: 'Aguardando pagamento',
      PROCESSING: 'Em análise',
      CONFIRMED: 'Pagamento confirmado',
      FAILED: 'Pagamento recusado',
      CANCELLED: 'Cobrança cancelada',
      EXPIRED: 'Cobrança expirada',
      REFUNDED: 'Pagamento estornado',
    };
    return mapa[s];
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
}
