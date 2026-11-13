import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Inbox, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { brl, fmtData, qty, statusLabel } from "@/lib/format";
import type {
  Caixa,
  Empresa,
  EstagioOportunidade,
  Oportunidade,
  Orcamento,
  OrdemServico,
  Pagamento,
  Pagina,
  Pedido,
  SaldoAbaixoMinimo,
} from "@/lib/models";
import {
  crmService,
  dashboardService,
  financeiroService,
  orcamentosService,
  osService,
  pedidosService,
} from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useAuth } from "@/store/auth-store";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const ESTAGIOS_ATIVOS: EstagioOportunidade[] = ["lead", "qualificacao", "proposta", "negociacao"];

const PROBABILIDADE_ESTAGIO: Record<EstagioOportunidade, number> = {
  lead: 0.1,
  qualificacao: 0.25,
  proposta: 0.55,
  negociacao: 0.8,
  ganha: 1.0,
  perdida: 0.0,
};

const COR_ESTAGIO: Record<EstagioOportunidade, string> = {
  lead: "#A0C4F2",
  qualificacao: "#88ABF2",
  proposta: "#26488C",
  negociacao: "#D9486E",
  ganha: "#26488C",
  perdida: "#D92546",
};

const EVENTOS = [
  "pedido.criado",
  "pedido.status_alterado",
  "orcamento.criado",
  "orcamento.status_alterado",
  "orcamento.convertido",
  "oportunidade.estagio",
  "empresa.criada",
  "empresa.atualizada",
  "empresa.arquivada",
  "catalogo.produtos",
  "catalogo.categorias",
  "catalogo.precos",
  "estoque.movimentado",
  "pagamento.parcelas",
  "pagamento.baixado",
  "pagamento.estornado",
  "caixa.aberto",
  "caixa.movimento",
  "caixa.fechado",
  "os.criada",
  "os.status_alterada",
  "fiscal.nota_emitida",
  "fiscal.nota_autorizada",
  "fiscal.nota_cancelada",
];

// Referência estável para `q.data?.itens ?? LISTA_VAZIA` — evita que
// arrays literais `[]` invalidem os useMemo dependentes a cada render.
const LISTA_VAZIA: never[] = [];

const PAGINA_VAZIA: Pagina<never> = {
  itens: [],
  total: 0,
  pagina: 1,
  por_pagina: 0,
  total_paginas: 0,
};
const vazio = <T,>() => Promise.resolve(PAGINA_VAZIA as Pagina<T>);

const STATUS_PEDIDO = [
  "aguardando_pagamento",
  "confirmado",
  "em_separacao",
  "faturado",
  "enviado",
  "entregue",
  "concluido",
  "cancelado",
];

const MESES_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const CORES_STATUS: Record<string, string> = {
  aguardando_pagamento: "#D9486E",
  confirmado: "#88ABF2",
  em_separacao: "#A0C4F2",
  faturado: "#26488C",
  enviado: "#88ABF2",
  entregue: "#26488C",
  concluido: "var(--primary)",
  cancelado: "#D92546",
};

const eixo = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
  tickLine: false as const,
  axisLine: false,
};
const grade = { stroke: "var(--border)", strokeDasharray: "3 3" };
const tooltipCss = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  fontSize: "12px",
};

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function diasDesde(iso: string | null | undefined): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function diasAte(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

/* ---------------------------------------------------------------------------
 * 1. Série de Receita + Tendência Suavizada (EWMA + OLS) + Projeção do Mês
 * ------------------------------------------------------------------------- */

export interface PontoReceita {
  mes: string;
  receita: number;
  tendencia: number;
}

function calcularSerieReceita(pedidos: Pedido[], janelaMeses: number) {
  const agora = new Date();
  const buckets: { rotulo: string; receita: number }[] = [];

  for (let i = janelaMeses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    buckets.push({ rotulo: MESES_PT[d.getMonth()], receita: 0 });
  }

  const inicioJanela = new Date(
    agora.getFullYear(),
    agora.getMonth() - (janelaMeses - 1),
    1,
  ).getTime();

  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const d = new Date(p.created_at);
    if (Number.isNaN(d.getTime()) || d.getTime() < inicioJanela) continue;
    const idx =
      (d.getFullYear() - agora.getFullYear()) * 12 +
      d.getMonth() -
      agora.getMonth() +
      (janelaMeses - 1);
    if (idx >= 0 && idx < janelaMeses) {
      buckets[idx].receita += num(p.total);
    }
  }

  const alpha = 0.45;
  let ewma = buckets[0]?.receita ?? 0;

  const n = buckets.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  buckets.forEach((b, x) => {
    sumX += x;
    sumY += b.receita;
    sumXY += x * b.receita;
    sumXX += x * x;
  });
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = n > 0 ? (sumY - slope * sumX) / n : 0;

  const diaAtual = Math.max(1, agora.getDate());
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const receitaMesAtual = buckets[buckets.length - 1]?.receita ?? 0;
  const receitaMesAnterior = buckets[buckets.length - 2]?.receita ?? 0;
  const runRateBruto = (receitaMesAtual / diaAtual) * diasNoMes;
  const regressaoUltimo = Math.max(0, intercept + slope * (n - 1));
  const projecaoFimDoMes =
    receitaMesAtual > 0
      ? Math.max(receitaMesAtual, runRateBruto * 0.65 + regressaoUltimo * 0.35)
      : Math.max(0, regressaoUltimo);

  const deltaMoM =
    receitaMesAnterior > 0
      ? ((receitaMesAtual - receitaMesAnterior) / receitaMesAnterior) * 100
      : receitaMesAtual > 0
        ? 100
        : 0;

  const serie: PontoReceita[] = buckets.map((b, i) => {
    ewma = i === 0 ? b.receita : alpha * b.receita + (1 - alpha) * ewma;
    const regVal = Math.max(0, intercept + slope * i);
    return {
      mes: b.rotulo,
      receita: Math.round(b.receita * 100) / 100,
      tendencia: Math.round((ewma * 0.6 + regVal * 0.4) * 100) / 100,
    };
  });

  return {
    serie,
    receitaMesAtual,
    projecaoFimDoMes,
    deltaMoM,
  };
}

/* ---------------------------------------------------------------------------
 * 2. Métricas de Pipeline e Velocidade de Vendas
 * ------------------------------------------------------------------------- */

function calcularPipelineMetrics(ops: Oportunidade[]) {
  const abertas = ops.filter((o) => !["ganha", "perdida"].includes(o.estagio));
  const ganhas = ops.filter((o) => o.estagio === "ganha");
  const perdidas = ops.filter((o) => o.estagio === "perdida");

  const pipelineBruto = abertas.reduce((acc, o) => acc + num(o.valor_estimado), 0);
  const forecastPonderado = abertas.reduce(
    (acc, o) => acc + num(o.valor_estimado) * (PROBABILIDADE_ESTAGIO[o.estagio] ?? 0.1),
    0,
  );

  const fechadasTotal = ganhas.length + perdidas.length;
  const winRateReal =
    fechadasTotal > 0
      ? ganhas.length / fechadasTotal
      : abertas.length > 0
        ? forecastPonderado / Math.max(1, pipelineBruto)
        : 0;

  const comValor = [...abertas, ...ganhas].filter((o) => num(o.valor_estimado) > 0);
  const ticketMedio =
    comValor.length > 0
      ? comValor.reduce((acc, o) => acc + num(o.valor_estimado), 0) / comValor.length
      : 0;

  const idades = ops.map((o) => diasDesde(o.created_at || o.updated_at)).filter((d) => d > 0);
  const cicloMedioDias =
    idades.length > 0
      ? Math.max(7, Math.round(idades.reduce((a, b) => a + b, 0) / idades.length))
      : 21;

  const velocidadeMensal =
    ((abertas.length * ticketMedio * Math.max(0.15, winRateReal)) / Math.max(1, cicloMedioDias)) *
    30;

  return {
    abertasCount: abertas.length,
    pipelineBruto,
    forecastPonderado,
    winRatePct: Math.round(winRateReal * 100),
    ticketMedio,
    cicloMedioDias,
    velocidadeMensal,
  };
}

/* ---------------------------------------------------------------------------
 * 3. Curva ABC (80/15/5) de Clientes
 * ------------------------------------------------------------------------- */

export interface ClienteAbc {
  empresaId: number;
  nome: string;
  receitaTotal: number;
  pedidosCount: number;
  recenciaDias: number;
  classeAbc: "A" | "B" | "C";
  participacaoPct: number;
}

function calcularCurvaAbc(pedidos: Pedido[], empresasMap: Map<number, string>): ClienteAbc[] {
  const validos = pedidos.filter((p) => p.status !== "cancelado");
  const porEmpresa = new Map<number, { receita: number; count: number; ultimaDataMs: number }>();

  let receitaGlobal = 0;
  for (const p of validos) {
    const val = num(p.total);
    receitaGlobal += val;
    const ms = new Date(p.created_at).getTime() || Date.now();
    const atual = porEmpresa.get(p.empresa_id) ?? { receita: 0, count: 0, ultimaDataMs: 0 };
    atual.receita += val;
    atual.count += 1;
    if (ms > atual.ultimaDataMs) atual.ultimaDataMs = ms;
    porEmpresa.set(p.empresa_id, atual);
  }

  const ordenados = [...porEmpresa.entries()].sort((a, b) => b[1].receita - a[1].receita);
  let acumulado = 0;

  return ordenados.map(([empresaId, dados]) => {
    acumulado += dados.receita;
    const propAcumulada = receitaGlobal > 0 ? acumulado / receitaGlobal : 1;
    const classeAbc: "A" | "B" | "C" =
      propAcumulada <= 0.8 ? "A" : propAcumulada <= 0.95 ? "B" : "C";

    const recenciaDias = Math.max(
      0,
      Math.floor((Date.now() - dados.ultimaDataMs) / (1000 * 60 * 60 * 24)),
    );

    return {
      empresaId,
      nome: empresasMap.get(empresaId) ?? `Empresa #${empresaId}`,
      receitaTotal: dados.receita,
      pedidosCount: dados.count,
      recenciaDias,
      classeAbc,
      participacaoPct: receitaGlobal > 0 ? (dados.receita / receitaGlobal) * 100 : 0,
    };
  });
}

/* ---------------------------------------------------------------------------
 * 4. Cobertura e Reposição de Estoque
 * ------------------------------------------------------------------------- */

export interface ItemRuptura {
  produtoId: number;
  sku: string;
  nome: string;
  unidade: string | null;
  disponivel: number;
  minimo: number;
  coberturaPct: number;
  custoReposicao: number;
  zerado: boolean;
}

function analisarEstoque(itens: SaldoAbaixoMinimo[]) {
  let custoTotalReposicao = 0;
  const processados: ItemRuptura[] = itens.map(({ produto, saldo }) => {
    const disponivel = num(saldo.quantidade_disponivel);
    const minimo = Math.max(1, num(produto.estoque_minimo));
    const deficit = Math.max(0, minimo - disponivel);
    const coberturaPct = Math.max(0, Math.min(100, Math.round((disponivel / minimo) * 100)));
    const custoUnit = num(produto.preco_custo) || num(produto.preco_venda) * 0.6;
    const custoReposicao = deficit * custoUnit;
    custoTotalReposicao += custoReposicao;

    return {
      produtoId: produto.id,
      sku: produto.sku,
      nome: produto.nome,
      unidade: produto.unidade_medida,
      disponivel,
      minimo,
      coberturaPct,
      custoReposicao,
      zerado: disponivel <= 0,
    };
  });

  processados.sort(
    (a, b) => a.coberturaPct - b.coberturaPct || b.custoReposicao - a.custoReposicao,
  );

  return {
    itens: processados,
    custoTotalReposicao,
    zeradosCount: processados.filter((i) => i.zerado).length,
  };
}

function serieStatus(pedidos: Pedido[]) {
  const contagem = new Map<string, number>();
  const valorPorStatus = new Map<string, number>();
  for (const p of pedidos) {
    contagem.set(p.status, (contagem.get(p.status) ?? 0) + 1);
    valorPorStatus.set(p.status, (valorPorStatus.get(p.status) ?? 0) + num(p.total));
  }
  return STATUS_PEDIDO.map((s) => ({
    slug: s,
    status: statusLabel(s),
    pedidos: contagem.get(s) ?? 0,
    valor: valorPorStatus.get(s) ?? 0,
  })).filter((d) => d.pedidos > 0);
}

function DashboardPage() {
  const { pode } = useAuth();
  const temFinanceiro = pode("admin", "financeiro");
  const temOperacao = pode("admin", "tecnico");
  const queryClient = useQueryClient();

  const [janelaMeses, setJanelaMeses] = useState<3 | 6 | 12>(6);

  // Widgets independentes: cada dataset é uma query própria — todas disparam
  // em paralelo (sem waterfall financeiro/operação), cacheiam por recurso e
  // o SSE invalida apenas o widget afetado pelo evento, não a página inteira.
  const qPedidosRecentes = useQuery({
    queryKey: ["dash", "pedidos", "recentes"],
    queryFn: () => dashboardService.pedidosRecentes().catch(() => vazio<Pedido>()),
  });
  const qPedidosJanela = useQuery({
    queryKey: ["dash", "pedidos", "janela"],
    queryFn: () => pedidosService.listar({ por_pagina: 100 }).catch(() => vazio<Pedido>()),
  });
  const qEmpresas = useQuery({
    queryKey: ["dash", "empresas"],
    queryFn: () => crmService.empresas({ por_pagina: 100 }).catch(() => vazio<Empresa>()),
  });
  const qPipeline = useQuery({
    queryKey: ["dash", "pipeline"],
    queryFn: () => dashboardService.oportunidadesAbertas().catch(() => vazio<Oportunidade>()),
  });
  const qEstoque = useQuery({
    queryKey: ["dash", "estoque"],
    queryFn: () => dashboardService.estoqueBaixo().catch(() => vazio<SaldoAbaixoMinimo>()),
  });
  const qOrcamentos = useQuery({
    queryKey: ["dash", "orcamentos"],
    queryFn: () => orcamentosService.listar({ por_pagina: 100 }).catch(() => vazio<Orcamento>()),
  });
  const qPagamentos = useQuery({
    queryKey: ["dash", "financeiro", "pagamentos"],
    queryFn: () => financeiroService.pagamentos({ por_pagina: 100 }).catch(() => vazio<Pagamento>()),
    enabled: temFinanceiro,
  });
  const qCaixa = useQuery({
    queryKey: ["dash", "financeiro", "caixa"],
    queryFn: () => financeiroService.caixaAberto().catch(() => null),
    enabled: temFinanceiro,
  });
  const qOrdens = useQuery({
    queryKey: ["dash", "ordens"],
    queryFn: () => osService.listar({ por_pagina: 50 }).catch(() => vazio<OrdemServico>()),
    enabled: temOperacao,
  });

  const widgets = [
    qPedidosRecentes,
    qPedidosJanela,
    qEmpresas,
    qPipeline,
    qEstoque,
    qOrcamentos,
    ...(temFinanceiro ? [qPagamentos, qCaixa] : []),
    ...(temOperacao ? [qOrdens] : []),
  ];
  // Skeleton só quando nenhum dado existe ainda — refetch em background
  // mantém os widgets renderizados (sem "piscar" a página inteira).
  const carregando = widgets.every((q) => q.isPending);

  const pedidosRecentes = qPedidosRecentes.data?.itens ?? LISTA_VAZIA;
  const pedidosJanela = qPedidosJanela.data?.itens ?? LISTA_VAZIA;
  const pipeline = qPipeline.data?.itens ?? LISTA_VAZIA;
  const orcamentos = qOrcamentos.data?.itens ?? LISTA_VAZIA;
  const estoqueBaixo = qEstoque.data?.itens ?? LISTA_VAZIA;
  const pagamentos = qPagamentos.data?.itens ?? LISTA_VAZIA;
  const caixaAberto = qCaixa.data ?? null;
  const ordensServico = qOrdens.data?.itens ?? LISTA_VAZIA;

  const empresasMap = useMemo(
    () =>
      new Map(
        (qEmpresas.data?.itens ?? LISTA_VAZIA).map((e) => [
          e.id,
          e.nome_fantasia || e.razao_social,
        ]),
      ),
    [qEmpresas.data],
  );

  const invalidar = (grupo: string) =>
    void queryClient.invalidateQueries({ queryKey: ["dash", grupo] });
  const recarregarTudo = () => invalidar("");

  // SSE → invalida só o widget do domínio afetado (coalescido pelo hook).
  useRealtimeEvent(EVENTOS, (e) => {
    const t = e.tipo;
    if (t.startsWith("pedido.")) invalidar("pedidos");
    else if (t.startsWith("orcamento.")) invalidar("orcamentos");
    else if (t.startsWith("oportunidade.")) invalidar("pipeline");
    else if (t.startsWith("empresa.")) invalidar("empresas");
    else if (t.startsWith("catalogo.") || t.startsWith("estoque.")) invalidar("estoque");
    else if (t.startsWith("pagamento.") || t.startsWith("caixa.") || t.startsWith("fiscal."))
      invalidar("financeiro");
    else if (t.startsWith("os.")) invalidar("ordens");
  });

  const receita = useMemo(
    () => calcularSerieReceita(pedidosJanela, janelaMeses),
    [pedidosJanela, janelaMeses],
  );

  const funil = useMemo(() => calcularPipelineMetrics(pipeline), [pipeline]);

  const clientesAbc = useMemo(
    () => calcularCurvaAbc(pedidosJanela, empresasMap),
    [pedidosJanela, empresasMap],
  );

  const estoque = useMemo(() => analisarEstoque(estoqueBaixo), [estoqueBaixo]);

  const resumoFinanceiro = useMemo(() => {
    let recebido = 0;
    let aReceber = 0;
    let vencido = 0;
    for (const p of pagamentos) {
      const v = num(p.valor);
      if (p.status === "pago") recebido += v;
      else if (p.status === "vencido") vencido += v;
      else if (p.status === "pendente") {
        const d = diasAte(p.vencimento);
        if (d !== null && d < 0) vencido += v;
        else aReceber += v;
      }
    }
    return { recebido, aReceber, vencido };
  }, [pagamentos]);

  const resumoOs = useMemo(() => {
    const abertas = ordensServico.filter(
      (o) => o.status !== "concluida" && o.status !== "cancelada",
    );
    const urgentes = abertas.filter((o) => o.prioridade === "urgente" || o.prioridade === "alta");
    return { abertasCount: abertas.length, urgentesCount: urgentes.length };
  }, [ordensServico]);

  const orcamentosAprovados = useMemo(
    () => orcamentos.filter((o) => o.status === "aprovado"),
    [orcamentos],
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da operação"
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-border bg-card p-1 text-xs">
              {([3, 6, 12] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setJanelaMeses(m)}
                  className={`rounded-full px-3 py-1 font-medium transition ${
                    janelaMeses === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}M
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={recarregarTudo}
              aria-label="Atualizar"
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {/* 1. Indicadores Principais — tipografia limpa, sem ícones decorativos */}
      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${
          carregando ? "opacity-70" : ""
        }`}
      >
        <Link to="/vendas/pedidos">
          <SectionCard className="h-full transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Receita no mês</span>
              {receita.deltaMoM !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
                    receita.deltaMoM > 0 ? "text-primary" : "text-[#D92546]"
                  }`}
                >
                  {receita.deltaMoM > 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                  {Math.abs(receita.deltaMoM).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
              {brl(receita.receitaMesAtual.toFixed(2))}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Projeção mensal: {brl(receita.projecaoFimDoMes.toFixed(2))}
            </div>
          </SectionCard>
        </Link>

        <Link to="/crm/oportunidades">
          <SectionCard className="h-full transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Pipeline ponderado</span>
              <span className="tabular-nums">{funil.abertasCount} abertas</span>
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
              {brl(funil.forecastPonderado.toFixed(2))}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Total bruto: {brl(funil.pipelineBruto.toFixed(2))}
            </div>
          </SectionCard>
        </Link>

        <Link to="/crm/oportunidades">
          <SectionCard className="h-full transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Ritmo comercial (30d)</span>
              <span className="tabular-nums">Conversão {funil.winRatePct}%</span>
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
              {brl(funil.velocidadeMensal.toFixed(2))}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Ticket médio: {brl(funil.ticketMedio.toFixed(2))} · Ciclo {funil.cicloMedioDias}d
            </div>
          </SectionCard>
        </Link>

        <Link to="/estoque">
          <SectionCard className="h-full transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Abaixo do mínimo</span>
              {estoque.zeradosCount > 0 && (
                <span className="font-semibold text-[#D92546]">
                  {estoque.zeradosCount} zerado(s)
                </span>
              )}
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
              {estoque.itens.length}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Reposição estimada: {brl(estoque.custoTotalReposicao.toFixed(2))}
            </div>
          </SectionCard>
        </Link>
      </div>

      {/* Aviso discreto apenas se houver orçamentos aprovados aguardando conversão */}
      {orcamentosAprovados.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{orcamentosAprovados.length} orçamento(s)</strong>{" "}
            aprovado(s) aguardando conversão em pedido (
            {brl(orcamentosAprovados.reduce((acc, o) => acc + num(o.total), 0).toFixed(2))}
            ).
          </span>
          <Link
            to={`/vendas/orcamentos/${orcamentosAprovados[0].id}` as "/"}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            Revisar orçamento <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* 2. Receita + Pedidos por status */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
        <SectionCard>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Receita</h2>
              <p className="text-xs text-muted-foreground">
                Últimos {janelaMeses} meses (cancelados excluídos)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Realizado
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-[#D9486E]" />
                Tendência
              </span>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={receita.serie} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="receita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--lime)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--lime)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} {...grade} />
                <XAxis dataKey="mes" {...eixo} />
                <YAxis
                  {...eixo}
                  width={60}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  contentStyle={tooltipCss}
                  formatter={(v, name) => [
                    brl(String(v)),
                    name === "receita" ? "Realizado" : "Tendência",
                  ]}
                  cursor={{ stroke: "var(--border)" }}
                />
                <Area
                  type="monotone"
                  dataKey="receita"
                  stroke="var(--lime)"
                  strokeWidth={2}
                  fill="url(#receita)"
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--lime)" }}
                />
                <Line
                  type="monotone"
                  dataKey="tendencia"
                  stroke="#D9486E"
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Pedidos por status</h2>
              <p className="text-xs text-muted-foreground">
                Últimos {pedidosJanela.length} pedidos
              </p>
            </div>
            <Link
              to="/vendas/pedidos"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {(() => {
            const dados = serieStatus(pedidosJanela);
            if (dados.length === 0) {
              return (
                <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                  Sem pedidos no período.
                </div>
              );
            }
            const total = dados.reduce((a, d) => a + d.pedidos, 0);
            return (
              <div className="flex h-64 items-center gap-3">
                <div className="relative h-full w-1/2 min-w-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dados}
                        dataKey="pedidos"
                        nameKey="status"
                        innerRadius="62%"
                        outerRadius="88%"
                        paddingAngle={2}
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {dados.map((d) => (
                          <Cell
                            key={d.slug}
                            fill={CORES_STATUS[d.slug] ?? "var(--muted-foreground)"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipCss}
                        formatter={(v, name) => [String(v), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <p className="text-2xl font-bold tabular-nums">{total}</p>
                      <p className="text-[11px] text-muted-foreground">pedidos</p>
                    </div>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {dados.map((d) => (
                    <li key={d.slug} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: CORES_STATUS[d.slug] ?? "var(--muted-foreground)",
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {d.status}
                      </span>
                      <span className="font-semibold tabular-nums">{d.pedidos}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </SectionCard>
      </div>

      {/* 3. Funil Comercial & Curva ABC de Clientes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <SectionCard>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">Pipeline por etapa</h2>
              <p className="text-xs text-muted-foreground">Volume bruto e ponderado</p>
            </div>
            <Link
              to="/crm/oportunidades"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Abrir kanban <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {pipeline.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Sem oportunidades abertas.</p>
          ) : (
            <div className="space-y-3.5">
              {ESTAGIOS_ATIVOS.map((est) => {
                const itens = pipeline.filter((o) => o.estagio === est);
                const bruto = itens.reduce((acc, o) => acc + num(o.valor_estimado), 0);
                const maxBruto = Math.max(
                  1,
                  ...ESTAGIOS_ATIVOS.map((e) =>
                    pipeline
                      .filter((o) => o.estagio === e)
                      .reduce((acc, o) => acc + num(o.valor_estimado), 0),
                  ),
                );
                const larguraPct = bruto > 0 ? Math.max(6, (bruto / maxBruto) * 100) : 0;

                return (
                  <div key={est} className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        {statusLabel(est)}{" "}
                        <span className="text-muted-foreground">({itens.length})</span>
                      </span>
                      <span className="font-semibold tabular-nums">{brl(bruto.toFixed(2))}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${larguraPct}%`,
                          backgroundColor: COR_ESTAGIO[est],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-base font-bold">Principais clientes (Curva ABC)</h2>
              <p className="text-xs text-muted-foreground">Concentração de faturamento (80/15/5)</p>
            </div>
            <Link
              to="/crm/empresas"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {clientesAbc.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-semibold">Empresa</th>
                  <th className="px-3 py-2 font-semibold">Classe</th>
                  <th className="px-5 py-2 text-right font-semibold">Volume</th>
                </tr>
              </thead>
              <tbody>
                {clientesAbc.slice(0, 5).map((c) => (
                  <tr key={c.empresaId} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link
                        to={`/crm/empresas/${c.empresaId}` as "/"}
                        className="font-medium hover:underline block truncate max-w-48"
                      >
                        {c.nome}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">
                        {c.pedidosCount} pedido(s) · {c.participacaoPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-grid h-5 w-5 place-items-center rounded-md bg-secondary text-[11px] font-bold">
                        {c.classeAbc}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">
                      {brl(c.receitaTotal.toFixed(2))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      {/* 4. Pedidos Recentes & Estoque Crítico */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <SectionCard className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <h2 className="text-base font-bold">Pedidos recentes</h2>
            <Link
              to="/vendas/pedidos"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {pedidosRecentes.length === 0 ? (
            <p className="flex items-center gap-2 px-5 pb-5 text-sm text-muted-foreground">
              <Inbox className="h-4 w-4" /> Nenhum pedido ainda.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-semibold">Nº</th>
                  <th className="px-4 py-2 font-semibold">Cliente</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-5 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {pedidosRecentes.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link
                        to={`/vendas/pedidos/${p.id}` as "/"}
                        className="font-medium hover:underline"
                      >
                        {p.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 truncate max-w-40 text-muted-foreground">
                      {empresasMap.get(p.empresa_id) ?? `#${p.empresa_id}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={p.status} label={statusLabel(p.status)} />
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{brl(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <h2 className="text-base font-bold">Estoque crítico</h2>
            <Link
              to="/estoque"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver estoque <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {estoque.itens.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              Nenhum produto abaixo do estoque mínimo.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-semibold">Produto</th>
                  <th className="px-4 py-2 text-right font-semibold">Saldo / Mín.</th>
                  <th className="px-5 py-2 text-right font-semibold">Reposição</th>
                </tr>
              </thead>
              <tbody>
                {estoque.itens.slice(0, 5).map((item) => (
                  <tr key={item.produtoId} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link
                        to={`/catalogo/produtos/${item.produtoId}` as "/"}
                        className="font-medium hover:underline block truncate max-w-48"
                      >
                        {item.nome}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">{item.sku}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                      <span className={item.zerado ? "font-bold text-[#D92546]" : ""}>
                        {qty(String(item.disponivel), item.unidade)}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        / {qty(String(item.minimo), item.unidade)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-xs font-medium">
                      {brl(item.custoReposicao.toFixed(2))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      {/* 5. Resumo Financeiro e Operacional discreto (apenas para os perfis autorizados) */}
      {(temFinanceiro || temOperacao) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {temFinanceiro && (
            <SectionCard className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <div className="text-xs text-muted-foreground">Financeiro</div>
                <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                  <span>Caixa {caixaAberto ? `aberto (#${caixaAberto.id})` : "fechado"}</span>
                  <span>·</span>
                  <span>A receber: {brl(resumoFinanceiro.aReceber.toFixed(2))}</span>
                  {resumoFinanceiro.vencido > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-[#D92546]">
                        Vencido: {brl(resumoFinanceiro.vencido.toFixed(2))}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <Link
                to="/financeiro/pagamentos"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Abrir pagamentos <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </SectionCard>
          )}

          {temOperacao && (
            <SectionCard className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <div className="text-xs text-muted-foreground">Ordens de serviço</div>
                <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                  <span>{resumoOs.abertasCount} em aberto</span>
                  {resumoOs.urgentesCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-[#D92546]">
                        {resumoOs.urgentesCount} urgente(s) / alta prioridade
                      </span>
                    </>
                  )}
                </div>
              </div>
              <Link
                to="/operacao/ordens-servico"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Abrir OS <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </SectionCard>
          )}
        </div>
      )}
    </>
  );
}
