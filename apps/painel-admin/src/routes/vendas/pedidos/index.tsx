import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { brl, fmtData, statusLabel } from "@/lib/format";
import type { Empresa, Pedido, StatusPedido } from "@/lib/models";
import { crmService, pedidosService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useAuth } from "@/store/auth-store";

export const Route = createFileRoute("/vendas/pedidos/")({
  component: PedidosIndexPage,
});

const STATUS_PEDIDO: StatusPedido[] = [
  "aguardando_pagamento",
  "confirmado",
  "em_separacao",
  "faturado",
  "enviado",
  "entregue",
  "concluido",
  "cancelado",
];

const ACAO_RAPIDA_PEDIDO: Partial<Record<StatusPedido, { para: StatusPedido; rotulo: string }>> = {
  aguardando_pagamento: { para: "confirmado", rotulo: "Confirmar" },
  confirmado: { para: "em_separacao", rotulo: "Separar" },
  em_separacao: { para: "faturado", rotulo: "Faturar" },
  faturado: { para: "enviado", rotulo: "Enviar" },
  enviado: { para: "entregue", rotulo: "Entregar" },
  entregue: { para: "concluido", rotulo: "Concluir" },
};

const ORIGEM_LABEL: Record<string, string> = {
  ecommerce: "E-commerce B2B",
  orcamento: "Orçamento",
  manual: "Manual",
};

function PedidosIndexPage() {
  const navigate = useNavigate();
  const { pode } = useAuth();
  const podeEditar = pode("admin", "vendedor");

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [empresas, setEmpresas] = useState<Map<number, string>>(new Map());
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("");

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [pPeds, pEmps] = await Promise.all([
        pedidosService.listar({ por_pagina: 100 }),
        crmService.empresas({ por_pagina: 100 }).catch(() => ({ itens: [] as Empresa[] })),
      ]);
      setPedidos(pPeds.itens ?? []);
      setEmpresas(
        new Map((pEmps.itens ?? []).map((e) => [e.id, e.nome_fantasia || e.razao_social])),
      );
    } catch {
      if (!silencioso) toast.error("Falha ao carregar pedidos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(
    ["pedido.criado", "pedido.status_alterado", "pagamento.baixado", "pagamento.estornado"],
    () => void carregar(true),
  );

  const pedidosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (filtroStatus && p.status !== filtroStatus) return false;
      if (filtroOrigem && p.origem !== filtroOrigem) return false;
      if (q) {
        const emp = (empresas.get(p.empresa_id) ?? "").toLowerCase();
        const numStr = p.numero.toLowerCase();
        if (!emp.includes(q) && !numStr.includes(q)) return false;
      }
      return true;
    });
  }, [pedidos, busca, filtroStatus, filtroOrigem, empresas]);

  const metricas = useMemo(() => {
    const ativos = pedidos.filter((p) => p.status !== "cancelado");
    const volumeTotal = ativos.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
    const emOperacao = pedidos.filter((p) =>
      ["confirmado", "em_separacao", "faturado", "enviado"].includes(p.status),
    ).length;
    return { totalAtivos: ativos.length, volumeTotal, emOperacao };
  }, [pedidos]);

  const transicionarRapido = async (p: Pedido, para: StatusPedido) => {
    try {
      const atualizado = await pedidosService.transicionar(p.id, para);
      setPedidos((lista) =>
        lista.map((x) => (x.id === atualizado.id ? { ...x, ...atualizado } : x)),
      );
      toast.success(`Pedido ${p.numero} → ${statusLabel(para)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transição recusada pelo backend.");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Pedidos"
        subtitle={`Volume acumulado: ${brl(metricas.volumeTotal.toFixed(2))} (${metricas.totalAtivos} pedidos) · Em separação/trânsito: ${metricas.emOperacao}`}
        action={
          <div className="flex items-center gap-2">
            {podeEditar && (
              <Link
                to="/vendas/pedidos/novo"
                className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Novo pedido
              </Link>
            )}
            <button
              type="button"
              onClick={() => void carregar()}
              aria-label="Atualizar"
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nº do pedido ou cliente…"
              className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setFiltroStatus("")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filtroStatus === ""
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({pedidos.length})
            </button>
            {STATUS_PEDIDO.map((st) => {
              const count = pedidos.filter((p) => p.status === st).length;
              if (count === 0 && filtroStatus !== st) return null;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFiltroStatus(filtroStatus === st ? "" : st)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    filtroStatus === st
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {statusLabel(st)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <select
          aria-label="Origem"
          value={filtroOrigem}
          onChange={(e) => setFiltroOrigem(e.target.value)}
          className="rounded-2xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none"
        >
          <option value="">Origem: todas</option>
          <option value="ecommerce">E-commerce B2B</option>
          <option value="orcamento">Orçamento</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Nº</th>
                <th className="px-4 py-3 font-semibold">Empresa</th>
                <th className="px-4 py-3 font-semibold">Origem</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              ) : (
                pedidosFiltrados.map((p) => {
                  const acao = ACAO_RAPIDA_PEDIDO[p.status];
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate({ to: `/vendas/pedidos/${p.id}` as "/" })}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-4 py-3 font-semibold text-primary">{p.numero}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/crm/empresas/${p.empresa_id}` as "/"}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:underline"
                        >
                          {empresas.get(p.empresa_id) ?? `Empresa #${p.empresa_id}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {ORIGEM_LABEL[p.origem] ?? p.origem}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={p.status} label={statusLabel(p.status)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {fmtData(p.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {brl(p.total)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {podeEditar && acao && (
                          <button
                            type="button"
                            onClick={() => void transicionarRapido(p, acao.para)}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                          >
                            {acao.rotulo}
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
