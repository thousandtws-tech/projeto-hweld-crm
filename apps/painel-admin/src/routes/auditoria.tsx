import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import type { LogAuditoria } from "@/lib/models";
import { auditoriaService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useRealtimeEvent } from "@/lib/use-realtime";

export const Route = createFileRoute("/auditoria")({
  beforeLoad: exigePerfil("admin"),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [aberto, setAberto] = useState<number | null>(null);

  const carregar = useCallback(() => {
    auditoriaService
      .listar({ por_pagina: 100 })
      .then((p) => setLogs(p.itens))
      .catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Toda mutação de domínio grava uma linha de auditoria — qualquer evento do
  // barramento é motivo de reconciliação. Debounce coalesce rajadas (ex.: um
  // checkout que dispara pedido + estoque + pagamento vira um único GET).
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeEvent(
    () => true,
    () => {
      if (debRef.current) clearTimeout(debRef.current);
      debRef.current = setTimeout(carregar, 400);
    },
  );

  return (
    <AppShell>
      <PageHeader title="Auditoria" />
      <SectionCard className="p-0 overflow-hidden">
        <table className="w-full text-sm">
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
      </SectionCard>
    </AppShell>
  );
}
