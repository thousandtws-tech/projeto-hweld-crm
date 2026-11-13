import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { Metabox, PageHeader, StatusPill } from "@/components/ui-kit/primitives";
import { brl, fmtData, fmtDataHoraCompleta, statusLabel } from "@/lib/format";
import type { Empresa, ItemPedido, NotaFiscal, Pagamento, Pedido } from "@/lib/models";
import { crmService, financeiroService, fiscalService, pedidosService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useAuth } from "@/store/auth-store";
import Button from "@mui/material/Button";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

export const Route = createFileRoute("/vendas/pedidos/$id")({
  component: PedidoDetalhePage,
});

type PedidoDetalhe = Pedido & { itens?: ItemPedido[] };

const TRANSICOES: Record<string, { para: string; rotulo: string; cor: string }[]> = {
  aguardando_pagamento: [
    { para: "confirmado", rotulo: "Confirmar pagamento", cor: "bg-lime text-primary-foreground" },
    {
      para: "cancelado",
      rotulo: "Cancelar",
      cor: "border border-[#D92546]/30 text-[#D92546]",
    },
  ],
  confirmado: [
    { para: "em_separacao", rotulo: "Iniciar separação", cor: "bg-lime text-primary-foreground" },
    {
      para: "cancelado",
      rotulo: "Cancelar",
      cor: "border border-[#D92546]/30 text-[#D92546]",
    },
  ],
  em_separacao: [
    { para: "faturado", rotulo: "Faturar", cor: "bg-lime text-primary-foreground" },
    {
      para: "cancelado",
      rotulo: "Cancelar",
      cor: "border border-[#D92546]/30 text-[#D92546]",
    },
  ],
  faturado: [{ para: "enviado", rotulo: "Marcar enviado", cor: "bg-lime text-primary-foreground" }],
  enviado: [
    { para: "entregue", rotulo: "Marcar entregue", cor: "bg-lime text-primary-foreground" },
  ],
  entregue: [{ para: "concluir", rotulo: "Concluir", cor: "bg-lime text-primary-foreground" }],
};

// Corrige o slug de transição final: "concluido"
TRANSICOES.entregue = [
  { para: "concluido", rotulo: "Concluir", cor: "bg-lime text-primary-foreground" },
];

const STEPS = [
  "aguardando_pagamento",
  "confirmado",
  "em_separacao",
  "faturado",
  "enviado",
  "entregue",
  "concluido",
];

function PedidoDetalhePage() {
  const { id: ref } = Route.useParams();
  const navigate = useNavigate();
  const { pode } = useAuth();
  const podeVendas = pode("admin", "vendedor");
  const podeFinanceiro = pode("admin", "financeiro");

  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [parcelas, setParcelas] = useState<Pagamento[]>([]);
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const p = await pedidosService.detalhe(ref);
      setPedido(p);
      // Canonicalização: id numérico na URL vira public_id (UUID mascarado).
      if (ref !== p.public_id) {
        void navigate({
          to: "/vendas/pedidos/$id",
          params: { id: p.public_id },
          replace: true,
        });
      }
      crmService
        .empresa(p.empresa_id)
        .then(setEmpresa)
        .catch(() => {});

      if (podeFinanceiro) {
        financeiroService
          .pagamentos({ pedido_id: p.id, por_pagina: 50 })
          .then((res) => setParcelas(res.itens ?? []))
          .catch(() => toast.error("Falha ao carregar parcelas do pedido."));
        fiscalService
          .listar({ pedido_id: p.id, por_pagina: 20 })
          .then((res) => setNotas(res.itens ?? []))
          .catch(() => toast.error("Falha ao carregar notas fiscais do pedido."));
      }
    } catch {
      setErro("Pedido não encontrado.");
    }
  }, [ref, podeFinanceiro, navigate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(
    ["pedido.status_alterado", "pagamento.parcelas", "pagamento.baixado", "pagamento.estornado"],
    (e) => {
      if (Number(e.dados["id"] ?? e.dados["pedido_id"]) === pedido?.id) void carregar();
    },
  );

  const transicionar = async (p: PedidoDetalhe, status: string) => {
    try {
      const novo = await pedidosService.transicionar(p.id, status);
      setPedido({ ...p, ...novo });
      toast.success(`Pedido → ${statusLabel(status)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transição recusada pelo backend.");
    }
  };

  const emitirNfRapido = async () => {
    if (!pedido) return;
    try {
      await fiscalService.emitir(pedido.id);
      void carregar();
      toast.success("Nota fiscal emitida em rascunho.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao emitir NF.");
    }
  };

  const idx = (s: string) => Math.max(0, STEPS.indexOf(s));
  const nomeEmpresa = empresa
    ? empresa.nome_fantasia || empresa.razao_social
    : pedido
      ? `Empresa #${pedido.empresa_id}`
      : "";

  return (
    <>
      {pedido ? (
        <>
          <PageHeader
            title={`Pedido ${pedido.numero}`}
            subtitle={`${nomeEmpresa} · Origem: ${pedido.origem} · ${fmtDataHoraCompleta(pedido.created_at)}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={pedido.status} label={statusLabel(pedido.status)} />
                {podeVendas &&
                  (TRANSICOES[pedido.status] ?? []).map((t) => (
                    <Button
                      variant={t.para === "cancelado" ? "outlined" : "contained"}
                      color={t.para === "cancelado" ? "error" : "primary"}
                      size="small"
                      key={t.para}
                      type="button"
                      onClick={() => void transicionar(pedido, t.para)}
                    >
                      {t.rotulo}
                    </Button>
                  ))}
              </div>
            }
          />

          {/* Stepper do fluxo do pedido — MUI Stepper (padrao Woo) */}
          {pedido.status !== "cancelado" && (
            <Metabox title="Progresso do pedido" className="mb-5">
              <Stepper activeStep={idx(pedido.status)} alternativeLabel>
                {STEPS.map((s) => (
                  <Step key={s}>
                    <StepLabel>{statusLabel(s)}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            </Metabox>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-5">
              <Metabox
                title="Itens do pedido"
                action={
                  <span className="text-xs text-muted-foreground">
                    {(pedido.itens ?? []).length} item(ns)
                  </span>
                }
                contentClassName="p-0"
              >
                <Table size="small" className="w-full text-sm">
                  <TableHead>
                    <TableRow >
                      <TableCell >SKU</TableCell>
                      <TableCell >Descrição</TableCell>
                      <TableCell >Qtd</TableCell>
                      <TableCell >Unit.</TableCell>
                      <TableCell >Desc.</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(pedido.itens ?? []).length === 0 && (
                      <TableRow >
                        <TableCell align="center" colSpan={6}>
                          Sem itens.
                        </TableCell>
                      </TableRow>
                    )}
                    {(pedido.itens ?? []).map((i, ix) => (
                      <TableRow key={ix}>
                        <TableCell >
                          {i.sku}
                        </TableCell>
                        <TableCell >{i.descricao}</TableCell>
                        <TableCell >{i.quantidade}</TableCell>
                        <TableCell >{brl(i.preco_unitario)}</TableCell>
                        <TableCell >{brl(i.desconto)}</TableCell>
                        <TableCell align="right">
                          {brl(i.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Metabox>

              {/* Vínculo Financeiro e Fiscal (visível para Admin e Financeiro) */}
              {podeFinanceiro && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Metabox
                    title={`Parcelas (${parcelas.length})`}
                    action={
                      <Link
                        to="/financeiro/pagamentos"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Gerenciar →
                      </Link>
                    }
                  >
                    {parcelas.length === 0 ? (
                      <Typography variant="body2" component="p" className="text-xs text-muted-foreground">
                        Nenhuma parcela gerada para este pedido.
                      </Typography>
                    ) : (
                      <List disablePadding>
                        {parcelas.map((parc) => (
                          <ListItem key={parc.id}>
                            <span>
                              {parc.parcela}ª · Venc. {fmtData(parc.vencimento)}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold tabular-nums">{brl(parc.valor)}</span>
                              <StatusPill status={parc.status} label={statusLabel(parc.status)} />
                            </div>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Metabox>

                  <Metabox
                    title={`Notas Fiscais (${notas.length})`}
                    action={
                      notas.length === 0 && pedido.status !== "cancelado" ? (
                        <Button variant="outlined" size="small" type="button" onClick={() => void emitirNfRapido()}>+ Emitir rascunho NF</Button>
                      ) : (
                        <Link
                          to="/fiscal/notas"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Módulo fiscal →
                        </Link>
                      )
                    }
                  >
                    {notas.length === 0 ? (
                      <Typography variant="body2" component="p" className="text-xs text-muted-foreground">
                        Nenhuma nota fiscal emitida para este pedido.
                      </Typography>
                    ) : (
                      <List disablePadding>
                        {notas.map((nf) => (
                          <ListItem key={nf.id}>
                            <span>NF #{nf.numero || nf.id}</span>
                            <StatusPill status={nf.status} label={statusLabel(nf.status)} />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Metabox>
                </div>
              )}
            </div>

            <div className="h-fit space-y-5">
              <Metabox title="Resumo financeiro">
                <Box component="dl" className="grid grid-cols-2 gap-y-2 text-sm tabular-nums">
                  <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">Subtotal</Typography>
                  <Typography component="dd" variant="body2" className="text-right">{brl(pedido.subtotal)}</Typography>
                  <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">Desconto</Typography>
                  <Typography component="dd" variant="body2" className="text-right">−{brl(pedido.desconto)}</Typography>
                  <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">Frete</Typography>
                  <Typography component="dd" variant="body2" className="text-right">{brl(pedido.frete)}</Typography>
                  <Typography component="dt" variant="caption" color="text.secondary" display="block" className="border-t border-border pt-2 font-bold">Total</Typography>
                  <Typography component="dd" variant="body2" className="border-t border-border pt-2 text-right text-lg font-bold">
                    {brl(pedido.total)}
                  </Typography>
                </Box>
              </Metabox>

              <Metabox title="Cliente">
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Empresa</span>
                    <div className="mt-1">
                      <Link
                        to={`/crm/empresas/${pedido.empresa_id}` as "/"}
                        className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {nomeEmpresa}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                  <Divider />
                  <div>
                    <span className="text-muted-foreground">Condição de pagamento</span>
                    <Typography variant="body2" component="p" className="mt-1 font-medium text-foreground">
                      {pedido.condicao_pagamento || "—"}
                    </Typography>
                  </div>
                  <Divider />
                  <div>
                    <span className="text-muted-foreground">Observações</span>
                    <Typography variant="body2" component="p" className="mt-1 text-foreground">{pedido.observacoes || "—"}</Typography>
                  </div>
                </div>
              </Metabox>
            </div>
          </div>
        </>
      ) : (
        <Metabox title="Pedido">
          <div className="py-10 text-center text-sm text-muted-foreground">
            {erro ?? "Carregando…"}
          </div>
        </Metabox>
      )}
    </>
  );
}
