import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { brl } from "@/lib/format";
import type { Produto, TabelaPreco } from "@/lib/models";
import { catalogoService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useRealtimeEvent } from "@/lib/use-realtime";

export const Route = createFileRoute("/catalogo/tabelas-preco/$id")({
  beforeLoad: exigePerfil("admin", "vendedor"),
  component: TabelaPrecoPage,
});

function TabelaPrecoPage() {
  const { id: ref } = Route.useParams();
  const navigate = useNavigate();
  const [tabela, setTabela] = useState<TabelaPreco | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fPreco, setFPreco] = useState({ produto_id: "", preco: "" });

  // Id numérico interno resolvido; a URL usa o public_id (UUID mascarado).
  const tabelaId = tabela?.id ?? 0;

  const carregarTabela = useCallback(() => {
    catalogoService.tabela(ref).then((t) => {
      setTabela(t);
      if (ref !== t.public_id) {
        void navigate({
          to: "/catalogo/tabelas-preco/$id",
          params: { id: t.public_id },
          replace: true,
        });
      }
    });
  }, [ref, navigate]);

  useEffect(() => {
    carregarTabela();
    catalogoService.produtos({ por_pagina: 100, ativo: true }).then((p) => setProdutos(p.itens));
  }, [carregarTabela]);

  useRealtimeEvent(["catalogo.precos"], carregarTabela);

  const nomeProduto = (pid: number) => produtos.find((p) => p.id === pid)?.nome ?? `#${pid}`;

  const definir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tabelaId || !fPreco.produto_id || !fPreco.preco) return;
    try {
      await catalogoService.definirPreco(tabelaId, Number(fPreco.produto_id), String(fPreco.preco));
      carregarTabela();
      toast.success("Preço definido.");
    } catch {
      toast.error("Falha ao definir preço.");
    }
  };

  const remover = async (produtoId: number) => {
    if (!tabelaId) return;
    try {
      await catalogoService.removerItemTabela(tabelaId, produtoId);
      carregarTabela();
    } catch {
      toast.error("Falha ao remover.");
    }
  };

  return (
    <>
      {tabela ? (
        <>
          <PageHeader title={tabela.nome} subtitle={tabela.descricao ?? undefined} />
          <SectionCard className="p-0 overflow-hidden">
            <form onSubmit={definir} className="flex flex-wrap items-end gap-2 px-5 pt-4">
              <select
                className={`${fieldClass} w-auto min-w-56`}
                required
                value={fPreco.produto_id}
                onChange={(e) => setFPreco({ ...fPreco, produto_id: e.target.value })}
                aria-label="Produto"
              >
                <option value="">Produto…</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.nome}
                  </option>
                ))}
              </select>
              <input
                className={`${fieldClass} w-28`}
                type="number"
                step="0.01"
                required
                placeholder="Preço"
                aria-label="Preço"
                value={fPreco.preco}
                onChange={(e) => setFPreco({ ...fPreco, preco: e.target.value })}
              />
              <button className="rounded-full bg-lime px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Definir
              </button>
            </form>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-semibold">Produto</th>
                  <th className="px-5 py-2 text-right font-semibold">Preço</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {(tabela.itens ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
                      Nenhum preço definido.
                    </td>
                  </tr>
                )}
                {(tabela.itens ?? []).map((i) => (
                  <tr key={i.produto_id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5 font-medium">{nomeProduto(i.produto_id)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{brl(i.preco)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={() => void remover(i.produto_id)}
                        className="rounded-full border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </>
      ) : (
        <SectionCard>
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        </SectionCard>
      )}
    </>
  );
}
