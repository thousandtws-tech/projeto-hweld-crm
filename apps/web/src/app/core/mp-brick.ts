import { Injectable } from '@angular/core';

/** formData do Brick cardPayment — subconjunto que a HWeld usa. */
export interface MpCardFormData {
  token: string;
  issuer_id?: string | number;
  payment_method_id?: string;
  installments?: number;
  payer?: { identification?: { type?: string; number?: string } };
}

export interface MpBrickController {
  unmount: () => Promise<void>;
}

interface MpCtor {
  new (k: string, o?: object): {
    bricks: () => {
      create: (t: string, c: string, o: object) => Promise<MpBrickController>;
    };
  };
}

/**
 * Carregamento e montagem do Card Payment Brick do Mercado Pago (SDK js/v2).
 * O SDK tokeniza PAN/CVV direto no MP — o backend HWeld só recebe o token
 * de uso único, nunca dados do cartão (PCI SAQ-A).
 */
@Injectable({ providedIn: 'root' })
export class MpBrickService {
  private sdkPromise: Promise<void> | null = null;

  /** Injeta `sdk.mercadopago.com/js/v2` uma única vez (CSP já o libera). */
  carregarSdk(): Promise<void> {
    if (typeof (window as { MercadoPago?: unknown }).MercadoPago === 'function') {
      return Promise.resolve();
    }
    this.sdkPromise ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://sdk.mercadopago.com/js/v2';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('falha ao carregar o SDK do Mercado Pago'));
      document.head.appendChild(s);
    });
    return this.sdkPromise;
  }

  /** Monta o Brick no container (id sem `#`). `amount` define a grade de parcelas. */
  async montar(
    containerId: string,
    amount: number,
    publicKey: string,
    onSubmit: (formData: MpCardFormData) => void,
    onError: () => void,
  ): Promise<MpBrickController> {
    await this.carregarSdk();
    const MP = (window as unknown as { MercadoPago: MpCtor }).MercadoPago;
    const bricks = new MP(publicKey, { locale: 'pt-BR' }).bricks();
    return bricks.create('cardPayment', containerId, {
      initialization: { amount },
      customization: { visual: { hidePaymentButton: false } },
      callbacks: {
        onReady: () => {},
        onSubmit,
        onError,
      },
    });
  }
}
