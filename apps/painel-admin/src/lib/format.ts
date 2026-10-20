/** `Dinheiro` (string decimal "1234.56") → "R$ 1.234,56". Nunca parseFloat na regra. */
export function brl(valor: string | null | undefined): string {
  if (!valor) return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

/** `Quantidade` string + unidade → "1,500 kg". */
export function qty(qtd: string | null | undefined, unidade?: string | null): string {
  if (!qtd) return "—";
  const n = Number(qtd);
  if (!Number.isFinite(n)) return "—";
  const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
  return unidade ? `${fmt} ${unidade}` : fmt;
}

const STATUS_LABELS: Record<string, string> = {
  // pedidos
  aguardando_pagamento: "Aguardando pagamento",
  confirmado: "Confirmado",
  em_separacao: "Em separação",
  faturado: "Faturado",
  enviado: "Enviado",
  entregue: "Entregue",
  concluido: "Concluído",
  cancelado: "Cancelado",
  // orçamentos
  rascunho: "Rascunho",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
  convertido: "Convertido",
  // oportunidades
  lead: "Lead",
  qualificacao: "Qualificação",
  proposta: "Proposta",
  negociacao: "Negociação",
  ganha: "Ganha",
  perdida: "Perdida",
  // OS
  aberta: "Aberta",
  em_andamento: "Em andamento",
  aguardando_material: "Aguardando material",
  concluida: "Concluída",
  cancelada: "Cancelada",
  // NF
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  denegada: "Denegada",
  // pagamentos
  pendente: "Pendente",
  pago: "Pago",
  vencido: "Vencido",
  estornado: "Estornado",
  // empresa / usuário
  ativo: "Ativo",
  inativo: "Inativo",
  prospecto: "Prospecto",
  // documentos fiscais (operations-api)
  requested: "Solicitado",
  processing: "Em processamento",
  authorized: "Autorizado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
  cancellation_pending: "Cancelamento pendente",
  requires_reconciliation: "Requer reconciliação",
  error: "Erro",
};

/** Label amigável para os enums de status do backoffice. */
export function statusLabel(status: string | null | undefined): string {
  return STATUS_LABELS[status ?? ""] ?? status ?? "—";
}

export function fmtData(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export function fmtDataHora(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** ISO → tempo relativo curto ("agora", "há 5 min", "há 2 h", "há 3 d"). */
export function tempoRelativo(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return "—";
  const diffMin = Math.floor((Date.now() - ms) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `há ${diffD} d`;
  return fmtData(v);
}

export function fmtDataHoraCompleta(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
