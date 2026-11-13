import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { ApiError } from "@/lib/api";
import { brl } from "@/lib/format";
import type { ItemBuscaStaff } from "@/lib/models";
import { buscaService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/admin/busca")({
  beforeLoad: exigePerfil("admin"),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: BuscaPage,
});

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
    <>
      <PageHeader title="Busca" />
      <SectionCard>
        <Box component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void buscar(termo);
          }}
          className="flex gap-2"
        >
          <TextField size="small" fullWidth
            placeholder="Buscar produtos…"
            aria-label="Buscar"
            value={termo}
            onChange={(e) => setTermo(e.target.value)} />
          <Button variant="contained" >Buscar</Button>
        </Box>
        <hr className="my-4 border-border" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <small className="text-xs text-muted-foreground">
            Reindexar o Elasticsearch (admin). Se o ES estiver fora, a busca responde 503.
          </small>
          <Button variant="contained" color="error" size="small" onClick={() => void reindexar()}>Reindexar</Button>
        </div>
      </SectionCard>

      {resultados && (
        <SectionCard>
          {resultados.length === 0 ? (
            <Typography variant="body2" component="p" className="text-sm text-muted-foreground">Nenhum resultado.</Typography>
          ) : (
            <List disablePadding>
              {resultados.map((i) => (
                <ListItem key={i.id}>
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
                </ListItem>
              ))}
            </List>
          )}
        </SectionCard>
      )}
    </>
  );
}
