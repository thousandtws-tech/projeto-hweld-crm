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
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Box from "@mui/material/Box";

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
            <Box component="form" onSubmit={definir} className="flex flex-wrap items-end gap-2 px-5 pt-4">
              <TextField size="small" fullWidth select
                required
                value={fPreco.produto_id}
                onChange={(e) => setFPreco({ ...fPreco, produto_id: e.target.value })}
                aria-label="Produto" slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">Produto…</MenuItem>
                {produtos.map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    {p.sku} · {p.nome}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                type="number"
               
                required
                placeholder="Preço"
                aria-label="Preço"
                value={fPreco.preco}
                onChange={(e) => setFPreco({ ...fPreco, preco: e.target.value })} />
              <Button variant="contained" >Definir</Button>
            </Box>
            <Table size="small" className="mt-3 w-full text-sm">
              <TableHead>
                <TableRow >
                  <TableCell >Produto</TableCell>
                  <TableCell align="right">Preço</TableCell>
                  <TableCell  />
                </TableRow>
              </TableHead>
              <TableBody>
                {(tabela.itens ?? []).length === 0 && (
                  <TableRow >
                    <TableCell align="center" colSpan={3}>
                      Nenhum preço definido.
                    </TableCell>
                  </TableRow>
                )}
                {(tabela.itens ?? []).map((i) => (
                  <TableRow key={i.produto_id}>
                    <TableCell >{nomeProduto(i.produto_id)}</TableCell>
                    <TableCell align="right">{brl(i.preco)}</TableCell>
                    <TableCell align="right">
                      <Button variant="contained" color="error" size="small" onClick={() => void remover(i.produto_id)}>Remover</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
