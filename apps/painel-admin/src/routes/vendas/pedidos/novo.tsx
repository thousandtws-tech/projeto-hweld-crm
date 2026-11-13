import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import type { Contato, Empresa, Produto } from "@/lib/models";
import { catalogoService, crmService, pedidosService } from "@/lib/services";
import TextField from "@mui/material/TextField";

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
      <form onSubmit={criar} className="space-y-4">
        <SectionCard>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Empresa">
              <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
                required
                value={f.empresa_id}
                onChange={(e) => aoTrocarEmpresa(e.target.value)}>
                <option value="">—</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome_fantasia || e.razao_social}
                  </option>
                ))}
              </TextField>
            </FormField>
            <FormField label="Contato">
              <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
                required
                value={f.contato_id}
                onChange={(e) => setF({ ...f, contato_id: e.target.value })}>
                <option value="">—</option>
                {contatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
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
              <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
                required
                value={f.endereco_faturamento_id}
                onChange={(e) => setF({ ...f, endereco_faturamento_id: e.target.value })}>
                <option value="">—</option>
                {enderecos.map((e) => (
                  <option key={String(e["id"])} value={String(e["id"])}>
                    {enderecoLabel(e)}
                  </option>
                ))}
              </TextField>
            </FormField>
            <FormField label="End. entrega">
              <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
                required
                value={f.endereco_entrega_id}
                onChange={(e) => setF({ ...f, endereco_entrega_id: e.target.value })}>
                <option value="">—</option>
                {enderecos.map((e) => (
                  <option key={String(e["id"])} value={String(e["id"])}>
                    {enderecoLabel(e)}
                  </option>
                ))}
              </TextField>
            </FormField>
          </div>
        </SectionCard>

        <SectionCard className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-sm font-semibold">Itens</span>
            <button
              type="button"
              onClick={addItem}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              + Item
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="min-w-56 px-4 py-2 font-semibold">Produto</th>
                  <th className="px-4 py-2 font-semibold">Qtd</th>
                  <th className="px-4 py-2 font-semibold">Preço</th>
                  <th className="px-4 py-2 font-semibold">Desc.</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {itens.map((item, idx) => (
                  <tr key={idx} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
                        value={item.produto_id ?? ""}
                        onChange={(e) =>
                          escolherProduto(idx, e.target.value ? Number(e.target.value) : null)
                        }
                        aria-label="Produto">
                        <option value="">—</option>
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.nome}
                          </option>
                        ))}
                      </TextField>
                    </td>
                    <td className="px-4 py-2">
                      <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001" } }}
                        type="number"
                       
                        value={item.quantidade}
                        onChange={(e) => setItem(idx, { quantidade: e.target.value })} />
                    </td>
                    <td className="px-4 py-2">
                      <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                        type="number"
                       
                        value={item.preco_unitario}
                        onChange={(e) => setItem(idx, { preco_unitario: e.target.value })} />
                    </td>
                    <td className="px-4 py-2">
                      <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                        type="number"
                       
                        value={item.desconto}
                        onChange={(e) => setItem(idx, { desconto: e.target.value })} />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setItens((l) => l.filter((_, i) => i !== idx))}
                        className="rounded-full border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard>
          <label className="block text-xs font-medium text-muted-foreground">
            Observações
            <TextField size="small" fullWidth multiline minRows={3}
              rows={2}
              value={f.observacoes}
              onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
          </label>
        </SectionCard>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!valido || salvando}
            className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            Criar pedido
          </button>
          <Link
            to="/vendas/pedidos"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </>
  );
}
