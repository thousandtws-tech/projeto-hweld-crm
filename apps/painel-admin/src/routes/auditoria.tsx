import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import type { LogAuditoria } from "@/lib/models";
import { exigePerfil } from "@/lib/guards";
import { useResourceList } from "@/lib/use-resource-list";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

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
        <Table size="small" className={`w-full text-sm ${l.carregando ? "opacity-55" : ""}`}>
          <TableHead>
            <TableRow >
              {["Quando", "Usuário", "Entidade", "Ação", ""].map((h) => (
                <TableCell align="right" key={h}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.length === 0 && (
              <TableRow >
                <TableCell align="center" colSpan={5}>
                  Sem logs.
                </TableCell>
              </TableRow>
            )}
            {logs.map((l) => (
              <Fragment key={l.id}>
                <TableRow >
                  <TableCell >
                    <small className="text-xs text-muted-foreground">{l.created_at}</small>
                  </TableCell>
                  <TableCell >#{l.usuario_id ?? "—"}</TableCell>
                  <TableCell >
                    {l.entidade} #{l.entidade_id}
                  </TableCell>
                  <TableCell >
                    <StatusPill status="draft" label={l.acao} />
                  </TableCell>
                  <TableCell align="right">
                    {(l.antes != null || l.depois != null) && (
                      <Button variant="outlined" size="small" onClick={() => setAberto(aberto === l.id ? null : l.id)}>{aberto === l.id ? "ocultar diff" : "ver diff"}</Button>
                    )}
                  </TableCell>
                </TableRow>
                {aberto === l.id && (
                  <TableRow key={`${l.id}-diff`}>
                    <TableCell colSpan={5}>
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
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>

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
