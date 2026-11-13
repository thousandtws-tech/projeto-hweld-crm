import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { ApiError, api } from "@/lib/api";
import { fmtDataHora, qty } from "@/lib/format";
import type { Movimentacao, Produto, SaldoAbaixoMinimo } from "@/lib/models";
import { catalogoService, estoqueService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useResourceList } from "@/lib/use-resource-list";
import TextField from "@mui/material/TextField";

export const Route = createFileRoute("/estoque")({
  beforeLoad: exigePerfil("admin", "estoque"),
  component: EstoquePage,
});

/* Reserva/saída de pedido e baixa por OS também movem estoque — extrato
 * e alertas revalidam quando qualquer origem movimenta. */
const EVENTOS = [
  "estoque.movimentado",
  "pedido.status_alterado",
  "os.criada",
  "os.status_alterada",
];

const TIPO_COR: Record<string, string> = {
  entrada: "pago",
  saida: "vencido",
  reserva: "em_andamento",
  liberacao_reserva: "enviado",
  ajuste: "draft",
};

const TIPO_LABEL: Record<string, string> = {
  entrada: "entrada",
  saida: "saída",
  reserva: "reserva",
  liberacao_reserva: "liberação de reserva",
  ajuste: "ajuste",
};

/** Origem da movimentação — pedido/OS quando não é lançamento manual. */
function Origem({ m }: { m: Movimentacao }) {
  if (m.pedido_id)
    return (
      <Link to={`/vendas/pedidos/${m.pedido_id}` as "/"} className="text-xs hover:underline">
        pedido #{m.pedido_id}
      </Link>
    );
  if (m.ordem_servico_id)
    return (
      <Link
        to={`/operacao/ordens-servico/${m.ordem_servico_id}` as "/"}
        className="text-xs hover:underline"
      >
        OS #{m.ordem_servico_id}
      </Link>
    );
  return <span className="text-xs text-muted-foreground">manual</span>;
}

/** Estoque: alertas de reposição + lançamento manual + extrato imutável. */
function EstoquePage() {
  const queryClient = useQueryClient();
  const [mostrarBaixos, setMostrarBaixos] = useState(true);
  const [f, setF] = useState({ produto_id: "", tipo: "entrada", quantidade: "1", motivo: "" });

  // Lookups cacheados — produtos alimentam o select e a resolução de nome.
  const { data: produtosPg } = useQuery({
    queryKey: ["lookup", "produtos"],
    queryFn: () => catalogoService.produtos({ por_pagina: 500 }).catch(() => ({ itens: [] })),
    staleTime: 60_000,
  });
  const produtos = produtosPg?.itens ?? [];
  const nomeProduto = (id: number) => produtos.find((p) => p.id === id)?.nome ?? `#${id}`;

  const { data: baixos = [] } = useQuery({
    queryKey: ["lookup", "estoque-baixos"],
    queryFn: () => estoqueService.abaixoDoMinimo().catch(() => [] as SaldoAbaixoMinimo[]),
    staleTime: 15_000,
  });
  const carregarBaixos = () =>
    void queryClient.invalidateQueries({ queryKey: ["lookup", "estoque-baixos"] });

  // Extrato: server-side, reconcilia nos eventos de estoque e nos derivados
  // (pedido/OS também movimentam saldo).
  const l = useResourceList<Movimentacao>({
    recurso: "estoque/movimentacoes",
    porPagina: 50,
    busca: false,
    eventos: EVENTOS,
  });
  const movimentacoes = l.itens;
  const carregarMovs = l.recarregar;

  useRealtimeEvent(EVENTOS, carregarBaixos);

  const lancar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.produto_id || !f.quantidade) return;
    try {
      await estoqueService.lancar({
        produto_id: Number(f.produto_id),
        tipo: f.tipo,
        quantidade: String(f.quantidade),
        motivo: f.motivo || undefined,
      });
      carregarMovs();
      carregarBaixos();
      setF((p) => ({ ...p, quantidade: "1", motivo: "" }));
      toast.success("Lançamento registrado.");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 422
          ? "Inválido — entrada deve ser positiva, ajuste não pode ser zero."
          : "Falha ao lançar.",
      );
    }
  };

  return (
    <>
      <PageHeader title="Estoque" />

      {baixos.length > 0 && (
        <div className="rounded-2xl bg-[var(--pill-warn-bg)] px-4 py-3 text-sm text-[var(--pill-warn-fg)]">
          <strong>{baixos.length}</strong> produto(s) abaixo do mínimo.{" "}
          <button className="font-semibold underline" onClick={() => setMostrarBaixos((v) => !v)}>
            {mostrarBaixos ? "ocultar" : "ver"}
          </button>
        </div>
      )}

      {baixos.length > 0 && mostrarBaixos && (
        <SectionCard className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">Produto</th>
                <th className="px-5 py-2.5 text-right font-semibold">Disponível</th>
                <th className="px-5 py-2.5 text-right font-semibold">Reservado</th>
              </tr>
            </thead>
            <tbody>
              {/* backend já envia o produto junto do saldo */}
              {baixos.map((s) => (
                <tr key={s.produto.id} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2.5">
                    <Link
                      to={`/catalogo/produtos/${s.produto.id}` as "/"}
                      className="font-medium hover:underline"
                    >
                      {s.produto.sku} · {s.produto.nome}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {qty(s.saldo.quantidade_disponivel)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                    {qty(s.saldo.quantidade_reservada)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <SectionCard>
        <h2 className="mb-3 text-sm font-semibold">Lançar movimentação</h2>
        <form
          onSubmit={lancar}
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_1fr_auto]"
        >
          <label className="text-xs font-medium text-muted-foreground">
            Produto
            <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
              required
              value={f.produto_id}
              onChange={(e) => setF({ ...f, produto_id: e.target.value })}>
              <option value="">—</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.nome}
                </option>
              ))}
            </TextField>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Tipo
            <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {/* backend só aceita lançamento manual desses dois — reserva/saída
                  nascem de pedidos e ordens de serviço */}
              <option value="entrada">Entrada</option>
              <option value="ajuste">Ajuste</option>
            </TextField>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Quantidade
            <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: f.tipo === "ajuste" ? undefined : "0.001" } }}
              type="number"
             
             
              required
              value={f.quantidade}
              onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Motivo
            <TextField size="small" fullWidth
              value={f.motivo}
              onChange={(e) => setF({ ...f, motivo: e.target.value })} />
          </label>
          <button className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Lançar
          </button>
        </form>
      </SectionCard>

      <SectionCard className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2 text-sm font-semibold">
          Extrato{" "}
          <span className="font-normal text-muted-foreground">
            (append-only — correção é novo lançamento)
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-semibold">Quando</th>
              <th className="px-5 py-2.5 font-semibold">Produto</th>
              <th className="px-5 py-2.5 font-semibold">Tipo</th>
              <th className="px-5 py-2.5 text-right font-semibold">Qtd</th>
              <th className="px-5 py-2.5 text-right font-semibold">Saldo</th>
              <th className="px-5 py-2.5 font-semibold">Origem</th>
              <th className="px-5 py-2.5 font-semibold">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movimentacoes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                  Sem movimentações.
                </td>
              </tr>
            )}
            {movimentacoes.map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-2.5 text-xs text-muted-foreground">
                  {fmtDataHora(m.created_at)}
                </td>
                <td className="px-5 py-2.5">{nomeProduto(m.produto_id)}</td>
                <td className="px-5 py-2.5">
                  <StatusPill
                    status={TIPO_COR[m.tipo] ?? "draft"}
                    label={TIPO_LABEL[m.tipo] ?? m.tipo}
                  />
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{qty(m.quantidade)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                  {qty(m.saldo_antes)} → {qty(m.saldo_depois)}
                </td>
                <td className="px-5 py-2.5">
                  <Origem m={m} />
                </td>
                <td className="px-5 py-2.5">{m.motivo || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

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
