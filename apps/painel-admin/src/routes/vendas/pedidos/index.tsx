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
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

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
            <IconButton size="small" type="button" onClick={l.recarregar} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${l.carregando ? "animate-spin" : ""}`} /></IconButton>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <TextField size="small" type="search" value={l.busca} onChange={(e) => l.setBusca(e.target.value)} placeholder="Buscar nº do pedido ou cliente…" />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Chip label={<>Todos</>} size="small" variant={(filtroStatus === "") ? "filled" : "outlined"} color={(filtroStatus === "") ? "primary" : "default"} onClick={() => setStatus("")} />
            {STATUS_PEDIDO.map((st) => (
              <Chip label={<>{statusLabel(st)}</>} size="small" variant={(filtroStatus === st) ? "filled" : "outlined"} color={(filtroStatus === st) ? "primary" : "default"} key={st} onClick={() => setStatus(filtroStatus === st ? "" : st)} />
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
          <Button variant="contained" color="error" size="small" onClick={l.recarregar}><RefreshCw className="h-3.5 w-3.5" /> Tentar novamente</Button>
        </div>
      )}

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table size="small" className={`w-full text-sm ${l.carregando ? "opacity-60" : ""}`}>
            <TableHead>
              <TableRow >
                <TableCell >Nº</TableCell>
                <TableCell >Empresa</TableCell>
                <TableCell >Origem</TableCell>
                <TableCell >Status</TableCell>
                <TableCell >Data</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {l.itens.length === 0 ? (
                <TableRow >
                  <TableCell align="center" colSpan={7}>
                    {l.carregando ? "Carregando…" : "Nenhum pedido encontrado."}
                  </TableCell>
                </TableRow>
              ) : (
                l.itens.map((p) => {
                  const acao = ACAO_RAPIDA_PEDIDO[p.status];
                  return (
                    <TableRow key={p.id} onClick={() => navigate({ to: `/vendas/pedidos/${p.id}` as "/" })} sx={{ cursor: "pointer" }} hover>
                      <TableCell >{p.numero}</TableCell>
                      <TableCell >
                        <Link
                          to={`/crm/empresas/${p.empresa_id}` as "/"}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:underline"
                        >
                          {empresas.get(p.empresa_id) ?? `Empresa #${p.empresa_id}`}
                        </Link>
                      </TableCell>
                      <TableCell >
                        {ORIGEM_LABEL[p.origem] ?? p.origem}
                      </TableCell>
                      <TableCell >
                        <StatusPill status={p.status} label={statusLabel(p.status)} />
                      </TableCell>
                      <TableCell >
                        {fmtData(p.created_at)}
                      </TableCell>
                      <TableCell align="right">
                        {brl(p.total)}
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        {podeEditar && acao && (
                          <Button variant="outlined" size="small" type="button" onClick={() => void transicionarRapido(p, acao.para)}>{acao.rotulo}
                            <ChevronRight className="h-3 w-3" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
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
                  <Chip label={<>{p}</>} size="small" variant={(p === l.paginaNum) ? "filled" : "outlined"} color={(p === l.paginaNum) ? "primary" : "default"} key={p} onClick={() => l.setPaginaNum(p)} />
                ))}
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}
