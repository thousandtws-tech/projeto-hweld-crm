import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { exigePerfil } from "@/lib/guards";
import type { TabelaPreco } from "@/lib/models";
import { catalogoService } from "@/lib/services";
import { useResourceList } from "@/lib/use-resource-list";

export const Route = createFileRoute("/catalogo/tabelas-preco/")({
  beforeLoad: exigePerfil("admin", "vendedor"),
  component: TabelasPrecoIndexPage,
});

function TabelasPrecoIndexPage() {
  const navigate = useNavigate();
  const l = useResourceList<TabelaPreco>({
    recurso: "tabelas-preco",
    busca: false,
    eventos: ["catalogo.precos"],
  });
  const tabelas = l.itens;
  const carregando = l.carregando;

  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<TabelaPreco | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({ nome: "", descricao: "", ativa: true });

  const abrirModal = (t?: TabelaPreco) => {
    setEditando(t ?? null);
    setF({
      nome: t?.nome ?? "",
      descricao: t?.descricao ?? "",
      ativa: t?.ativa ?? true,
    });
    setOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.nome.trim() || salvando) return;
    setSalvando(true);
    try {
      const body = {
        nome: f.nome.trim(),
        descricao: f.descricao.trim() || null,
        ativa: f.ativa,
      };
      if (editando) {
        await catalogoService.atualizarTabela(editando.id, body);
        l.recarregar();
        setOpen(false);
        toast.success("Tabela de preço atualizada.");
      } else {
        const criada = await catalogoService.criarTabela(body);
        setOpen(false);
        toast.success("Tabela de preço criada.");
        navigate({ to: `/catalogo/tabelas-preco/${criada.public_id}` as "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar tabela de preço.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Tabelas de preço"
        subtitle="Listas de preços diferenciadas por cliente B2B (aplicadas automaticamente no portal e em orçamentos)"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => abrirModal()}
              className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nova tabela
            </button>
            <button
              type="button"
              onClick={l.recarregar}
              aria-label="Atualizar"
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Descrição</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {tabelas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    Nenhuma tabela de preço cadastrada.
                  </td>
                </tr>
              ) : (
                tabelas.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() =>
                      navigate({ to: `/catalogo/tabelas-preco/${t.public_id}` as "/" })
                    }
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">#{t.id}</td>
                    <td className="px-4 py-3 font-semibold">{t.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.descricao || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status={t.ativa ? "ativo" : "inativo"}
                        label={t.ativa ? "Ativa" : "Inativa"}
                      />
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => abrirModal(t)}
                          className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ to: `/catalogo/tabelas-preco/${t.public_id}` as "/" })
                          }
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:bg-secondary"
                        >
                          Preços <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editando ? "Editar tabela de preço" : "Nova tabela de preço"}
        description="Defina o nome da tabela B2B; em seguida adicione os preços negociados por produto"
        submitLabel={salvando ? "Salvando…" : "Salvar"}
        onSubmit={salvar}
      >
        <FormField label="Nome da tabela *" wide>
          <input
            className={fieldClass}
            required
            placeholder="Ex.: Atacado Serralheria, Parceiro Industrial, VIP"
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })}
          />
        </FormField>
        <FormField label="Descrição" wide>
          <input
            className={fieldClass}
            placeholder="Condições ou perfil de clientes elegíveis…"
            value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })}
          />
        </FormField>
        <FormField label="" wide>
          <label className="mt-1 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={f.ativa}
              onChange={(e) => setF({ ...f, ativa: e.target.checked })}
            />
            Tabela ativa
          </label>
        </FormField>
      </FormDialog>
    </>
  );
}
