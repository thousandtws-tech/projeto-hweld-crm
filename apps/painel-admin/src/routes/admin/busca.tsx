import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { ApiError } from "@/lib/api";
import { brl } from "@/lib/format";
import type { ItemBuscaStaff } from "@/lib/models";
import { buscaService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";

export const Route = createFileRoute("/admin/busca")({
  beforeLoad: exigePerfil("admin"),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: BuscaPage,
});

/** Busca global staff + reindexar (admin). */
function BuscaPage() {
  const { q } = Route.useSearch();
  const [termo, setTermo] = useState(q);
  const [resultados, setResultados] = useState<ItemBuscaStaff[] | null>(null);

  const buscar = useCallback(async (termoBusca: string) => {
    if (!termoBusca.trim()) return;
    try {
      const p = await buscaService.buscar({ q: termoBusca });
      setResultados(p.itens);
    } catch (e) {
      toast.error(
        e instanceof ApiError && e.status === 503
          ? "Elasticsearch indisponível."
          : "Falha na busca.",
      );
    }
  }, []);

  useEffect(() => {
    if (q) void buscar(q);
  }, [q, buscar]);

  const reindexar = async () => {
    try {
      await buscaService.reindexar();
      toast.success("Reindexação solicitada.");
    } catch {
      toast.error("Falha ao reindexar — ES fora?");
    }
  };

  return (
    <AppShell>
      <PageHeader title="Busca" />
      <SectionCard>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void buscar(termo);
          }}
          className="flex gap-2"
        >
          <input
            className={fieldClass}
            placeholder="Buscar produtos…"
            aria-label="Buscar"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
          <button className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Buscar
          </button>
        </form>
        <hr className="my-4 border-border" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <small className="text-xs text-muted-foreground">
            Reindexar o Elasticsearch (admin). Se o ES estiver fora, a busca responde 503.
          </small>
          <button
            onClick={() => void reindexar()}
            className="rounded-full border border-destructive/30 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
          >
            Reindexar
          </button>
        </div>
      </SectionCard>

      {resultados && (
        <SectionCard>
          {resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum resultado.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {resultados.map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/catalogo/produtos/${i.public_id}` as "/"}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {i.nome}
                        {!i.ativo && (
                          <span className="ml-2 text-xs font-semibold text-destructive">
                            inativo
                          </span>
                        )}
                      </span>{" "}
                      <small className="text-xs text-muted-foreground">
                        {i.sku}
                        {i.marca ? ` · ${i.marca}` : ""}
                        {typeof i.score === "number" ? ` · score ${i.score.toFixed(2)}` : ""}
                      </small>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {brl(i.preco_venda)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </AppShell>
  );
}
