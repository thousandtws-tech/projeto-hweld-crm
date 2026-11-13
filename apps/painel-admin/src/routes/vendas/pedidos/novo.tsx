import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import type { Contato, Empresa, Produto } from "@/lib/models";
import { catalogoService, crmService, pedidosService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/vendas/pedidos/novo")({
  component: PedidoNovoPage,
});

type Linha = Record<string, unknown>;
type Item = {
  produto_id: number | null;
  sku: string;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
  desconto: string;
};

/** Pedido manual (televendas) — POST /pedidos com origem=manual implícito no backend. */
function PedidoNovoPage() {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [enderecos, setEnderecos] = useState<Linha[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [f, setF] = useState({
    empresa_id: "",
    contato_id: "",
    endereco_faturamento_id: "",
    endereco_entrega_id: "",
    condicao_pagamento: "",
    observacoes: "",
  });
  const [itens, setItens] = useState<Item[]>([
    {
      produto_id: null,
      sku: "",
      descricao: "",
      quantidade: "1",
      preco_unitario: "0",
      desconto: "0",
    },
  ]);

  useEffect(() => {
    crmService.empresas({ por_pagina: 100, status: "ativo" }).then((p) => setEmpresas(p.itens));
    catalogoService.produtos({ por_pagina: 100, ativo: true }).then((p) => setProdutos(p.itens));
  }, []);

  const aoTrocarEmpresa = (empresaId: string) => {
    setF((p) => ({ ...p, empresa_id: empresaId }));
    if (!empresaId) {
      setContatos([]);
      setEnderecos([]);
      return;
    }
    const id = Number(empresaId);
    crmService.contatos({ empresa_id: id }).then((p) => setContatos(p.itens));
    crmService.enderecos(id).then((p) => setEnderecos(p.itens));
  };

  const setItem = (idx: number, patch: Partial<Item>) =>
    setItens((l) => l.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  const escolherProduto = (idx: number, produtoId: number | null) => {
    const p = produtos.find((x) => x.id === produtoId);
    setItem(idx, {
      produto_id: p?.id ?? null,
      sku: p?.sku ?? "",
      descricao: p?.nome ?? "",
      preco_unitario: p?.preco_venda ?? "0",
    });
  };

  const addItem = () =>
    setItens((l) => [
      ...l,
      {
        produto_id: null,
        sku: "",
        descricao: "",
        quantidade: "1",
        preco_unitario: "0",
        desconto: "0",
      },
    ]);

  const valido =
    f.empresa_id &&
    f.contato_id &&
    f.endereco_faturamento_id &&
    f.endereco_entrega_id &&
    itens.length > 0 &&
    itens.every((i) => i.produto_id);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    setSalvando(true);
    try {
      const pedido = await pedidosService.criarManual({
        empresa_id: Number(f.empresa_id),
        contato_id: Number(f.contato_id),
        endereco_faturamento_id: Number(f.endereco_faturamento_id),
        endereco_entrega_id: Number(f.endereco_entrega_id),
        condicao_pagamento: f.condicao_pagamento || undefined,
        observacoes: f.observacoes || undefined,
        itens: itens.map((i) => ({
          produto_id: i.produto_id,
          sku: i.sku,
          descricao: i.descricao,
          quantidade: String(i.quantidade),
          preco_unitario: String(i.preco_unitario),
          desconto: String(i.desconto),
        })),
      });
      toast.success("Pedido criado.");
      navigate({ to: `/vendas/pedidos/${pedido.id}` as "/" });
    } catch {
      toast.error("Falha ao criar pedido.");
    } finally {
      setSalvando(false);
    }
  };

  const enderecoLabel = (e: Linha) =>
    `${e["logradouro"] ?? ""} — ${e["cidade"] ?? ""}/${e["uf"] ?? ""}`;

  return (
    <>
      <PageHeader title="Novo pedido manual" />
      <Box component="form" onSubmit={criar} className="space-y-4">
        <SectionCard>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Empresa">
              <TextField size="small" fullWidth select
                required
                value={f.empresa_id}
                onChange={(e) => aoTrocarEmpresa(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">—</MenuItem>
                {empresas.map((e) => (
                  <MenuItem key={e.id} value={String(e.id)}>
                    {e.nome_fantasia || e.razao_social}
                  </MenuItem>
                ))}
              </TextField>
            </FormField>
            <FormField label="Contato">
              <TextField size="small" fullWidth select
                required
                value={f.contato_id}
                onChange={(e) => setF({ ...f, contato_id: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">—</MenuItem>
                {contatos.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    {c.nome}
                  </MenuItem>
                ))}
              </TextField>
            </FormField>
            <FormField label="Condição de pagamento">
              <TextField size="small" fullWidth
                placeholder="ex.: faturado 30dd"
                value={f.condicao_pagamento}
                onChange={(e) => setF({ ...f, condicao_pagamento: e.target.value })} />
            </FormField>
            <FormField label="End. faturamento">
              <TextField size="small" fullWidth select
                required
                value={f.endereco_faturamento_id}
                onChange={(e) => setF({ ...f, endereco_faturamento_id: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">—</MenuItem>
                {enderecos.map((e) => (
                  <MenuItem key={String(e["id"])} value={String(e["id"])}>
                    {enderecoLabel(e)}
                  </MenuItem>
                ))}
              </TextField>
            </FormField>
            <FormField label="End. entrega">
              <TextField size="small" fullWidth select
                required
                value={f.endereco_entrega_id}
                onChange={(e) => setF({ ...f, endereco_entrega_id: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">—</MenuItem>
                {enderecos.map((e) => (
                  <MenuItem key={String(e["id"])} value={String(e["id"])}>
                    {enderecoLabel(e)}
                  </MenuItem>
                ))}
              </TextField>
            </FormField>
          </div>
        </SectionCard>

        <SectionCard className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-sm font-semibold">Itens</span>
            <Button variant="outlined" size="small" type="button" onClick={addItem}>+ Item</Button>
          </div>
          <div className="overflow-x-auto">
            <Table size="small" className="w-full text-sm">
              <TableHead>
                <TableRow >
                  <TableCell >Produto</TableCell>
                  <TableCell >Qtd</TableCell>
                  <TableCell >Preço</TableCell>
                  <TableCell >Desc.</TableCell>
                  <TableCell  />
                </TableRow>
              </TableHead>
              <TableBody>
                {itens.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell >
                      <TextField size="small" fullWidth select
                        value={item.produto_id ?? ""}
                        onChange={(e) =>
                          escolherProduto(idx, e.target.value ? Number(e.target.value) : null)
                        }
                        aria-label="Produto" slotProps={{ select: { displayEmpty: true } }}>
                        <MenuItem value="">—</MenuItem>
                        {produtos.map((p) => (
                          <MenuItem key={p.id} value={String(p.id)}>
                            {p.sku} · {p.nome}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell >
                      <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001" } }}
                        type="number"
                       
                        value={item.quantidade}
                        onChange={(e) => setItem(idx, { quantidade: e.target.value })} />
                    </TableCell>
                    <TableCell >
                      <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                        type="number"
                       
                        value={item.preco_unitario}
                        onChange={(e) => setItem(idx, { preco_unitario: e.target.value })} />
                    </TableCell>
                    <TableCell >
                      <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                        type="number"
                       
                        value={item.desconto}
                        onChange={(e) => setItem(idx, { desconto: e.target.value })} />
                    </TableCell>
                    <TableCell >
                      <Button variant="contained" color="error" size="small" type="button" onClick={() => setItens((l) => l.filter((_, i) => i !== idx))}>×</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard>
          <Typography component="label" className="block text-xs font-medium text-muted-foreground">
            Observações
            <TextField size="small" fullWidth multiline minRows={3}
              rows={2}
              value={f.observacoes}
              onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
          </Typography>
        </SectionCard>

        <div className="flex gap-2">
          <Button variant="contained" type="submit" disabled={!valido || salvando}>Criar pedido</Button>
          <Link
            to="/vendas/pedidos"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Cancelar
          </Link>
        </div>
      </Box>
    </>
  );
}
