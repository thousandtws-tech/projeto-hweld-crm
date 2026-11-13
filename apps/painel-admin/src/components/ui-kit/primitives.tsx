import type { ReactNode } from "react";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

export function SectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={className}
      variant="outlined"
      sx={{ borderRadius: "8px", p: { xs: 2, sm: 2.5, lg: 3 }, boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </Card>
  );
}

/** Card estilo metabox (WooCommerce): barra de título separada por divisor + corpo. */
export function Metabox({
  title,
  action,
  children,
  className = "",
  contentClassName = "p-5 sm:p-6",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card
      variant="outlined"
      className={className}
      sx={{ borderRadius: "8px", boxShadow: "var(--shadow-card)", overflow: "hidden" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "rgba(0,0,0,0.015)",
          px: { xs: 2, sm: 2.5 },
          py: 1.25,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600} color="text.primary">
          {title}
        </Typography>
        {action}
      </Box>
      <div className={contentClassName}>{children}</div>
    </Card>
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
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      alignItems={{ sm: "center" }}
      justifyContent="space-between"
      sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}
    >
      <Box minWidth={0}>
        <Typography
          variant="h5"
          component="h1"
          noWrap
          fontWeight={700}
          letterSpacing="-0.02em"
          sx={{ fontSize: { xs: 20, sm: 24 } }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" noWrap mt={0.25}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap flexShrink={0}>
          {action}
        </Stack>
      )}
    </Stack>
  );
}

type PillTone = "primary" | "warning" | "error" | "info" | "default";

const statusTones: Record<string, PillTone> = {
  // pedidos
  aguardando_pagamento: "warning",
  confirmado: "primary",
  em_separacao: "info",
  faturado: "info",
  enviado: "info",
  entregue: "primary",
  concluido: "primary",
  cancelado: "default",
  // orçamentos
  rascunho: "default",
  em_analise: "warning",
  aprovado: "primary",
  recusado: "error",
  expirado: "default",
  convertido: "primary",
  // oportunidades
  lead: "info",
  qualificacao: "info",
  proposta: "warning",
  negociacao: "warning",
  ganha: "primary",
  perdida: "error",
  // OS
  aberta: "info",
  em_andamento: "warning",
  aguardando_material: "warning",
  concluida: "primary",
  cancelada: "default",
  // NF
  autorizada: "primary",
  rejeitada: "error",
  denegada: "error",
  // documentos fiscais (operations-api — StatusFiscalDocumento)
  requested: "info",
  processing: "info",
  authorized: "primary",
  rejected: "error",
  cancelled: "default",
  cancellation_pending: "warning",
  requires_reconciliation: "warning",
  error: "error",
  // pagamentos
  pendente: "warning",
  pago: "primary",
  vencido: "error",
  estornado: "default",
  // cadastros
  ativo: "primary",
  inativo: "default",
  prospecto: "info",
  urgente: "error",
  alta: "warning",
  normal: "info",
  baixa: "default",
};

const toneSx: Record<PillTone, SxProps<Theme>> = {
  primary: { bgcolor: "#26488c", color: "#f2f2f2" },
  warning: { bgcolor: "rgb(217 72 110 / 0.14)", color: "#d9486e" },
  error: { bgcolor: "rgb(217 37 70 / 0.14)", color: "#d92546" },
  info: { bgcolor: "rgb(136 171 242 / 0.18)", color: "#26488c" },
  default: { bgcolor: "action.hover", color: "text.secondary" },
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = statusTones[status.toLowerCase()] ?? "default";
  return (
    <Chip
      size="small"
      sx={{
        ...toneSx[tone],
        textTransform: "capitalize",
        fontSize: 12,
        height: 26,
        "& .MuiChip-label": { px: 1 },
      }}
      icon={
        <Box
          component="span"
          sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor", opacity: 0.7 }}
        />
      }
      label={label ?? status.replaceAll("_", " ")}
    />
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
    trend === "up" ? "primary.main" : trend === "down" ? "error.main" : "text.secondary";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <SectionCard>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1}>
          {icon && (
            <Box
              sx={{
                display: "grid",
                placeItems: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                bgcolor: "action.hover",
              }}
            >
              {icon}
            </Box>
          )}
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Stack>
      </Stack>
      <Typography variant="h4" fontWeight={700} letterSpacing="-0.02em" mt={2}>
        {value}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={1} mt={1}>
        {delta && (
          <Typography variant="caption" fontWeight={600} sx={{ color: trendColor }}>
            {arrow} {delta}
          </Typography>
        )}
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
      </Stack>
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
