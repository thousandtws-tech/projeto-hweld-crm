import { Pipe, PipeTransform } from '@angular/core';

/** `Dinheiro` (string decimal "1234.56") → "R$ 1.234,56". Nunca parseFloat na regra. */
@Pipe({ name: 'brl', standalone: true })
export class BrlPipe implements PipeTransform {
  transform(valor: string | null | undefined): string {
    if (!valor) return '—';
    const n = Number(valor);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
}

/** `Quantidade` string + unidade → "1,500 kg". */
@Pipe({ name: 'qty', standalone: true })
export class QtyPipe implements PipeTransform {
  transform(qtd: string | null | undefined, unidade?: string | null): string {
    if (!qtd) return '—';
    const n = Number(qtd);
    if (!Number.isFinite(n)) return '—';
    const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n);
    return unidade ? `${fmt} ${unidade}` : fmt;
  }
}

/** Label amigável para os enums de status do backoffice. */
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  private static mapa: Record<string, string> = {
    // pedidos
    aguardando_pagamento: 'Aguardando pagamento',
    confirmado: 'Confirmado',
    em_separacao: 'Em separação',
    faturado: 'Faturado',
    enviado: 'Enviado',
    entregue: 'Entregue',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
    // orçamentos
    rascunho: 'Rascunho',
    em_analise: 'Em análise',
    aprovado: 'Aprovado',
    recusado: 'Recusado',
    expirado: 'Expirado',
    convertido: 'Convertido',
    // oportunidades
    lead: 'Lead',
    qualificacao: 'Qualificação',
    proposta: 'Proposta',
    negociacao: 'Negociação',
    ganha: 'Ganha',
    perdida: 'Perdida',
    // OS
    aberta: 'Aberta',
    em_andamento: 'Em andamento',
    aguardando_material: 'Aguardando material',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
    // NF
    autorizada: 'Autorizada',
    rejeitada: 'Rejeitada',
    denegada: 'Denegada',
    // pagamentos
    pendente: 'Pendente',
    pago: 'Pago',
    vencido: 'Vencido',
    estornado: 'Estornado',
  };
  transform(status: string | null | undefined): string {
    return StatusLabelPipe.mapa[status ?? ''] ?? status ?? '—';
  }
}
