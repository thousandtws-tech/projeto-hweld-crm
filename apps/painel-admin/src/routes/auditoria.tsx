import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import type { LogAuditoria } from "@/lib/models";
import { exigePerfil } from "@/lib/guards";
import { useResourceList } from "@/lib/use-resource-list";

export const Route = createFileRoute("/auditoria")({
  beforeLoad: exigePerfil("admin"),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  // Toda mutação de domínio grava uma linha de auditoria — qualquer evento do
  // barramento é motivo de reconciliação. A coalescência de rajadas (ex.: um
  // checkout que dispara pedido + estoque + pagamento) já é feita pelo hook.
  const l = useResourceList<LogAuditoria>({
    recurso: "auditoria",
    busca: false,
    eventos: () => true,
  });
  const logs = l.itens;
  const [aberto, setAberto] = useState<number | null>(null);

  return (
    <>
      <PageHeader title="Auditoria" />
      <SectionCard className="p-0 overflow-hidden">
        <table className={`w-full text-sm ${l.carregando ? "opacity-55" : ""}`}>
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              {["Quando", "Usuário", "Entidade", "Ação", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold last:text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Sem logs.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <Fragment key={l.id}>
                <tr className="border-b border-border/60">
                  <td className="px-4 py-3">
                    <small className="text-xs text-muted-foreground">{l.created_at}</small>
                  </td>
                  <td className="px-4 py-3">#{l.usuario_id ?? "—"}</td>
                  <td className="px-4 py-3">
                    {l.entidade} #{l.entidade_id}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status="draft" label={l.acao} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(l.antes != null || l.depois != null) && (
                      <button
                        onClick={() => setAberto(aberto === l.id ? null : l.id)}
                        className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
                      >
                        {aberto === l.id ? "ocultar diff" : "ver diff"}
                      </button>
                    )}
                  </td>
                </tr>
                {aberto === l.id && (
                  <tr key={`${l.id}-diff`} className="border-b border-border/60 bg-secondary/30">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <strong className="text-xs">Antes</strong>
                          <pre className="mt-1 overflow-x-auto rounded-xl border border-border bg-card p-3 text-xs">
                            <code>{JSON.stringify(l.antes, null, 2)}</code>
                          </pre>
                        </div>
                        <div>
                          <strong className="text-xs">Depois</strong>
                          <pre className="mt-1 overflow-x-auto rounded-xl border border-border bg-card p-3 text-xs">
                            <code>{JSON.stringify(l.depois, null, 2)}</code>
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
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
