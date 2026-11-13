import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { ApiError } from "@/lib/api";
import { brl, fmtData, statusLabel } from "@/lib/format";
import type {
  Contato,
  Oportunidade,
  Orcamento,
  Produto,
  StatusOrcamento,
  TabelaPreco,
} from "@/lib/models";
import { catalogoService, crmService, orcamentosService } from "@/lib/services";
import { useEmpresasMap } from "@/lib/use-empresas";
import { useResourceList } from "@/lib/use-resource-list";
import { useAuth } from "@/store/auth-store";
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
import InputBase from "@mui/material/InputBase";

export const Route = createFileRoute("/vendas/orcamentos/")({
  component: OrcamentosIndexPage,
});

const STATUS_ORCAMENTO: StatusOrcamento[] = [
  "rascunho",
  "enviado",
  "em_analise",
  "aprovado",
  "convertido",
  "recusado",
  "expirado",
];

/** Próxima transição rápida direta da listagem (máquina de estados do domínio). */
const ACAO_RAPIDA: Partial<Record<StatusOrcamento, { para: StatusOrcamento; rotulo: string }>> = {
  rascunho: { para: "enviado", rotulo: "Enviar" },
  enviado: { para: "em_analise", rotulo: "Em análise" },
  em_analise: { para: "aprovado", rotulo: "Aprovar" },
};

const valorNum = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function diasAteValidade(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

type ItemNovoForm = {
  produto_id: string;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
  desconto: string;
};

function OrcamentosIndexPage() {
  const navigate = useNavigate();
  const { user, pode } = useAuth();
  const podeEditar = pode("admin", "vendedor");

  const empresas = useEmpresasMap();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tabelasCache, setTabelasCache] = useState<Map<number, TabelaPreco>>(new Map());

  // Filtros (status+busca já existem server-side; ordenação é da página visível)
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [ordenacao, setOrdenacao] = useState<"recentes" | "maior_valor" | "validade">("recentes");

  const l = useResourceList<Orcamento>({
    recurso: "orcamentos",
    filtros: { status: filtroStatus || undefined },
    eventos: ["orcamento.criado", "orcamento.status_alterado", "orcamento.convertido"],
  });
  const carregando = l.carregando;
  const carregar = l.recarregar;
  const busca = l.busca;
  const setBusca = l.setBusca;

  // Modal de Novo Orçamento
  const [novoOpen, setNovoOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fNovo, setFNovo] = useState({
    empresa_id: "",
    contato_id: "",
    oportunidade_id: "",
    valido_ate: "",
    condicao_pagamento: "30 dias",
    desconto: "0",
    frete: "0",
    observacoes: "",
  });
  const [itensNovo, setItensNovo] = useState<ItemNovoForm[]>([
    { produto_id: "", descricao: "", quantidade: "1", preco_unitario: "0", desconto: "0" },
  ]);

  // Carrega catálogos auxiliares ao abrir o modal de criação
  useEffect(() => {
    if (!novoOpen) return;
    if (produtos.length === 0) {
      catalogoService
        .produtos({ por_pagina: 100, ativo: true })
        .then((p) => setProdutos(p.itens ?? []))
        .catch(() => toast.error("Falha ao carregar produtos."));
    }
    crmService
      .contatos({ por_pagina: 100 })
      .then((p) => setContatos(p.itens ?? []))
      .catch(() => toast.error("Falha ao carregar contatos."));
    crmService
      .oportunidades({ por_pagina: 100 })
      .then((p) => setOportunidades(p.itens ?? []))
      .catch(() => toast.error("Falha ao carregar oportunidades."));
  }, [novoOpen, produtos.length]);

  const empresaNome = useCallback(
    (id: number) => {
      const e = empresas.get(id);
      return e ? e.nome_fantasia || e.razao_social : `Empresa #${id}`;
    },
    [empresas],
  );

  // Ao selecionar a empresa no modal, busca a tabela de preço vinculada (se houver) e pré-seleciona o contato principal
  const aoEscolherEmpresaNovo = async (empresaIdStr: string) => {
    const empId = Number(empresaIdStr);
    const emp = empresas.get(empId);
    const contatosEmp = contatos.filter((c) => c.empresa_id === empId);
    const principal = contatosEmp.find((c) => c.is_principal) ?? contatosEmp[0];

    setFNovo((prev) => ({
      ...prev,
      empresa_id: empresaIdStr,
      contato_id: principal ? String(principal.id) : "",
      oportunidade_id: "",
    }));

    if (emp?.tabela_preco_id && !tabelasCache.has(emp.tabela_preco_id)) {
      try {
        const tb = await catalogoService.tabela(emp.tabela_preco_id);
        setTabelasCache((prev) => new Map(prev).set(tb.id, tb));
      } catch {
        /* fallback para preço padrão do produto */
      }
    }
  };

  /** Algoritmo de Precificação B2B: aplica preço da tabela da empresa quando disponível, senão preço de venda do catálogo. */
  const resolverPrecoProduto = (produtoId: number, empresaId: number): string => {
    const emp = empresas.get(empresaId);
    if (emp?.tabela_preco_id) {
      const tb = tabelasCache.get(emp.tabela_preco_id);
      const itemTb = tb?.itens?.find((i) => i.produto_id === produtoId);
      if (itemTb?.preco) return itemTb.preco;
    }
    return produtos.find((p) => p.id === produtoId)?.preco_venda ?? "0";
  };

  const escolherProdutoNovo = (idx: number, prodIdStr: string) => {
    const prod = produtos.find((p) => p.id === Number(prodIdStr));
    const preco = prod ? resolverPrecoProduto(prod.id, Number(fNovo.empresa_id)) : "0";
    setItensNovo((lista) =>
      lista.map((item, i) =>
        i === idx
          ? {
              ...item,
              produto_id: prodIdStr,
              descricao: prod?.nome ?? "",
              preco_unitario: preco,
            }
          : item,
      ),
    );
  };

  const atualizarItemNovo = (idx: number, patch: Partial<ItemNovoForm>) => {
    setItensNovo((lista) => lista.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const totalItemNovo = (i: ItemNovoForm) =>
    Math.max(0, valorNum(i.preco_unitario) * valorNum(i.quantidade) - valorNum(i.desconto));

  const totalGeralNovo = useMemo(() => {
    const sub = itensNovo.reduce((acc, i) => acc + totalItemNovo(i), 0);
    return Math.max(0, sub - valorNum(fNovo.desconto) + valorNum(fNovo.frete));
  }, [itensNovo, fNovo.desconto, fNovo.frete]);

  // Ordenação local da página visível — status e busca já são server-side.
  const orcamentosFiltrados = useMemo(() => {
    return [...l.itens].sort((a, b) => {
      if (ordenacao === "maior_valor") return valorNum(b.total) - valorNum(a.total);
      if (ordenacao === "validade") {
        const va = a.valido_ate ?? "9999-12-31";
        const vb = b.valido_ate ?? "9999-12-31";
        return va.localeCompare(vb);
      }
      return b.id - a.id;
    });
  }, [l.itens, ordenacao]);

  // Resumo financeiro no subtítulo (reflete a página carregada)
  const metricas = useMemo(() => {
    const orcamentos = l.itens;
    const emAberto = orcamentos.filter((o) =>
      ["rascunho", "enviado", "em_analise"].includes(o.status),
    );
    const aprovados = orcamentos.filter((o) => o.status === "aprovado");
    const convertidos = orcamentos.filter((o) => o.status === "convertido");

    const valorEmAberto = emAberto.reduce((acc, o) => acc + valorNum(o.total), 0);
    const valorAprovado = aprovados.reduce((acc, o) => acc + valorNum(o.total), 0);
    const valorConvertido = convertidos.reduce((acc, o) => acc + valorNum(o.total), 0);

    return {
      emAbertoCount: emAberto.length,
      aprovadosCount: aprovados.length,
      valorEmAberto,
      valorAprovado,
      valorConvertido,
    };
  }, [l.itens]);

  const abrirModalNovo = () => {
    // Sugere validade padrão de +15 dias
    const d = new Date();
    d.setDate(d.getDate() + 15);
    const validadePadrao = d.toISOString().slice(0, 10);

    setFNovo({
      empresa_id: "",
      contato_id: "",
      oportunidade_id: "",
      valido_ate: validadePadrao,
      condicao_pagamento: "30 dias",
      desconto: "0",
      frete: "0",
      observacoes: "",
    });
    setItensNovo([
      { produto_id: "", descricao: "", quantidade: "1", preco_unitario: "0", desconto: "0" },
    ]);
    setNovoOpen(true);
  };

  const criarOrcamento = async (e: React.FormEvent) => {
    e.preventDefault();
    const itensValidos = itensNovo.filter((i) => Number(i.produto_id) > 0);
    if (!fNovo.empresa_id || itensValidos.length === 0) {
      toast.error("Selecione a empresa e ao menos um produto.");
      return;
    }
    setSalvando(true);
    try {
      const criado = await orcamentosService.criar({
        empresa_id: Number(fNovo.empresa_id),
        contato_id: fNovo.contato_id ? Number(fNovo.contato_id) : null,
        oportunidade_id: fNovo.oportunidade_id ? Number(fNovo.oportunidade_id) : null,
        vendedor_id: user?.id || 1,
        valido_ate: fNovo.valido_ate || null,
        desconto: String(fNovo.desconto || "0"),
        frete: String(fNovo.frete || "0"),
        condicao_pagamento: fNovo.condicao_pagamento.trim() || null,
        observacoes: fNovo.observacoes.trim() || null,
        itens: itensValidos.map((i) => ({
          produto_id: Number(i.produto_id),
          descricao: i.descricao.trim() || "Item",
          quantidade: String(i.quantidade || "1"),
          preco_unitario: String(i.preco_unitario || "0"),
          desconto: String(i.desconto || "0"),
        })),
      });
      setNovoOpen(false);
      toast.success(`Orçamento #${criado.numero || criado.id} criado.`);
      navigate({ to: `/vendas/orcamentos/${criado.id}` as "/" });
    } catch {
      toast.error("Falha ao criar orçamento.");
    } finally {
      setSalvando(false);
    }
  };

  const transicionarRapido = async (o: Orcamento, para: StatusOrcamento) => {
    try {
      await orcamentosService.transicionar(o.id, para);
      l.recarregar();
      toast.success(`Orçamento #${o.numero || o.id} → ${statusLabel(para)}`);
    } catch {
      toast.error("Transição recusada pelo backend.");
    }
  };

  const converterRapido = async (o: Orcamento) => {
    try {
      const pedido = await orcamentosService.converter(o.id);
      toast.success(`Convertido no pedido ${pedido.numero}.`);
      navigate({ to: `/vendas/pedidos/${pedido.id}` as "/" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        toast.error(
          "Para converter em pedido, a empresa precisa de endereço fiscal e o orçamento precisa ter um contato vinculado.",
        );
      } else {
        toast.error("Falha ao converter orçamento.");
      }
    }
  };

  const contatosDaEmpresaNovo = useMemo(
    () => contatos.filter((c) => c.empresa_id === Number(fNovo.empresa_id)),
    [contatos, fNovo.empresa_id],
  );

  const opsDaEmpresaNovo = useMemo(
    () =>
      oportunidades.filter(
        (o) =>
          o.empresa_id === Number(fNovo.empresa_id) &&
          o.estagio !== "ganha" &&
          o.estagio !== "perdida",
      ),
    [oportunidades, fNovo.empresa_id],
  );

  return (
    <>
      <PageHeader
        title="Orçamentos"
        subtitle={`Em negociação: ${brl(metricas.valorEmAberto.toFixed(2))} (${metricas.emAbertoCount}) · Aprovados p/ converter: ${brl(metricas.valorAprovado.toFixed(2))} (${metricas.aprovadosCount}) · Convertidos: ${brl(metricas.valorConvertido.toFixed(2))}`}
        action={
          podeEditar && (
            <Button variant="contained" type="button" onClick={abrirModalNovo}><Plus className="h-4 w-4" /> Novo orçamento</Button>
          )
        }
      />

      {/* Barra de filtros minimalista */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <InputBase type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nº ou empresa…" inputProps={{ "aria-label": "Buscar", autoComplete: "off", name: "busca-orcamentos" }} className="min-w-0 flex-1 text-xs sm:text-sm" />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Chip label={<>Todos ({l.pagina?.total ?? l.itens.length})</>} size="small" variant={(filtroStatus === "") ? "filled" : "outlined"} color={(filtroStatus === "") ? "primary" : "default"} onClick={() => setFiltroStatus("")} />
            {STATUS_ORCAMENTO.map((st) => {
              // Contadores refletem a página atual — o backend não expõe
              // totais por status sem endpoint dedicado.
              const count = l.itens.filter((o) => o.status === st).length;
              if (count === 0 && filtroStatus !== st) return null;
              return (
                <Chip label={<>{statusLabel(st)} ({count})</>} size="small" variant={(filtroStatus === st) ? "filled" : "outlined"} color={(filtroStatus === st) ? "primary" : "default"} key={st} onClick={() => setFiltroStatus(filtroStatus === st ? "" : st)} />
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TextField size="small" select aria-label="Ordenar" value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as typeof ordenacao)} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="recentes">Ordenar: Mais recentes</MenuItem>
            <MenuItem value="maior_valor">Ordenar: Maior valor</MenuItem>
            <MenuItem value="validade">Ordenar: Validade</MenuItem>
          </TextField>

          <IconButton size="small" type="button" onClick={() => void carregar()} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></IconButton>
        </div>
      </div>

      {/* Tabela de Orçamentos */}
      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table size="small" className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <TableHead>
              <TableRow >
                <TableCell >Nº</TableCell>
                <TableCell >Empresa</TableCell>
                <TableCell >Status</TableCell>
                <TableCell >Condição</TableCell>
                <TableCell >Validade</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {orcamentosFiltrados.length === 0 ? (
                <TableRow >
                  <TableCell align="center" colSpan={7}>
                    Nenhum orçamento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                orcamentosFiltrados.map((o) => {
                  const diasVal = diasAteValidade(o.valido_ate);
                  const terminal = ["recusado", "expirado", "convertido"].includes(o.status);
                  const vencido = !terminal && diasVal !== null && diasVal < 0;
                  const venceBreve = !terminal && diasVal !== null && diasVal >= 0 && diasVal <= 3;
                  const acao = ACAO_RAPIDA[o.status as StatusOrcamento];

                  return (
                    <TableRow key={o.id} onClick={() => navigate({ to: `/vendas/orcamentos/${o.id}` as "/" })} sx={{ cursor: "pointer" }} hover>
                      <TableCell >
                        #{o.numero || o.id}
                        {o.created_at && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {fmtData(o.created_at)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell >
                        <Link
                          to={`/crm/empresas/${o.empresa_id}` as "/"}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:underline"
                        >
                          {empresaNome(o.empresa_id)}
                        </Link>
                      </TableCell>
                      <TableCell >
                        <StatusPill status={o.status} label={statusLabel(o.status)} />
                      </TableCell>
                      <TableCell >
                        {o.condicao_pagamento || "—"}
                      </TableCell>
                      <TableCell >
                        {o.valido_ate ? (
                          <span
                            className={
                              vencido
                                ? "font-semibold text-[#D92546]"
                                : venceBreve
                                  ? "font-medium text-[#D9486E]"
                                  : "text-muted-foreground"
                            }
                          >
                            {fmtData(o.valido_ate)}
                            {vencido
                              ? ` (vencido há ${Math.abs(diasVal!)}d)`
                              : venceBreve
                                ? diasVal === 0
                                  ? " (vence hoje)"
                                  : ` (${diasVal}d)`
                                : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {brl(o.total)}
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          {podeEditar && acao && (
                            <Button variant="outlined" size="small" type="button" onClick={() => void transicionarRapido(o, acao.para)}>{acao.rotulo}
                              <ChevronRight className="h-3 w-3" /></Button>
                          )}
                          {podeEditar && o.status === "aprovado" && !o.convertido_pedido_id && (
                            <Button variant="contained" size="small" type="button" onClick={() => void converterRapido(o)}>Converter em pedido
                              <ArrowRight className="h-3 w-3" /></Button>
                          )}
                          {o.convertido_pedido_id && (
                            <Link
                              to={`/vendas/pedidos/${o.convertido_pedido_id}` as "/"}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-secondary"
                            >
                              Pedido #{o.convertido_pedido_id}
                            </Link>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
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

      {/* Modal: Novo Orçamento com Precificação por Tabela da Empresa */}
      <FormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        title="Novo orçamento"
        description="A tabela de preços da empresa é aplicada automaticamente aos produtos selecionados"
        submitLabel={salvando ? "Criando…" : `Criar orçamento (${brl(totalGeralNovo.toFixed(2))})`}
        onSubmit={criarOrcamento}
      >
        <FormField label="Empresa (Cliente) *">
          <TextField size="small" fullWidth select
            required
            value={fNovo.empresa_id}
            onChange={(e) => void aoEscolherEmpresaNovo(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">Selecione…</MenuItem>
            {[...empresas.values()].map((emp) => (
              <MenuItem key={emp.id} value={String(emp.id)}>
                {emp.nome_fantasia || emp.razao_social}
              </MenuItem>
            ))}
          </TextField>
        </FormField>

        <FormField label="Contato (necessário p/ converter em pedido)">
          <TextField size="small" fullWidth select
            value={fNovo.contato_id}
            onChange={(e) => setFNovo({ ...fNovo, contato_id: e.target.value })}
            disabled={!fNovo.empresa_id} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">—</MenuItem>
            {contatosDaEmpresaNovo.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nome}
              </MenuItem>
            ))}
          </TextField>
        </FormField>

        <FormField label="Oportunidade vinculada">
          <TextField size="small" fullWidth select
            value={fNovo.oportunidade_id}
            onChange={(e) => setFNovo({ ...fNovo, oportunidade_id: e.target.value })}
            disabled={!fNovo.empresa_id} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">— Opcional —</MenuItem>
            {opsDaEmpresaNovo.map((op) => (
              <MenuItem key={op.id} value={String(op.id)}>
                {op.titulo}
              </MenuItem>
            ))}
          </TextField>
        </FormField>

        <FormField label="Validade">
          <DateField value={fNovo.valido_ate} onChange={(v) => setFNovo({ ...fNovo, valido_ate: v })} />
        </FormField>

        <FormField label="Condição de pagamento" wide>
          <TextField size="small" fullWidth
            placeholder="Ex.: 28/56/84 DDL ou Boleto 30 dias"
            value={fNovo.condicao_pagamento}
            onChange={(e) => setFNovo({ ...fNovo, condicao_pagamento: e.target.value })} />
        </FormField>

        {/* Itens iniciais do orçamento */}
        <div className="sm:col-span-2 space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Itens do orçamento
            </span>
            <Button variant="outlined" size="small" type="button" onClick={() =>
                setItensNovo((l) => [
                  ...l,
                  {
                    produto_id: "",
                    descricao: "",
                    quantidade: "1",
                    preco_unitario: "0",
                    desconto: "0",
                  },
                ])
              }>+ Adicionar item</Button>
          </div>

          <div className="space-y-2">
            {itensNovo.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-secondary/20 p-2.5 sm:grid-cols-[1fr_76px_96px_auto]"
              >
                <TextField size="small" fullWidth select
                  aria-label="Produto"
                  required
                  value={item.produto_id}
                  onChange={(e) => escolherProdutoNovo(idx, e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
                  <MenuItem value="">Selecione um produto…</MenuItem>
                  {produtos.map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.sku} · {p.nome} ({brl(p.preco_venda)})
                    </MenuItem>
                  ))}
                </TextField>
                <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: "0.001" } }}
                  aria-label="Quantidade"
                  type="number"
                 
                 
                  placeholder="Qtd"
                  value={item.quantidade}
                  onChange={(e) => atualizarItemNovo(idx, { quantidade: e.target.value })} />
                <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                  aria-label="Preço unitário"
                  type="number"
                 
                 
                  placeholder="Preço"
                  value={item.preco_unitario}
                  onChange={(e) => atualizarItemNovo(idx, { preco_unitario: e.target.value })} />
                {itensNovo.length > 1 && (
                  <Button variant="contained" color="error" size="small" type="button" onClick={() => setItensNovo((l) => l.filter((_, i) => i !== idx))}>×</Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <FormField label="Desconto geral (R$)">
          <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
            type="number"
           
           
            value={fNovo.desconto}
            onChange={(e) => setFNovo({ ...fNovo, desconto: e.target.value })} />
        </FormField>

        <FormField label="Frete (R$)">
          <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
            type="number"
           
           
            value={fNovo.frete}
            onChange={(e) => setFNovo({ ...fNovo, frete: e.target.value })} />
        </FormField>
      </FormDialog>
    </>
  );
}
