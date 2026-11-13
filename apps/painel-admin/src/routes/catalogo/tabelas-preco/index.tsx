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
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

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
            <Button variant="contained" type="button" onClick={() => abrirModal()}><Plus className="h-4 w-4" /> Nova tabela</Button>
            <IconButton size="small" type="button" onClick={l.recarregar} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></IconButton>
          </div>
        }
      />

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table size="small" className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <TableHead>
              <TableRow >
                <TableCell >#</TableCell>
                <TableCell >Nome</TableCell>
                <TableCell >Descrição</TableCell>
                <TableCell >Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {tabelas.length === 0 ? (
                <TableRow >
                  <TableCell align="center" colSpan={5}>
                    Nenhuma tabela de preço cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                tabelas.map((t) => (
                  <TableRow key={t.id} onClick={() =>
                      navigate({ to: `/catalogo/tabelas-preco/${t.public_id}` as "/" })
                    } sx={{ cursor: "pointer" }} hover>
                    <TableCell >#{t.id}</TableCell>
                    <TableCell >{t.nome}</TableCell>
                    <TableCell >{t.descricao || "—"}</TableCell>
                    <TableCell >
                      <StatusPill
                        status={t.ativa ? "ativo" : "inativo"}
                        label={t.ativa ? "Ativa" : "Inativa"}
                      />
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-2">
                        <Button variant="outlined" size="small" type="button" onClick={() => abrirModal(t)}>Editar</Button>
                        <Button variant="text" size="small" type="button" onClick={() =>
                            navigate({ to: `/catalogo/tabelas-preco/${t.public_id}` as "/" })
                          }>Preços <ArrowRight className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
                  <Chip label={<>{p}</>} size="small" variant={(p === l.paginaNum) ? "filled" : "outlined"} color={(p === l.paginaNum) ? "primary" : "default"} key={p} onClick={() => l.setPaginaNum(p)} />
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
          <TextField size="small" fullWidth
            required
            placeholder="Ex.: Atacado Serralheria, Parceiro Industrial, VIP"
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </FormField>
        <FormField label="Descrição" wide>
          <TextField size="small" fullWidth
            placeholder="Condições ou perfil de clientes elegíveis…"
            value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </FormField>
        <FormField label="" wide>
          <Typography component="label" className="mt-1 flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={f.ativa} onChange={(e) => setF({ ...f, ativa: e.target.checked })} />
            Tabela ativa
          </Typography>
        </FormField>
      </FormDialog>
    </>
  );
}
