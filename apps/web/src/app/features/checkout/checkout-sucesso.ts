import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  afterEveryRender,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import { MpBrickController, MpBrickService, MpCardFormData } from '../../core/mp-brick';

/**
 * S08 — Confirmação de pedido + instrumentos de pagamento.
 * Cartão Mercado Pago = Checkout Transparente: o Card Payment Brick tokeniza
 * PAN/CVV direto no PSP (nada toca no backend HWeld — só o token de uso único).
 * Pix = QR copia-e-cola; demais PSPs = link hospedado (checkoutUrl).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, HwStatusChip, HwButton, HwSkeleton, BrlPipe],
  templateUrl: './checkout-sucesso.html',
  styleUrl: './checkout-sucesso.scss',
})
export class CheckoutSucessoPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private pagamentos = inject(PagamentoService);
  private conta = inject(ContaService);
  private toast = inject(ToastService);
  private rt = inject(RealtimeService);
  private brickService = inject(MpBrickService);
  pedidoId = 0;

  // `numero` é o número real do pedido (PV-XXXXXX) — o :id da rota é o
  // id numérico interno; exibir o id parecia número de pedido mas não era.
  numero = signal<string | null>(null);
  statusPedido = signal<StatusPedido>('aguardando_pagamento');
  pagamento = signal<Pagamento | null>(null);
  carregandoPagamento = signal(true);
  erroPagamento = signal(false);
  copiado = signal(false);

  /** Método escolhido no checkout (query param) — decide se o Brick aparece. */
  metodoCartao = signal(false);
  /** Config pública do checkout — provider + public key do PSP. */
  checkoutCfg = signal<{ provedorCartao: string; publicKey?: string } | null>(null);
  pagandoCartao = signal(false);

  private mpBrick: MpBrickController | null = null;
  private mpBrickMontando = false;

  /** Brick visível quando: método cartão + MP transparente + sem cobrança ativa. */
  brickVisivel = computed(
    () =>
      this.metodoCartao() &&
      this.checkoutCfg()?.provedorCartao === 'mercadopago' &&
      !!this.checkoutCfg()?.publicKey &&
      this.pagamento() == null,
  );

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
    // O Brick precisa do <div id="mp-card-brick"> renderizado — o @if do
    // template só cria o nó depois do CD; afterEveryRender agenda o init
    // para quando o container realmente existir.
    afterEveryRender(() => {
      if (this.brickVisivel() && !this.mpBrick && !this.mpBrickMontando && !this.pagandoCartao()) {
        const el = document.getElementById('mp-card-brick');
        if (el) void this.montarBrick();
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.pedidoId = Number(id);
    this.numero.set(id);
    this.metodoCartao.set(this.route.snapshot.queryParamMap.get('metodo') === 'CREDIT_CARD');
    this.carregarPedido();
    this.carregarPagamento();
    if (this.metodoCartao()) this.carregarCheckoutConfig();
  }

  ngOnDestroy(): void {
    void this.mpBrick?.unmount().catch(() => {});
    this.mpBrick = null;
  }

  private carregarCheckoutConfig(): void {
    this.pagamentos
      .checkoutConfig()
      .then((cfg) => {
        this.checkoutCfg.set(cfg);
        // Transparente só com MP + public key; qualquer outro caso (PagBank,
        // MP sem chave, config falhou) cai no link hospedado de sempre.
        if (!(cfg.provedorCartao === 'mercadopago' && cfg.publicKey)) {
          this.criarCobrancaHospedada();
        }
      })
      .catch(() => this.criarCobrancaHospedada());
  }

  /** Fallback hospedado — PSP sem checkout transparente cria link na hora. */
  private criarCobrancaHospedada(): void {
    this.pagamentos
      .criar({
        pedidoId: this.pedidoId,
        method: 'CREDIT_CARD',
        idempotencyKey: `pedido-${this.pedidoId}-credit_card`,
      })
      .then((pg) => this.pagamento.set(pg))
      .catch(() => {
        /* Pedido existe — a conta do cliente permite emitir a cobrança depois. */
      });
  }

  /** Card Payment Brick: tokenização e formulário acontecem 100% no SDK/MP.
   *  SDK bloqueado no cliente (ad-blocker/rede) → cai no link hospedado. */
  private async montarBrick(): Promise<void> {
    const cfg = this.checkoutCfg();
    const valor = this.pagamento()?.amount ?? this.totalPedido;
    if (!cfg?.publicKey || !valor || this.mpBrickMontando) return;
    this.mpBrickMontando = true;
    try {
      this.mpBrick = await this.brickService.montar(
        'mp-card-brick',
        valor,
        cfg.publicKey,
        (fd) => this.pagarComToken(fd),
        () => {
          // onError durante a montagem (iframe/3DS bloqueado) → fallback.
          if (!this.mpBrick) this.criarCobrancaHospedada();
          else this.toast.erro('Não foi possível carregar o formulário do cartão.');
        },
      );
    } catch {
      this.criarCobrancaHospedada();
    } finally {
      this.mpBrickMontando = false;
    }
  }

  /** Valor da cobrança — do pagamento existente ou do pedido carregado. */
  private totalPedido = 0;

  /** onSubmit do Brick → cobrança com o token de uso único (sem PAN/CVV). */
  private async pagarComToken(fd: MpCardFormData): Promise<void> {
    if (!fd.token || this.pagandoCartao()) return;
    this.pagandoCartao.set(true);
    try {
      const pg = await this.pagamentos.criar({
        pedidoId: this.pedidoId,
        method: 'CREDIT_CARD',
        // Mesma chave-base do checkout: a cadeia -r2/-r3 cobre a retentativa
        // após recusa (idempotente — nunca duplica cobrança).
        idempotencyKey: `pedido-${this.pedidoId}-credit_card`,
        cardToken: fd.token,
        installments: fd.installments,
        paymentMethodId: fd.payment_method_id,
        issuerId: fd.issuer_id != null ? String(fd.issuer_id) : undefined,
        identificationType: fd.payer?.identification?.type,
        identificationNumber: fd.payer?.identification?.number,
      });
      await this.mpBrick?.unmount().catch(() => {});
      this.mpBrick = null;
      this.pagamento.set(pg);
      if (pg.status === 'FAILED') {
        this.toast.erro(pg.failureMessage ?? 'Pagamento recusado pelo emissor.');
      }
    } catch {
      this.toast.erro('Não foi possível processar o pagamento. Tente novamente.');
    } finally {
      this.pagandoCartao.set(false);
    }
  }

  /** Recusa → volta ao Brick para tentar outro cartão (nova cobrança -rN). */
  tentarOutroCartao(): void {
    void this.mpBrick?.unmount().catch(() => {});
    this.mpBrick = null;
    this.pagamento.set(null);
  }

  private carregarPedido(): void {
    this.conta
      .pedido(this.pedidoId)
      .then((p) => {
        this.numero.set(p.numero);
        this.statusPedido.set(p.status);
        this.totalPedido = Number(p.total) || 0;
      })
      .catch(() => {});
  }

  private carregarPagamento(): void {
    // Falha de rede virava "sem cobrança" silencioso — sinaliza o erro
    // para a tela poder dizer que não conseguiu carregar.
    this.erroPagamento.set(false);
    this.pagamentos
      .doPedido(this.pedidoId)
      .then((lista) => {
        const pg = this.maisRelevante(lista);
        // Cobrança criada por outra via (admin/SSE) com o Brick aberto —
        // desmonta para não mostrar dois instrumentos ao mesmo tempo.
        if (pg && pg !== this.pagamento() && this.mpBrick) {
          void this.mpBrick.unmount().catch(() => {});
          this.mpBrick = null;
        }
        this.pagamento.set(pg);
        if (pg) this.totalPedido = Number(pg.amount) || this.totalPedido;
      })
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
