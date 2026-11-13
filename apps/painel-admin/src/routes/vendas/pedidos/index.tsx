import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { brl, fmtData, statusLabel } from "@/lib/format";
import type { Pedido, StatusPedido } from "@/lib/models";
import { pedidosService } from "@/lib/services";
import { useEmpresasNomes } from "@/lib/use-empresas";
import { useResourceList } from "@/lib/use-resource-list";
import { useAuth } from "@/store/auth-store";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";

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

  const empresas = useEmpresasNomes();
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("");

  // Paginação + filtros server-side: `busca` faz ILIKE em número e nome da
  // empresa no backend — antes a busca só enxergava a 1ª página de 100.
  const l = useResourceList<Pedido>({
    recurso: "pedidos",
    filtros: {
      status: filtroStatus || undefined,
      origem: filtroOrigem || undefined,
    },
    eventos: ["pedido.criado", "pedido.status_alterado", "pagamento.baixado", "pagamento.estornado"],
  });
  // Qualquer mudança de filtro volta à página 1.
  const setStatus = (v: string) => { setFiltroStatus(v); l.setPaginaNum(1); };
  const setOrigem = (v: string) => { setFiltroOrigem(v); l.setPaginaNum(1); };

  // Métricas de cabeçalho passam a refletir a página carregada (o total real
  // vem de `pagina.total`); com volume alto isso evita varrer 100+ pedidos.
  const metricas = useMemo(() => {
    const ativos = l.itens.filter((p) => p.status !== "cancelado");
    const volumeTotal = ativos.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
    const emOperacao = l.itens.filter((p) =>
      ["confirmado", "em_separacao", "faturado", "enviado"].includes(p.status),
    ).length;
    return { totalAtivos: ativos.length, volumeTotal, emOperacao };
  }, [l.itens]);

  const transicionarRapido = async (p: Pedido, para: StatusPedido) => {
    try {
      await pedidosService.transicionar(p.id, para);
      toast.success(`Pedido ${p.numero} → ${statusLabel(para)}`);
      l.recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transição recusada pelo backend.");
    }
  };

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle={`Volume da página: ${brl(metricas.volumeTotal.toFixed(2))} (${metricas.totalAtivos} pedidos) · Em separação/trânsito: ${metricas.emOperacao} · Total: ${l.pagina?.total ?? "—"}`}
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
              onClick={l.recarregar}
              aria-label="Atualizar"
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${l.carregando ? "animate-spin" : ""}`} />
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
              value={l.busca}
              onChange={(e) => l.setBusca(e.target.value)}
              placeholder="Buscar nº do pedido ou cliente…"
              className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setStatus("")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filtroStatus === ""
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {STATUS_PEDIDO.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatus(filtroStatus === st ? "" : st)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filtroStatus === st
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {statusLabel(st)}
              </button>
            ))}
          </div>
        </div>

        <TextField size="small" select aria-label="Origem" value={filtroOrigem} onChange={(e) => setOrigem(e.target.value)}>
          <MenuItem value="">Origem: todas</MenuItem>
          <MenuItem value="ecommerce">E-commerce B2B</MenuItem>
          <MenuItem value="orcamento">Orçamento</MenuItem>
          <MenuItem value="manual">Manual</MenuItem>
        </TextField>
      </div>

      {l.erro && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{l.erro}</span>
          <button
            onClick={l.recarregar}
            className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 px-3 py-1 text-xs font-semibold hover:bg-destructive/10"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${l.carregando ? "opacity-60" : ""}`}>
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
              {l.itens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {l.carregando ? "Carregando…" : "Nenhum pedido encontrado."}
                  </td>
                </tr>
              ) : (
                l.itens.map((p) => {
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

        {l.pagina && l.pagina.total_paginas > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{l.pagina.total} registro(s)</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: l.pagina.total_paginas }, (_, i) => i + 1)
                .slice(
                  Math.max(0, Math.min(l.paginaNum - 3, l.pagina.total_paginas - 5)),
                  Math.max(5, Math.min(l.paginaNum + 2, l.pagina.total_paginas)),
                )
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => l.setPaginaNum(p)}
                    className={`h-8 min-w-8 rounded-xl px-2 text-xs font-semibold ${
                      p === l.paginaNum
                        ? "bg-lime text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {p}
                  </button>
                ))}
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}
