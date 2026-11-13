import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";

import { Metabox, PageHeader, StatusPill } from "@/components/ui-kit/primitives";
import { FormField } from "@/components/ui-kit/FormDialog";
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
import Alert from "@mui/material/Alert";
import Pagination from "@mui/material/Pagination";
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
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => setMostrarBaixos((v) => !v)}>
              {mostrarBaixos ? "ocultar" : "ver"}
            </Button>
          }
        >
          <strong>{baixos.length}</strong> produto(s) abaixo do estoque mínimo.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Coluna principal — ledger append-only */}
        <Metabox
        title="Extrato de movimentações"
        action={
          <span className="font-normal text-muted-foreground text-xs">
            append-only — correção é novo lançamento
          </span>
        }
        contentClassName="p-0"
      >
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
            <span className="text-xs text-muted-foreground">
              Página {l.paginaNum} de {l.pagina.total_paginas} · {l.pagina.total} registro(s)
            </span>
            <Pagination
              size="small"
              count={l.pagina.total_paginas}
              page={l.paginaNum}
              onChange={(_, p) => l.setPaginaNum(p)}
              shape="rounded"
            />
          </div>
        )}
        </Metabox>

        {/* Sidebar — ação rápida + alertas, padrão WooCommerce */}
        <div className="space-y-5">
          <Metabox title="Lançar movimentação">
            <Box component="form" onSubmit={lancar} className="space-y-5">
              <FormField label="Produto *">
                <TextField size="small" fullWidth select
                  required
                  value={f.produto_id}
                  onChange={(e) => setF({ ...f, produto_id: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                  <MenuItem value="">Selecione…</MenuItem>
                  {produtos.map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.sku} · {p.nome}
                    </MenuItem>
                  ))}
                </TextField>
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo">
                  <TextField size="small" fullWidth select
                    value={f.tipo}
                    onChange={(e) => setF({ ...f, tipo: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                    {/* backend só aceita lançamento manual desses dois — reserva/saída
                        nascem de pedidos e ordens de serviço */}
                    <MenuItem value="entrada">Entrada</MenuItem>
                    <MenuItem value="ajuste">Ajuste</MenuItem>
                  </TextField>
                </FormField>
                <FormField label="Quantidade *">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: f.tipo === "ajuste" ? undefined : "0.001" } }}
                    type="number"
                    required
                    value={f.quantidade}
                    onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
                </FormField>
              </div>
              <FormField label="Motivo">
                <TextField size="small" fullWidth
                  value={f.motivo}
                  onChange={(e) => setF({ ...f, motivo: e.target.value })}
                  placeholder="Opcional — ex.: balanço, compra, perda" />
              </FormField>
              <Button variant="contained" type="submit" fullWidth>Lançar</Button>
            </Box>
          </Metabox>

          {baixos.length > 0 && mostrarBaixos && (
            <Metabox
              title="Abaixo do mínimo"
              action={
                <Typography variant="caption" color="warning.main" fontWeight={600}>
                  {baixos.length} produto(s)
                </Typography>
              }
              contentClassName="p-0"
            >
              {/* backend já envia o produto junto do saldo */}
              {baixos.map((s, i) => (
                <Link
                  key={s.produto.id}
                  to={`/catalogo/produtos/${s.produto.id}` as "/"}
                  className={`flex items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-secondary/60 ${
                    i > 0 ? "border-t border-border/60" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.produto.nome}</span>
                    <span className="block text-xs text-muted-foreground">{s.produto.sku}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="block font-semibold tabular-nums text-destructive">
                      {qty(s.saldo.quantidade_disponivel)} disp.
                    </span>
                    <span className="block tabular-nums text-muted-foreground">
                      {qty(s.saldo.quantidade_reservada)} reserv.
                    </span>
                  </span>
                </Link>
              ))}
            </Metabox>
          )}
        </div>
      </div>
    </>
  );
}
