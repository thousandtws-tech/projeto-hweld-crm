import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { api } from "@/lib/api";
import { brl, fmtData, statusLabel } from "@/lib/format";
import { exigePerfil } from "@/lib/guards";
import type { Pagamento, Pedido, StatusPagamento } from "@/lib/models";
import { financeiroService } from "@/lib/services";
import { useEmpresasNomes } from "@/lib/use-empresas";
import { useResourceList } from "@/lib/use-resource-list";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { DateField } from "@/components/ui-kit/DateField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

export const Route = createFileRoute("/financeiro/pagamentos")({
  beforeLoad: exigePerfil("admin", "financeiro"),
  component: PagamentosPage,
});

const EV_PAGAMENTO = ["pagamento.parcelas", "pagamento.baixado", "pagamento.estornado"];

/** Formas de pagamento canônicas (`migrations/0001_acesso.sql`). */
const FORMAS_PAGAMENTO = [
  { id: 1, nome: "PIX", permiteParcelamento: false, maxParcelas: 1 },
  { id: 2, nome: "Boleto", permiteParcelamento: true, maxParcelas: 12 },
  { id: 3, nome: "Cartão Crédito", permiteParcelamento: true, maxParcelas: 12 },
  { id: 4, nome: "Cartão Débito", permiteParcelamento: false, maxParcelas: 1 },
  { id: 5, nome: "Transferência", permiteParcelamento: false, maxParcelas: 1 },
  { id: 6, nome: "Dinheiro", permiteParcelamento: false, maxParcelas: 1 },
];

const STATUS_PAGAMENTO: StatusPagamento[] = [
  "pendente",
  "vencido",
  "pago",
  "estornado",
  "cancelado",
];

type Modal = "parcelas" | "baixa" | "estorno" | null;

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function diasAteVencimento(isoDate: string): number | null {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function PagamentosPage() {
  const [filtroStatus, setFiltroStatus] = useState<string>("");

  const l = useResourceList<Pagamento>({
    recurso: "pagamentos",
    filtros: { status: filtroStatus || undefined },
    eventos: EV_PAGAMENTO,
  });
  const carregando = l.carregando;
  const carregar = l.recarregar;
  const busca = l.busca;
  const setBusca = l.setBusca;

  // Lookups compartilhados: número do pedido na linha + pedidos elegíveis no
  // modal de parcelas. Ambos cacheados e coalescidos entre as páginas.
  const empresas = useEmpresasNomes();
  const { data: pedidosPg } = useQuery({
    queryKey: ["lookup", "pedidos"],
    queryFn: () =>
      api.lista<Pedido>("pedidos", { por_pagina: 500 }).catch(() => ({ itens: [] as Pedido[] })),
    staleTime: 30_000,
  });
  const pedidos = useMemo(
    () => new Map((pedidosPg?.itens ?? []).map((p) => [p.id, p])),
    [pedidosPg],
  );

  const [modal, setModal] = useState<Modal>(null);
  const [alvo, setAlvo] = useState<Pagamento | null>(null);

  const [fParc, setFParc] = useState({
    pedido_id: "",
    forma_pagamento_id: "2",
    quantidade: "1",
    primeiro_vencimento: "",
    intervalo_dias: "30",
  });
  const [fBaixa, setFBaixa] = useState({ forma_pagamento_id: "1", observacao: "" });
  const [motivo, setMotivo] = useState("");

  const nomeForma = (id: number | null) => FORMAS_PAGAMENTO.find((f) => f.id === id)?.nome ?? "—";

  const pedidoLabel = useCallback(
    (pedidoId: number) => {
      const ped = pedidos.get(pedidoId);
      if (!ped) return `#${pedidoId}`;
      const emp = empresas.get(ped.empresa_id);
      return emp ? `${ped.numero} · ${emp}` : ped.numero;
    },
    [pedidos, empresas],
  );

  // Pedidos elegíveis que ainda não possuem parcelas geradas. Olha o lookup
  // de pedidos + a página atual de pagamentos — aproximação assumida; a
  // checagem definitiva é o backend na hora de gerar.
  const pedidosSemParcelas = useMemo(() => {
    const comParcelas = new Set(l.itens.map((p) => p.pedido_id));
    return [...pedidos.values()].filter((p) => p.status !== "cancelado" && !comParcelas.has(p.id));
  }, [pedidos, l.itens]);

  // Status/busca já são server-side.
  const pagamentosFiltrados = l.itens;

  const metricas = useMemo(() => {
    let aReceber = 0;
    let vencido = 0;
    let recebido = 0;
    for (const p of l.itens) {
      const v = num(p.valor);
      if (p.status === "pago") recebido += v;
      else if (p.status === "vencido") vencido += v;
      else if (p.status === "pendente") {
        const d = diasAteVencimento(p.vencimento);
        if (d !== null && d < 0) vencido += v;
        else aReceber += v;
      }
    }
    return { aReceber, vencido, recebido };
  }, [l.itens]);

  const abrirModalParcelas = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setFParc({
      pedido_id: pedidosSemParcelas[0] ? String(pedidosSemParcelas[0].id) : "",
      forma_pagamento_id: "2",
      quantidade: "1",
      primeiro_vencimento: d.toISOString().slice(0, 10),
      intervalo_dias: "30",
    });
    setModal("parcelas");
  };

  const formaSelecionadaParc = FORMAS_PAGAMENTO.find(
    (f) => f.id === Number(fParc.forma_pagamento_id),
  );

  // Prévia do plano de parcelas (espelha `plano_parcelas` do Rust)
  const previaParcelaValor = useMemo(() => {
    const ped = pedidos.get(Number(fParc.pedido_id));
    const qtd = Math.max(1, Number(fParc.quantidade) || 1);
    if (!ped) return null;
    return num(ped.total) / qtd;
  }, [pedidos, fParc.pedido_id, fParc.quantidade]);

  const gerar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await financeiroService.gerarParcelas({
        pedido_id: Number(fParc.pedido_id),
        quantidade: Number(fParc.quantidade),
        primeiro_vencimento: fParc.primeiro_vencimento,
        intervalo_dias: fParc.intervalo_dias ? Number(fParc.intervalo_dias) : undefined,
        forma_pagamento_id: fParc.forma_pagamento_id ? Number(fParc.forma_pagamento_id) : undefined,
      });
      setModal(null);
      void carregar();
      toast.success("Parcelas geradas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar parcelas.");
    }
  };

  const baixar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alvo) return;
    try {
      await financeiroService.baixar(
        alvo.id,
        Number(fBaixa.forma_pagamento_id),
        fBaixa.observacao.trim() || undefined,
      );
      setModal(null);
      void carregar();
      toast.success("Pagamento baixado e lançado no caixa.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na baixa.");
    }
  };

  const estornar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alvo || !motivo.trim()) return;
    try {
      await financeiroService.estornar(alvo.id, motivo.trim());
      setModal(null);
      setMotivo("");
      void carregar();
      toast.success("Parcela estornada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no estorno.");
    }
  };

  return (
    <>
      <PageHeader
        title="Pagamentos"
        subtitle={`A receber: ${brl(metricas.aReceber.toFixed(2))} · Vencido: ${brl(metricas.vencido.toFixed(2))} · Recebido: ${brl(metricas.recebido.toFixed(2))}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="contained" type="button" onClick={abrirModalParcelas}><Plus className="h-4 w-4" /> Gerar parcelas</Button>
            <IconButton size="small" type="button" onClick={() => void carregar()} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></IconButton>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <TextField size="small" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pedido ou cliente…" />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Chip label={<>Todos ({l.pagina?.total ?? l.itens.length})</>} size="small" variant={(filtroStatus === "") ? "filled" : "outlined"} color={(filtroStatus === "") ? "primary" : "default"} onClick={() => setFiltroStatus("")} />
            {STATUS_PAGAMENTO.map((st) => {
              const count = l.itens.filter((p) => p.status === st).length;
              if (count === 0 && filtroStatus !== st) return null;
              return (
                <Chip label={<>{statusLabel(st)} ({count})</>} size="small" variant={(filtroStatus === st) ? "filled" : "outlined"} color={(filtroStatus === st) ? "primary" : "default"} key={st} onClick={() => setFiltroStatus(filtroStatus === st ? "" : st)} />
              );
            })}
          </div>
        </div>
      </div>

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table size="small" className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <TableHead>
              <TableRow >
                <TableCell >Pedido / Cliente</TableCell>
                <TableCell >Parcela</TableCell>
                <TableCell >Forma</TableCell>
                <TableCell >Vencimento</TableCell>
                <TableCell >Status</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {pagamentosFiltrados.length === 0 && (
                <TableRow >
                  <TableCell align="center" colSpan={7}>
                    Nenhuma parcela encontrada.
                  </TableCell>
                </TableRow>
              )}
              {pagamentosFiltrados.map((p) => {
                const dias = diasAteVencimento(p.vencimento);
                const atrasada =
                  (p.status === "pendente" || p.status === "vencido") && dias !== null && dias < 0;

                return (
                  <TableRow key={p.id}>
                    <TableCell >
                      <Link
                        to={`/vendas/pedidos/${p.pedido_id}` as "/"}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {pedidoLabel(p.pedido_id)}
                      </Link>
                    </TableCell>
                    <TableCell >{p.parcela}ª</TableCell>
                    <TableCell >
                      {nomeForma(p.forma_pagamento_id)}
                    </TableCell>
                    <TableCell >
                      <span className={atrasada ? "font-semibold text-[#D92546]" : ""}>
                        {fmtData(p.vencimento)}
                        {atrasada ? ` (${Math.abs(dias!)}d atraso)` : ""}
                      </span>
                    </TableCell>
                    <TableCell >
                      <StatusPill status={p.status} label={statusLabel(p.status)} />
                    </TableCell>
                    <TableCell align="right">
                      {brl(p.valor)}
                    </TableCell>
                    <TableCell align="right">
                      {(p.status === "pendente" || p.status === "vencido") && (
                        <Button variant="contained" size="small" type="button" onClick={() => {
                            setAlvo(p);
                            setFBaixa({
                              forma_pagamento_id: String(p.forma_pagamento_id ?? 1),
                              observacao: "",
                            });
                            setModal("baixa");
                          }}>Baixar</Button>
                      )}
                      {p.status === "pago" && (
                        <Button variant="contained" color="error" size="small" type="button" onClick={() => {
                            setAlvo(p);
                            setMotivo("");
                            setModal("estorno");
                          }}>Estornar</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
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

      {/* Modal: Gerar Parcelas */}
      <FormDialog
        open={modal === "parcelas"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Gerar parcelas do pedido"
        description="A última parcela absorve automaticamente centavos de arredondamento"
        submitLabel="Gerar parcelas"
        onSubmit={gerar}
      >
        <FormField label="Pedido *" wide>
          {pedidosSemParcelas.length > 0 ? (
            <TextField size="small" fullWidth select
              required
              value={fParc.pedido_id}
              onChange={(e) => setFParc({ ...fParc, pedido_id: e.target.value })}>
              <MenuItem value="">Selecione um pedido…</MenuItem>
              {pedidosSemParcelas.map((ped) => (
                <MenuItem key={ped.id} value={String(ped.id)}>
                  #{ped.id} · {pedidoLabel(ped.id)} — {brl(ped.total)}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField size="small" fullWidth
              type="number"
              required
              placeholder="ID do pedido"
              value={fParc.pedido_id}
              onChange={(e) => setFParc({ ...fParc, pedido_id: e.target.value })} />
          )}
        </FormField>

        <FormField label="Forma de pagamento">
          <TextField size="small" fullWidth select
            value={fParc.forma_pagamento_id}
            onChange={(e) => {
              const novaForma = FORMAS_PAGAMENTO.find((f) => f.id === Number(e.target.value));
              setFParc({
                ...fParc,
                forma_pagamento_id: e.target.value,
                quantidade: novaForma && !novaForma.permiteParcelamento ? "1" : fParc.quantidade,
              });
            }}>
            {FORMAS_PAGAMENTO.map((f) => (
              <MenuItem key={f.id} value={String(f.id)}>
                {f.nome} {f.permiteParcelamento ? `(até ${f.maxParcelas}x)` : "(à vista)"}
              </MenuItem>
            ))}
          </TextField>
        </FormField>

        <FormField label="Nº de parcelas">
          <TextField size="small" fullWidth slotProps={{ htmlInput: { min: "1", max: formaSelecionadaParc?.maxParcelas ?? 12 } }}
            type="number"
           
           
            disabled={formaSelecionadaParc && !formaSelecionadaParc.permiteParcelamento}
            required
            value={fParc.quantidade}
            onChange={(e) => setFParc({ ...fParc, quantidade: e.target.value })} />
        </FormField>

        <FormField label="1º vencimento *">
          <DateField required value={fParc.primeiro_vencimento} onChange={(v) => setFParc({ ...fParc, primeiro_vencimento: v })} />
        </FormField>

        <FormField label="Intervalo entre parcelas (dias)">
          <TextField size="small" fullWidth slotProps={{ htmlInput: { min: "1" } }}
            type="number"
           
            placeholder="30"
            value={fParc.intervalo_dias}
            onChange={(e) => setFParc({ ...fParc, intervalo_dias: e.target.value })} />
        </FormField>

        {previaParcelaValor !== null && (
          <div className="sm:col-span-2 rounded-2xl border border-border bg-secondary/30 px-3.5 py-2.5 text-xs text-muted-foreground">
            Prévia:{" "}
            <strong className="text-foreground">
              {fParc.quantidade}x de ~{brl(previaParcelaValor.toFixed(2))}
            </strong>
          </div>
        )}
      </FormDialog>

      {/* Modal: Baixar Parcela */}
      <FormDialog
        open={modal === "baixa"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Baixar parcela"
        description={
          alvo
            ? `${alvo.parcela}ª parcela · ${pedidoLabel(alvo.pedido_id)} · Valor: ${brl(alvo.valor)}`
            : ""
        }
        submitLabel="Confirmar recebimento"
        onSubmit={baixar}
      >
        <FormField label="Forma de pagamento recebida *" wide>
          <TextField size="small" fullWidth select
            required
            value={fBaixa.forma_pagamento_id}
            onChange={(e) => setFBaixa({ ...fBaixa, forma_pagamento_id: e.target.value })}>
            {FORMAS_PAGAMENTO.map((f) => (
              <MenuItem key={f.id} value={String(f.id)}>
                {f.nome}
              </MenuItem>
            ))}
          </TextField>
        </FormField>
        <FormField label="Observação (comprovante / NSU)" wide>
          <TextField size="small" fullWidth
            placeholder="Opcional — requer caixa aberto para registrar o recebimento"
            value={fBaixa.observacao}
            onChange={(e) => setFBaixa({ ...fBaixa, observacao: e.target.value })} />
        </FormField>
      </FormDialog>

      {/* Modal: Estornar Parcela */}
      <FormDialog
        open={modal === "estorno"}
        onOpenChange={(o) => !o && setModal(null)}
        title="Estornar pagamento"
        description={
          alvo
            ? `${alvo.parcela}ª parcela · ${pedidoLabel(alvo.pedido_id)} (${brl(alvo.valor)})`
            : ""
        }
        submitLabel="Confirmar estorno"
        onSubmit={estornar}
      >
        <FormField label="Motivo do estorno (obrigatório) *" wide>
          <TextField size="small" fullWidth
            required
            placeholder="Descreva a razão do estorno no caixa…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)} />
        </FormField>
      </FormDialog>
    </>
  );
}
