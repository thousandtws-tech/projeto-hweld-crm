import type { ReactNode } from "react";

export function SectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] p-4 sm:p-5 lg:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

const SUCCESS = "bg-[#26488C] text-[#F2F2F2] dark:bg-[#88ABF2] dark:text-[#272728]";
const WARN = "bg-[var(--pill-warn-bg)] text-[var(--pill-warn-fg)]";
const DANGER = "bg-[var(--pill-danger-bg)] text-[var(--pill-danger-fg)]";
const INFO = "bg-[var(--pill-info-bg)] text-[var(--pill-info-fg)]";
const NEUTRAL = "bg-secondary text-muted-foreground";

const statusStyles: Record<string, string> = {
  // pedidos
  aguardando_pagamento: WARN,
  confirmado: SUCCESS,
  em_separacao: INFO,
  faturado: INFO,
  enviado: INFO,
  entregue: SUCCESS,
  concluido: SUCCESS,
  cancelado: NEUTRAL,
  // orçamentos
  rascunho: NEUTRAL,
  em_analise: WARN,
  aprovado: SUCCESS,
  recusado: DANGER,
  expirado: NEUTRAL,
  convertido: SUCCESS,
  // oportunidades
  lead: INFO,
  qualificacao: INFO,
  proposta: WARN,
  negociacao: WARN,
  ganha: SUCCESS,
  perdida: DANGER,
  // OS
  aberta: INFO,
  em_andamento: WARN,
  aguardando_material: WARN,
  concluida: SUCCESS,
  cancelada: NEUTRAL,
  // NF
  autorizada: SUCCESS,
  rejeitada: DANGER,
  denegada: DANGER,
  // pagamentos
  pendente: WARN,
  pago: SUCCESS,
  vencido: DANGER,
  estornado: NEUTRAL,
  // cadastros
  ativo: SUCCESS,
  inativo: NEUTRAL,
  prospecto: INFO,
  urgente: DANGER,
  alta: WARN,
  normal: INFO,
  baixa: NEUTRAL,
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  const cls = statusStyles[key] ?? NEUTRAL;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}

export function StatCard({
  label,
  value,
  delta,
  trend = "up",
  icon,
  sub,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon?: ReactNode;
  sub?: string;
}) {
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <SectionCard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="grid place-items-center w-8 h-8 rounded-full bg-secondary">{icon}</div>
          )}
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      </div>
      <div className="mt-4 text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta && (
          <span className={`${trendColor} font-semibold`}>
            {arrow} {delta}
          </span>
        )}
        {sub && <span className="text-muted-foreground">{sub}</span>}
      </div>
    </SectionCard>
  );
}

export function Sparkline({
  points,
  color = "var(--success)",
}: {
  points: number[];
  color?: string;
}) {
  const w = 120;
  const h = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - ((p - min) / range) * h}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10">
      <path d={area} fill={color} opacity="0.15" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={w}
        cy={h - ((points[points.length - 1] - min) / range) * h}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}
