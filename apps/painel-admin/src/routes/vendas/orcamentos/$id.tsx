import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { ApiError } from "@/lib/api";
import { brl, fmtData, statusLabel } from "@/lib/format";
import type {
  Contato,
  Empresa,
  ItemOrcamento,
  Orcamento,
  Produto,
  TabelaPreco,
} from "@/lib/models";
import { catalogoService, crmService, orcamentosService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useAuth } from "@/store/auth-store";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

export const Route = createFileRoute("/vendas/orcamentos/$id")({
  component: OrcamentoPage,
});

/** Máquina de status do orçamento (domínio `crm/orcamento.rs`). */
const TRANSICOES: Record<string, { para: string; rotulo: string; cor: string }[]> = {
  rascunho: [
    { para: "enviado", rotulo: "Enviar ao cliente", cor: "bg-lime text-primary-foreground" },
  ],
  enviado: [
    { para: "em_analise", rotulo: "Marcar em análise", cor: "bg-secondary text-foreground" },
    {
      para: "expirado",
      rotulo: "Expirar",
      cor: "border border-[#D92546]/30 text-[#D92546]",
    },
  ],
  em_analise: [
    { para: "aprovado", rotulo: "Aprovar", cor: "bg-lime text-primary-foreground" },
    { para: "recusado", rotulo: "Recusar", cor: "bg-[#D92546] text-white" },
    {
      para: "expirado",
      rotulo: "Expirar",
      cor: "border border-[#D92546]/30 text-[#D92546]",
    },
  ],
  aprovado: [
    {
      para: "expirado",
      rotulo: "Expirar",
      cor: "border border-[#D92546]/30 text-[#D92546]",
    },
  ],
};

const ETAPAS_CICLO = ["rascunho", "enviado", "em_analise", "aprovado", "convertido"] as const;

type LinhaItem = Omit<ItemOrcamento, "total">;

function OrcamentoPage() {
  const { id: ref } = Route.useParams();
  const navigate = useNavigate();
  const { pode } = useAuth();
  const podeEditar = pode("admin", "vendedor");

  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contato, setContato] = useState<Contato | null>(null);
  const [temEndFiscal, setTemEndFiscal] = useState(true);
  const [tabelaPreco, setTabelaPreco] = useState<TabelaPreco | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  const [itens, setItens] = useState<LinhaItem[]>([]);
  const [desconto, setDesconto] = useState("0");
  const [frete, setFrete] = useState("0");
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const preencher = useCallback((o: Orcamento) => {
    setDesconto(o.desconto);
    setFrete(o.frete);
    setItens((o.itens ?? []).map((i) => ({ ...i })));
    setDirty(false);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const o = await orcamentosService.buscar(ref);
      setOrc(o);
      // Canonicalização: id numérico na URL vira public_id (UUID mascarado).
      if (ref !== o.public_id) {
        void navigate({
          to: "/vendas/orcamentos/$id",
          params: { id: o.public_id },
          replace: true,
        });
      }
      if (!dirty) preencher(o);

      // Carrega empresa, endereços (para validar pré-requisito de conversão) e tabela de preços
      crmService
        .empresa(o.empresa_id)
        .then((emp) => {
          setEmpresa(emp);
          if (emp.tabela_preco_id) {
            catalogoService
              .tabela(emp.tabela_preco_id)
              .then(setTabelaPreco)
              .catch(() => setTabelaPreco(null));
          }
        })
        .catch(() => {});

      crmService
        .enderecos(o.empresa_id, "fiscal")
        .then((p) => setTemEndFiscal((p.itens ?? []).length > 0))
        .catch(() => {});

      if (o.contato_id) {
        crmService
          .contatos({ empresa_id: o.empresa_id, por_pagina: 100 })
          .then((p) => setContato((p.itens ?? []).find((c) => c.id === o.contato_id) ?? null))
          .catch(() => {});
      } else {
        setContato(null);
      }
    } catch {
      setErro("Orçamento não encontrado.");
    }
  }, [ref, dirty, preencher, navigate]);

  useEffect(() => {
    catalogoService
      .produtos({ por_pagina: 100, ativo: true })
      .then((p) => setProdutos(p.itens ?? []))
      .catch(() => {});
    void carregar();
  }, [carregar]);

  useRealtimeEvent(
    (t) => t.startsWith("orcamento."),
    (e) => {
      if (Number(e.dados["id"]) === orc?.id) void carregar();
    },
  );

  const totalItem = (i: LinhaItem) =>
    Math.max(
      0,
      (Number(i.preco_unitario) || 0) * (Number(i.quantidade) || 0) - (Number(i.desconto) || 0),
    );

  const subtotalItens = useMemo(() => itens.reduce((acc, i) => acc + totalItem(i), 0), [itens]);

  const totalGeral = useMemo(
    () => Math.max(0, subtotalItens - (Number(desconto) || 0) + (Number(frete) || 0)),
    [subtotalItens, desconto, frete],
  );

  const setItem = (idx: number, patch: Partial<LinhaItem>) => {
    setItens((l) => l.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
    setDirty(true);
  };

  /** Aplica preço da tabela da empresa quando disponível, senão preço de venda do catálogo. */
  const escolherProduto = (idx: number, produtoId: number | null) => {
    const p = produtos.find((x) => x.id === produtoId);
    if (!p) return;
    const precoTabela = tabelaPreco?.itens?.find((i) => i.produto_id === p.id)?.preco;
    setItem(idx, {
      produto_id: p.id,
      descricao: p.nome,
      preco_unitario: precoTabela ?? p.preco_venda,
    });
  };

  const addItem = () => {
    setItens((l) => [
      ...l,
      { produto_id: 0, descricao: "", quantidade: "1", preco_unitario: "0", desconto: "0" },
    ]);
    setDirty(true);
  };

  const salvar = async () => {
    if (!orc) return;
    const itensValidos = itens.filter((i) => i.produto_id > 0 && i.descricao.trim().length > 0);
    if (itensValidos.length === 0) {
      toast.error("O orçamento exige ao menos 1 item válido.");
      return;
    }
    setSalvando(true);
    try {
      const atualizado = await orcamentosService.salvarItens(orc.id, {
        itens: itensValidos.map((i) => ({
          produto_id: i.produto_id,
          descricao: i.descricao.trim(),
          quantidade: String(i.quantidade || "1"),
          preco_unitario: String(i.preco_unitario || "0"),
          desconto: String(i.desconto || "0"),
        })),
        desconto: String(desconto || "0"),
        frete: String(frete || "0"),
      });
      setOrc((prev) =>
        prev
          ? {
              ...prev,
              ...atualizado,
              itens: itensValidos.map((i) => ({ ...i, total: totalItem(i).toFixed(2) })),
            }
          : atualizado,
      );
      setDirty(false);
      toast.success("Itens e valores salvos.");
    } catch {
      toast.error("Falha ao salvar itens.");
    } finally {
      setSalvando(false);
    }
  };

  const transicionar = async (o: Orcamento, status: string) => {
    if (dirty && o.status === "rascunho") {
      await salvar();
    }
    try {
      const novo = await orcamentosService.transicionar(o.id, status);
      setOrc((prev) => (prev ? { ...prev, ...novo } : novo));
      toast.success(`Orçamento → ${statusLabel(status)}`);
    } catch {
      toast.error("Transição recusada pelo backend.");
    }
  };

  const converter = async (o: Orcamento) => {
    try {
      const pedido = await orcamentosService.converter(o.id);
      toast.success(`Orçamento convertido no pedido ${pedido.numero}.`);
      navigate({ to: `/vendas/pedidos/${pedido.id}` as "/" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        toast.error(
          "Conversão bloqueada: verifique se o orçamento possui contato vinculado e se a empresa tem endereço fiscal cadastrado.",
        );
      } else {
        toast.error("Falha ao converter orçamento.");
      }
    }
  };

  const editavel = podeEditar && orc?.status === "rascunho";
  const nomeEmpresa = empresa
    ? empresa.nome_fantasia || empresa.razao_social
    : orc
      ? `Empresa #${orc.empresa_id}`
      : "";

  return (
    <>
      {orc ? (
        <>
          <PageHeader
            title={`Orçamento #${orc.numero || orc.id}`}
            subtitle={`${nomeEmpresa}${contato ? ` · Contato: ${contato.nome}` : ""} · Validade: ${orc.valido_ate ? fmtData(orc.valido_ate) : "—"}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={orc.status} label={statusLabel(orc.status)} />
                {podeEditar &&
                  (TRANSICOES[orc.status] ?? []).map((t) => (
                    <Button variant="text" size="small" key={t.para} type="button" onClick={() => void transicionar(orc, t.para)}>{t.rotulo}</Button>
                  ))}
                {podeEditar && orc.status === "aprovado" && !orc.convertido_pedido_id && (
                  <Button variant="contained" size="small" type="button" onClick={() => void converter(orc)}>Converter em pedido <ArrowRight className="h-3.5 w-3.5" /></Button>
                )}
                {orc.convertido_pedido_id && (
                  <Link
                    to={`/vendas/pedidos/${orc.convertido_pedido_id}` as "/"}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-primary hover:bg-secondary"
                  >
                    Abrir Pedido #{orc.convertido_pedido_id} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            }
          />

          {/* Barra discreta de contexto comercial e pré-requisitos de conversão */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <Link
                to={`/crm/empresas/${orc.empresa_id}` as "/"}
                className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary hover:underline"
              >
                {nomeEmpresa}
                <ExternalLink className="h-3 w-3" />
              </Link>
              <span>Condição: {orc.condicao_pagamento || "—"}</span>
              {tabelaPreco && <span>Tabela aplicada: {tabelaPreco.nome}</span>}
              {(!orc.contato_id || !temEndFiscal) && orc.status !== "convertido" && (
                <span className="font-medium text-[#D9486E]">
                  {!orc.contato_id && "Sem contato vinculado. "}
                  {!temEndFiscal && "Empresa sem endereço fiscal cadastrado."}
                </span>
              )}
            </div>

            {/* Indicador linear de etapas */}
            <div className="flex items-center gap-1.5">
              {ETAPAS_CICLO.map((etapa, idx) => {
                const ativo = orc.status === etapa;
                return (
                  <span key={etapa} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="text-muted-foreground/40">›</span>}
                    <span className={ativo ? "font-bold text-primary" : "text-muted-foreground/70"}>
                      {statusLabel(etapa)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          <SectionCard className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
              <span className="text-sm font-bold">Itens do orçamento</span>
              {editavel && (
                <Button variant="outlined" size="small" type="button" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Item</Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table size="small" className="w-full text-sm">
                <TableHead>
                  <TableRow >
                    <TableCell >Produto / Descrição</TableCell>
                    <TableCell >Qtd</TableCell>
                    <TableCell >Preço unit.</TableCell>
                    <TableCell >Desc. item</TableCell>
                    <TableCell align="right">Subtotal</TableCell>
                    <TableCell  />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {itens.length === 0 ? (
                    <TableRow >
                      <TableCell align="center" colSpan={6}>
                        Nenhum item neste orçamento.
                      </TableCell>
                    </TableRow>
                  ) : (
                    itens.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell >
                          {editavel ? (
                            <div className="space-y-1.5">
                              <TextField size="small" fullWidth select
                                value={item.produto_id || ""}
                                onChange={(e) =>
                                  escolherProduto(
                                    idx,
                                    e.target.value ? Number(e.target.value) : null,
                                  )
                                }
                                aria-label="Produto" slotProps={{ select: { displayEmpty: true } }}>
                                <MenuItem value="">Selecione um produto…</MenuItem>
                                {produtos.map((p) => (
                                  <MenuItem key={p.id} value={String(p.id)}>
                                    {p.sku} · {p.nome}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <TextField size="small" fullWidth
                                placeholder="Descrição personalizada na proposta"
                                value={item.descricao}
                                onChange={(e) => setItem(idx, { descricao: e.target.value })} />
                            </div>
                          ) : (
                            <span className="font-medium">{item.descricao}</span>
                          )}
                        </TableCell>
                        <TableCell >
                          {editavel ? (
                            <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: "0.001" } }}
                              type="number"
                             
                             
                              value={item.quantidade}
                              onChange={(e) => setItem(idx, { quantidade: e.target.value })} />
                          ) : (
                            <span className="tabular-nums">{item.quantidade}</span>
                          )}
                        </TableCell>
                        <TableCell >
                          {editavel ? (
                            <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                              type="number"
                             
                             
                              value={item.preco_unitario}
                              onChange={(e) => setItem(idx, { preco_unitario: e.target.value })} />
                          ) : (
                            <span className="tabular-nums">{brl(item.preco_unitario)}</span>
                          )}
                        </TableCell>
                        <TableCell >
                          {editavel ? (
                            <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                              type="number"
                             
                             
                              value={item.desconto}
                              onChange={(e) => setItem(idx, { desconto: e.target.value })} />
                          ) : (
                            <span className="tabular-nums">{brl(item.desconto)}</span>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {brl(totalItem(item).toFixed(2))}
                        </TableCell>
                        <TableCell >
                          {editavel && itens.length > 1 && (
                            <Button variant="contained" color="error" size="small" type="button" onClick={() => {
                                setItens((l) => l.filter((_, i) => i !== idx));
                                setDirty(true);
                              }}>×</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border/60 bg-secondary/15 px-5 py-4">
              <div className="flex flex-wrap items-end gap-3">
                <Typography component="label" className="text-xs font-medium text-muted-foreground">
                  Desconto geral (R$)
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                    type="number"
                   
                   
                    disabled={!editavel}
                    value={desconto}
                    onChange={(e) => {
                      setDesconto(e.target.value);
                      setDirty(true);
                    }} />
                </Typography>
                <Typography component="label" className="text-xs font-medium text-muted-foreground">
                  Frete (R$)
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                    type="number"
                   
                   
                    disabled={!editavel}
                    value={frete}
                    onChange={(e) => {
                      setFrete(e.target.value);
                      setDirty(true);
                    }} />
                </Typography>
              </div>

              <div className="text-right space-y-0.5">
                <div className="text-xs text-muted-foreground tabular-nums">
                  Subtotal: {brl(subtotalItens.toFixed(2))}
                </div>
                <div className="text-xl font-bold tabular-nums tracking-tight">
                  Total: {brl(totalGeral.toFixed(2))}
                </div>
              </div>
            </div>

            {editavel && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <span className="text-xs text-muted-foreground">
                  {dirty ? "Alterações pendentes de salvamento" : "Itens sincronizados"}
                </span>
                <Button variant="contained" type="button" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar itens"}</Button>
              </div>
            )}
          </SectionCard>
        </>
      ) : (
        <SectionCard>
          <div className="py-10 text-center text-sm text-muted-foreground">
            {erro ?? "Carregando…"}
          </div>
        </SectionCard>
      )}
    </>
  );
}
