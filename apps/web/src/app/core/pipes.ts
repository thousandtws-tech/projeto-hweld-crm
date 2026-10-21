import { Pipe, PipeTransform } from '@angular/core';

// Formatters são custosos de construir (~µs cada) — instâncias únicas
// compartilhadas por todos os transforms (thread-safe por spec).
const FMT_BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const FMT_QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** `Dinheiro` (string decimal "1234.56") → "R$ 1.234,56". Nunca parseFloat na regra. */
@Pipe({ name: 'brl', standalone: true })
export class BrlPipe implements PipeTransform {
  transform(valor: string | null | undefined): string {
    if (!valor) return '—';
    const n = Number(valor);
    if (!Number.isFinite(n)) return '—';
    return FMT_BRL.format(n);
  }
}

/** `Quantidade` string + unidade → "1,500 kg". */
@Pipe({ name: 'qty', standalone: true })
export class QtyPipe implements PipeTransform {
  transform(qtd: string | null | undefined, unidade?: string | null): string {
    if (!qtd) return '—';
    const n = Number(qtd);
    if (!Number.isFinite(n)) return '—';
    const fmt = FMT_QTD.format(n);
    return unidade ? `${fmt} ${unidade}` : fmt;
  }
}

/** Label amigável para StatusPedido. */
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  private static mapa: Record<string, string> = {
    aguardando_pagamento: 'Aguardando pagamento',
    confirmado: 'Confirmado',
    em_separacao: 'Em separação',
    faturado: 'Faturado',
    enviado: 'Enviado',
    entregue: 'Entregue',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  };
  transform(status: string | null | undefined): string {
    return StatusLabelPipe.mapa[status ?? ''] ?? status ?? '—';
  }
}

/** Humaniza textos de notificações, substituindo enums técnicos por rótulos amigáveis. */
@Pipe({ name: 'humanizeNotif', standalone: true })
export class HumanizeNotifPipe implements PipeTransform {
  transform(mensagem: string | null | undefined): string {
    if (!mensagem) return '';
    return mensagem
      .replace(/aguardando_pagamento/g, 'Aguardando pagamento')
      .replace(/em_separacao/g, 'Em separação')
      .replace(/faturado/g, 'Faturado')
      .replace(/confirmado/g, 'Confirmado')
      .replace(/enviado/g, 'Enviado')
      .replace(/entregue/g, 'Entregue')
      .replace(/concluido/g, 'Concluído')
      .replace(/cancelado/g, 'Cancelado');
  }
}
