import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { ApiError } from "@/lib/api";
import { fmtDataHora, qty } from "@/lib/format";
import type { Movimentacao, Produto, SaldoAbaixoMinimo } from "@/lib/models";
import { catalogoService, estoqueService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useRealtimeEvent } from "@/lib/use-realtime";

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
  const [baixos, setBaixos] = useState<SaldoAbaixoMinimo[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [mostrarBaixos, setMostrarBaixos] = useState(true);

  const [f, setF] = useState({ produto_id: "", tipo: "entrada", quantidade: "1", motivo: "" });

  const nomeProduto = (id: number) => produtos.find((p) => p.id === id)?.nome ?? `#${id}`;

  const carregarMovs = useCallback(() => {
    estoqueService.movimentacoes({ por_pagina: 50 }).then((p) => setMovimentacoes(p.itens));
  }, []);
  const carregarBaixos = useCallback(() => {
    estoqueService.abaixoDoMinimo().then(setBaixos);
  }, []);

  useEffect(() => {
    catalogoService.produtos({ por_pagina: 100 }).then((p) => setProdutos(p.itens));
    carregarBaixos();
    carregarMovs();
  }, [carregarBaixos, carregarMovs]);

  useRealtimeEvent(EVENTOS, () => {
    carregarMovs();
    carregarBaixos();
  });

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
    <AppShell>
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
            <select
              className={fieldClass}
              required
              value={f.produto_id}
              onChange={(e) => setF({ ...f, produto_id: e.target.value })}
            >
              <option value="">—</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Tipo
            <select
              className={fieldClass}
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })}
            >
              {/* backend só aceita lançamento manual desses dois — reserva/saída
                  nascem de pedidos e ordens de serviço */}
              <option value="entrada">Entrada</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Quantidade
            <input
              className={fieldClass}
              type="number"
              step="0.001"
              min={f.tipo === "ajuste" ? undefined : "0.001"}
              required
              value={f.quantidade}
              onChange={(e) => setF({ ...f, quantidade: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Motivo
            <input
              className={fieldClass}
              value={f.motivo}
              onChange={(e) => setF({ ...f, motivo: e.target.value })}
            />
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
      </SectionCard>
    </AppShell>
  );
}
