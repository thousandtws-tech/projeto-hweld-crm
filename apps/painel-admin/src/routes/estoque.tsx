import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { ApiError, api } from "@/lib/api";
import { fmtDataHora, qty } from "@/lib/format";
import type { Movimentacao, Produto, SaldoAbaixoMinimo } from "@/lib/models";
import { catalogoService, estoqueService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useResourceList } from "@/lib/use-resource-list";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/estoque")({
  beforeLoad: exigePerfil("admin", "estoque"),
  component: EstoquePage,
});

/* Reserva/saída de pedido e baixa por OS também movem estoque — extrato
 * e alertas revalidam quando qualquer origem movimenta. */
const EVENTOS = [
  "estoque.movimentado",
  "pedido.status_alterado",
  "os.criada",
  "os.status_alterada",
];

const TIPO_COR: Record<string, string> = {
  entrada: "pago",
  saida: "vencido",
  reserva: "em_andamento",
  liberacao_reserva: "enviado",
  ajuste: "draft",
};

const TIPO_LABEL: Record<string, string> = {
  entrada: "entrada",
  saida: "saída",
  reserva: "reserva",
  liberacao_reserva: "liberação de reserva",
  ajuste: "ajuste",
};

/** Origem da movimentação — pedido/OS quando não é lançamento manual. */
function Origem({ m }: { m: Movimentacao }) {
  if (m.pedido_id)
    return (
      <Link to={`/vendas/pedidos/${m.pedido_id}` as "/"} className="text-xs hover:underline">
        pedido #{m.pedido_id}
      </Link>
    );
  if (m.ordem_servico_id)
    return (
      <Link
        to={`/operacao/ordens-servico/${m.ordem_servico_id}` as "/"}
        className="text-xs hover:underline"
      >
        OS #{m.ordem_servico_id}
      </Link>
    );
  return <span className="text-xs text-muted-foreground">manual</span>;
}

/** Estoque: alertas de reposição + lançamento manual + extrato imutável. */
function EstoquePage() {
  const queryClient = useQueryClient();
  const [mostrarBaixos, setMostrarBaixos] = useState(true);
  const [f, setF] = useState({ produto_id: "", tipo: "entrada", quantidade: "1", motivo: "" });

  // Lookups cacheados — produtos alimentam o select e a resolução de nome.
  const { data: produtosPg } = useQuery({
    queryKey: ["lookup", "produtos"],
    queryFn: () => catalogoService.produtos({ por_pagina: 500 }).catch(() => ({ itens: [] })),
    staleTime: 60_000,
  });
  const produtos = produtosPg?.itens ?? [];
  const nomeProduto = (id: number) => produtos.find((p) => p.id === id)?.nome ?? `#${id}`;

  const { data: baixos = [] } = useQuery({
    queryKey: ["lookup", "estoque-baixos"],
    queryFn: () => estoqueService.abaixoDoMinimo().catch(() => [] as SaldoAbaixoMinimo[]),
    staleTime: 15_000,
  });
  const carregarBaixos = () =>
    void queryClient.invalidateQueries({ queryKey: ["lookup", "estoque-baixos"] });

  // Extrato: server-side, reconcilia nos eventos de estoque e nos derivados
  // (pedido/OS também movimentam saldo).
  const l = useResourceList<Movimentacao>({
    recurso: "estoque/movimentacoes",
    porPagina: 50,
    busca: false,
    eventos: EVENTOS,
  });
  const movimentacoes = l.itens;
  const carregarMovs = l.recarregar;

  useRealtimeEvent(EVENTOS, carregarBaixos);

  const lancar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.produto_id || !f.quantidade) return;
    try {
      await estoqueService.lancar({
        produto_id: Number(f.produto_id),
        tipo: f.tipo,
        quantidade: String(f.quantidade),
        motivo: f.motivo || undefined,
      });
      carregarMovs();
      carregarBaixos();
      setF((p) => ({ ...p, quantidade: "1", motivo: "" }));
      toast.success("Lançamento registrado.");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 422
          ? "Inválido — entrada deve ser positiva, ajuste não pode ser zero."
          : "Falha ao lançar.",
      );
    }
  };

  return (
    <>
      <PageHeader title="Estoque" />

      {baixos.length > 0 && (
        <div className="rounded-2xl bg-[var(--pill-warn-bg)] px-4 py-3 text-sm text-[var(--pill-warn-fg)]">
          <strong>{baixos.length}</strong> produto(s) abaixo do mínimo.{" "}
          <Button variant="text" onClick={() => setMostrarBaixos((v) => !v)}>{mostrarBaixos ? "ocultar" : "ver"}</Button>
        </div>
      )}

      {baixos.length > 0 && mostrarBaixos && (
        <SectionCard className="p-0 overflow-hidden">
          <Table size="small" className="w-full text-sm">
            <TableHead>
              <TableRow >
                <TableCell >Produto</TableCell>
                <TableCell align="right">Disponível</TableCell>
                <TableCell align="right">Reservado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* backend já envia o produto junto do saldo */}
              {baixos.map((s) => (
                <TableRow key={s.produto.id}>
                  <TableCell >
                    <Link
                      to={`/catalogo/produtos/${s.produto.id}` as "/"}
                      className="font-medium hover:underline"
                    >
                      {s.produto.sku} · {s.produto.nome}
                    </Link>
                  </TableCell>
                  <TableCell align="right">
                    {qty(s.saldo.quantidade_disponivel)}
                  </TableCell>
                  <TableCell align="right">
                    {qty(s.saldo.quantidade_reservada)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <SectionCard>
        <Typography variant="h6" component="h2" className="mb-3 text-sm font-semibold">Lançar movimentação</Typography>
        <Box component="form"
          onSubmit={lancar}
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_1fr_auto]"
        >
          <Typography component="label" className="text-xs font-medium text-muted-foreground">
            Produto
            <TextField size="small" fullWidth select
              required
              value={f.produto_id}
              onChange={(e) => setF({ ...f, produto_id: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
              <MenuItem value="">—</MenuItem>
              {produtos.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.sku} · {p.nome}
                </MenuItem>
              ))}
            </TextField>
          </Typography>
          <Typography component="label" className="text-xs font-medium text-muted-foreground">
            Tipo
            <TextField size="small" fullWidth select
              value={f.tipo}
              onChange={(e) => setF({ ...f, tipo: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
              {/* backend só aceita lançamento manual desses dois — reserva/saída
                  nascem de pedidos e ordens de serviço */}
              <MenuItem value="entrada">Entrada</MenuItem>
              <MenuItem value="ajuste">Ajuste</MenuItem>
            </TextField>
          </Typography>
          <Typography component="label" className="text-xs font-medium text-muted-foreground">
            Quantidade
            <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: f.tipo === "ajuste" ? undefined : "0.001" } }}
              type="number"
             
             
              required
              value={f.quantidade}
              onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
          </Typography>
          <Typography component="label" className="text-xs font-medium text-muted-foreground">
            Motivo
            <TextField size="small" fullWidth
              value={f.motivo}
              onChange={(e) => setF({ ...f, motivo: e.target.value })} />
          </Typography>
          <Button variant="contained" >Lançar</Button>
        </Box>
      </SectionCard>

      <SectionCard className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2 text-sm font-semibold">
          Extrato{" "}
          <span className="font-normal text-muted-foreground">
            (append-only — correção é novo lançamento)
          </span>
        </div>
        <Table size="small" className="w-full text-sm">
          <TableHead>
            <TableRow >
              <TableCell >Quando</TableCell>
              <TableCell >Produto</TableCell>
              <TableCell >Tipo</TableCell>
              <TableCell align="right">Qtd</TableCell>
              <TableCell align="right">Saldo</TableCell>
              <TableCell >Origem</TableCell>
              <TableCell >Motivo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {movimentacoes.length === 0 && (
              <TableRow >
                <TableCell align="center" colSpan={7}>
                  Sem movimentações.
                </TableCell>
              </TableRow>
            )}
            {movimentacoes.map((m) => (
              <TableRow key={m.id}>
                <TableCell >
                  {fmtDataHora(m.created_at)}
                </TableCell>
                <TableCell >{nomeProduto(m.produto_id)}</TableCell>
                <TableCell >
                  <StatusPill
                    status={TIPO_COR[m.tipo] ?? "draft"}
                    label={TIPO_LABEL[m.tipo] ?? m.tipo}
                  />
                </TableCell>
                <TableCell align="right">{qty(m.quantidade)}</TableCell>
                <TableCell align="right">
                  {qty(m.saldo_antes)} → {qty(m.saldo_depois)}
                </TableCell>
                <TableCell >
                  <Origem m={m} />
                </TableCell>
                <TableCell >{m.motivo || "—"}</TableCell>
              </TableRow>
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
