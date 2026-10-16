import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { ApiError } from "@/lib/api";
import { brl, fmtData, statusLabel } from "@/lib/format";
import type {
  Contato,
  Empresa,
  Oportunidade,
  Orcamento,
  Produto,
  StatusOrcamento,
  TabelaPreco,
} from "@/lib/models";
import { catalogoService, crmService, orcamentosService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useAuth } from "@/store/auth-store";

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

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [empresas, setEmpresas] = useState<Map<number, Empresa>>(new Map());
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tabelasCache, setTabelasCache] = useState<Map<number, TabelaPreco>>(new Map());
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [ordenacao, setOrdenacao] = useState<"recentes" | "maior_valor" | "validade">("recentes");

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

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [pOrcs, pEmps] = await Promise.all([
        orcamentosService.listar({ por_pagina: 100 }),
        crmService.empresas({ por_pagina: 100 }),
      ]);
      setOrcamentos(pOrcs.itens ?? []);
      setEmpresas(new Map((pEmps.itens ?? []).map((e) => [e.id, e])));
    } catch {
      if (!silencioso) toast.error("Falha ao carregar orçamentos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(
    ["orcamento.criado", "orcamento.status_alterado", "orcamento.convertido"],
    () => void carregar(true),
  );

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

  // Filtragem e Ordenação
  const orcamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = orcamentos.filter((o) => {
      if (filtroStatus && o.status !== filtroStatus) return false;
      if (termo) {
        const emp = empresaNome(o.empresa_id).toLowerCase();
        const numStr = (o.numero || String(o.id)).toLowerCase();
        if (!emp.includes(termo) && !numStr.includes(termo)) return false;
      }
      return true;
    });

    return [...filtrados].sort((a, b) => {
      if (ordenacao === "maior_valor") return valorNum(b.total) - valorNum(a.total);
      if (ordenacao === "validade") {
        const va = a.valido_ate ?? "9999-12-31";
        const vb = b.valido_ate ?? "9999-12-31";
        return va.localeCompare(vb);
      }
      return b.id - a.id;
    });
  }, [orcamentos, busca, filtroStatus, ordenacao, empresaNome]);

  // Resumo financeiro no subtítulo
  const metricas = useMemo(() => {
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
  }, [orcamentos]);

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
      const atualizado = await orcamentosService.transicionar(o.id, para);
      setOrcamentos((lista) =>
        lista.map((x) => (x.id === atualizado.id ? { ...x, ...atualizado } : x)),
      );
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
    <AppShell>
      <PageHeader
        title="Orçamentos"
        subtitle={`Em negociação: ${brl(metricas.valorEmAberto.toFixed(2))} (${metricas.emAbertoCount}) · Aprovados p/ converter: ${brl(metricas.valorAprovado.toFixed(2))} (${metricas.aprovadosCount}) · Convertidos: ${brl(metricas.valorConvertido.toFixed(2))}`}
        action={
          podeEditar && (
            <button
              type="button"
              onClick={abrirModalNovo}
              className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Novo orçamento
            </button>
          )
        }
      />

      {/* Barra de filtros minimalista */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nº ou empresa…"
              className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setFiltroStatus("")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filtroStatus === ""
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({orcamentos.length})
            </button>
            {STATUS_ORCAMENTO.map((st) => {
              const count = orcamentos.filter((o) => o.status === st).length;
              if (count === 0 && filtroStatus !== st) return null;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFiltroStatus(filtroStatus === st ? "" : st)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    filtroStatus === st
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {statusLabel(st)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Ordenar"
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as typeof ordenacao)}
            className="rounded-2xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="recentes">Ordenar: Mais recentes</option>
            <option value="maior_valor">Ordenar: Maior valor</option>
            <option value="validade">Ordenar: Validade</option>
          </select>

          <button
            type="button"
            onClick={() => void carregar()}
            aria-label="Atualizar"
            className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabela de Orçamentos */}
      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Nº</th>
                <th className="px-4 py-3 font-semibold">Empresa</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Condição</th>
                <th className="px-4 py-3 font-semibold">Validade</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {orcamentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum orçamento encontrado.
                  </td>
                </tr>
              ) : (
                orcamentosFiltrados.map((o) => {
                  const diasVal = diasAteValidade(o.valido_ate);
                  const terminal = ["recusado", "expirado", "convertido"].includes(o.status);
                  const vencido = !terminal && diasVal !== null && diasVal < 0;
                  const venceBreve = !terminal && diasVal !== null && diasVal >= 0 && diasVal <= 3;
                  const acao = ACAO_RAPIDA[o.status as StatusOrcamento];

                  return (
                    <tr
                      key={o.id}
                      onClick={() => navigate({ to: `/vendas/orcamentos/${o.id}` as "/" })}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-4 py-3 font-medium">
                        #{o.numero || o.id}
                        {o.created_at && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {fmtData(o.created_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/crm/empresas/${o.empresa_id}` as "/"}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:underline"
                        >
                          {empresaNome(o.empresa_id)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.status} label={statusLabel(o.status)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {o.condicao_pagamento || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
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
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {brl(o.total)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          {podeEditar && acao && (
                            <button
                              type="button"
                              onClick={() => void transicionarRapido(o, acao.para)}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                            >
                              {acao.rotulo}
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                          {podeEditar && o.status === "aprovado" && !o.convertido_pedido_id && (
                            <button
                              type="button"
                              onClick={() => void converterRapido(o)}
                              className="inline-flex items-center gap-1 rounded-full bg-lime px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                            >
                              Converter em pedido
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                          {o.convertido_pedido_id && (
                            <Link
                              to={`/vendas/pedidos/${o.convertido_pedido_id}` as "/"}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-secondary"
                            >
                              Pedido #{o.convertido_pedido_id}
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
          <select
            className={fieldClass}
            required
            value={fNovo.empresa_id}
            onChange={(e) => void aoEscolherEmpresaNovo(e.target.value)}
          >
            <option value="">Selecione…</option>
            {[...empresas.values()].map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nome_fantasia || emp.razao_social}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Contato (necessário p/ converter em pedido)">
          <select
            className={fieldClass}
            value={fNovo.contato_id}
            onChange={(e) => setFNovo({ ...fNovo, contato_id: e.target.value })}
            disabled={!fNovo.empresa_id}
          >
            <option value="">—</option>
            {contatosDaEmpresaNovo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Oportunidade vinculada">
          <select
            className={fieldClass}
            value={fNovo.oportunidade_id}
            onChange={(e) => setFNovo({ ...fNovo, oportunidade_id: e.target.value })}
            disabled={!fNovo.empresa_id}
          >
            <option value="">— Opcional —</option>
            {opsDaEmpresaNovo.map((op) => (
              <option key={op.id} value={op.id}>
                {op.titulo}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Validade">
          <input
            className={fieldClass}
            type="date"
            value={fNovo.valido_ate}
            onChange={(e) => setFNovo({ ...fNovo, valido_ate: e.target.value })}
          />
        </FormField>

        <FormField label="Condição de pagamento" wide>
          <input
            className={fieldClass}
            placeholder="Ex.: 28/56/84 DDL ou Boleto 30 dias"
            value={fNovo.condicao_pagamento}
            onChange={(e) => setFNovo({ ...fNovo, condicao_pagamento: e.target.value })}
          />
        </FormField>

        {/* Itens iniciais do orçamento */}
        <div className="sm:col-span-2 space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Itens do orçamento
            </span>
            <button
              type="button"
              onClick={() =>
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
              }
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
            >
              + Adicionar item
            </button>
          </div>

          <div className="space-y-2">
            {itensNovo.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-2xl border border-border/70 bg-secondary/20 p-2.5 sm:grid-cols-[1fr_76px_96px_auto]"
              >
                <select
                  aria-label="Produto"
                  className={fieldClass}
                  required
                  value={item.produto_id}
                  onChange={(e) => escolherProdutoNovo(idx, e.target.value)}
                >
                  <option value="">Selecione um produto…</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.nome} ({brl(p.preco_venda)})
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Quantidade"
                  className={fieldClass}
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="Qtd"
                  value={item.quantidade}
                  onChange={(e) => atualizarItemNovo(idx, { quantidade: e.target.value })}
                />
                <input
                  aria-label="Preço unitário"
                  className={fieldClass}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Preço"
                  value={item.preco_unitario}
                  onChange={(e) => atualizarItemNovo(idx, { preco_unitario: e.target.value })}
                />
                {itensNovo.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItensNovo((l) => l.filter((_, i) => i !== idx))}
                    className="mt-1 rounded-xl border border-border px-2.5 text-xs text-[#D92546] hover:bg-[#D92546]/10"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <FormField label="Desconto geral (R$)">
          <input
            className={fieldClass}
            type="number"
            step="0.01"
            min="0"
            value={fNovo.desconto}
            onChange={(e) => setFNovo({ ...fNovo, desconto: e.target.value })}
          />
        </FormField>

        <FormField label="Frete (R$)">
          <input
            className={fieldClass}
            type="number"
            step="0.01"
            min="0"
            value={fNovo.frete}
            onChange={(e) => setFNovo({ ...fNovo, frete: e.target.value })}
          />
        </FormField>
      </FormDialog>
    </AppShell>
  );
}
