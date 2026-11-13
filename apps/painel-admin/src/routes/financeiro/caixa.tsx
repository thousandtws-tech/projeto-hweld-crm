import { createFileRoute } from "@tanstack/react-router";
import { Download, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { downloadCsv, FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  construirLivroRazao,
  num,
  TIPOS_ENTRADA_CAIXA,
  type LinhaLivroRazao,
} from "@/lib/algoritmos";
import { ApiError } from "@/lib/api";
import { brl, fmtDataHora } from "@/lib/format";
import { exigePerfil } from "@/lib/guards";
import type { Caixa, CaixaMovimentacao } from "@/lib/models";
import { financeiroService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";

export const Route = createFileRoute("/financeiro/caixa")({
  beforeLoad: exigePerfil("admin", "financeiro"),
  component: CaixaPage,
});

/** Eventos que movem o caixa — baixa/estorno de parcela lança recebimento/estorno. */
const EV_CAIXA = [
  "pagamento.parcelas",
  "pagamento.baixado",
  "pagamento.estornado",
  "caixa.aberto",
  "caixa.movimento",
  "caixa.fechado",
];

const TIPO_COR: Record<string, string> = {
  suprimento: "pago",
  venda: "pago",
  recebimento: "pago",
  sangria: "vencido",
  despesa: "vencido",
  estorno: "em_andamento",
};

const TIPO_LABEL: Record<string, string> = {
  suprimento: "Suprimento",
  sangria: "Sangria",
  venda: "Venda",
  recebimento: "Recebimento",
  despesa: "Despesa",
  estorno: "Estorno",
};

const TIPO_SINAL = TIPOS_ENTRADA_CAIXA;

function CaixaPage() {
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [movs, setMovs] = useState<CaixaMovimentacao[]>([]);
  const [historico, setHistorico] = useState<Caixa[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros do extrato da sessão
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [buscaMov, setBuscaMov] = useState("");

  // Abertura e lançamento manual
  const [valorAbertura, setValorAbertura] = useState("");
  const [fLanc, setFLanc] = useState({ tipo: "suprimento", valor: "", descricao: "" });
  const [lancando, setLancando] = useState(false);

  // Fechamento com conferência em tempo real
  const [fecharOpen, setFecharOpen] = useState(false);
  const [valorInformado, setValorInformado] = useState("");
  const [fechando, setFechando] = useState(false);

  // Gaveta de inspeção de sessão encerrada
  const [sessaoInspecionada, setSessaoInspecionada] = useState<Caixa | null>(null);
  const [movsInspecao, setMovsInspecao] = useState<CaixaMovimentacao[]>([]);
  const [carregandoInspecao, setCarregandoInspecao] = useState(false);

  const carregarHistorico = useCallback(async () => {
    try {
      const p = await financeiroService.caixas({ por_pagina: 20 });
      const fechados = (p.itens ?? []).filter((c) => c.status === "fechado");
      setHistorico(fechados);
    } catch {
      setHistorico([]);
    }
  }, []);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const c = await financeiroService.caixaAberto();
        setCaixa(c);
        if (c) {
          const listaMovs = await financeiroService.movimentacoesCaixa(c.id).catch(() => []);
          setMovs(listaMovs);
        } else {
          setMovs([]);
        }
      } catch {
        setCaixa(null);
        setMovs([]);
      } finally {
        setCarregando(false);
      }
      void carregarHistorico();
    },
    [carregarHistorico],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(EV_CAIXA, () => void carregar(true));

  // Sugere o fundo de troco a partir do fechamento da última sessão encerrada
  const sugestaoTrocoAnterior = useMemo(() => {
    const ultimo = historico[0];
    return ultimo?.valor_fechamento_informado ?? ultimo?.valor_fechamento_calculado ?? null;
  }, [historico]);

  // Livro-razão da sessão aberta
  const razao = useMemo(
    () => construirLivroRazao(num(caixa?.valor_abertura), movs),
    [caixa?.valor_abertura, movs],
  );

  const linhasFiltradas = useMemo(() => {
    const q = buscaMov.trim().toLowerCase();
    return razao.linhas.filter((m) => {
      if (filtroTipo && m.tipo !== filtroTipo) return false;
      if (q) {
        const desc = (m.descricao ?? "").toLowerCase();
        const tp = (TIPO_LABEL[m.tipo] ?? m.tipo).toLowerCase();
        if (!desc.includes(q) && !tp.includes(q) && !String(m.id).includes(q)) return false;
      }
      return true;
    });
  }, [razao.linhas, filtroTipo, buscaMov]);

  const abrirCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const c = await financeiroService.abrir(String(valorAbertura || "0"));
      setCaixa(c);
      setMovs([]);
      toast.success("Caixa aberto.");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? "Já existe um caixa aberto."
          : "Falha ao abrir o caixa.",
      );
    }
  };

  const lancar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fLanc.valor || lancando) return;
    const val = num(fLanc.valor);
    if ((fLanc.tipo === "sangria" || fLanc.tipo === "despesa") && val > razao.saldoAtual) {
      toast.warning("Atenção: o valor de saída é maior que o saldo calculado atual do caixa.");
    }
    setLancando(true);
    try {
      const mov = await financeiroService.lancar({
        tipo: fLanc.tipo,
        valor: String(fLanc.valor),
        descricao: fLanc.descricao.trim() || undefined,
      });
      setMovs((l) => [mov, ...l]);
      setFLanc((p) => ({ ...p, valor: "", descricao: "" }));
      toast.success("Movimentação lançada.");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 422
          ? "Sem caixa aberto ou tipo inválido."
          : "Falha ao lançar movimentação.",
      );
    } finally {
      setLancando(false);
    }
  };

  const abrirModalFechamento = () => {
    setValorInformado(razao.saldoAtual.toFixed(2));
    setFecharOpen(true);
  };

  const diferencaPrevia = useMemo(() => {
    if (valorInformado === "") return 0;
    return Math.round((num(valorInformado) - razao.saldoAtual) * 100) / 100;
  }, [valorInformado, razao.saldoAtual]);

  const fechar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fechando) return;
    setFechando(true);
    try {
      const c = await financeiroService.fechar(String(valorInformado));
      setCaixa(null);
      setMovs([]);
      setFecharOpen(false);
      setValorInformado("");
      void carregarHistorico();
      const dif = num(c.diferenca);
      if (dif !== 0) {
        toast.warning(`Caixa fechado com diferença de ${brl(c.diferenca ?? "0")}.`);
      } else {
        toast.success("Caixa fechado sem divergência.");
      }
    } catch {
      toast.error("Falha ao fechar o caixa.");
    } finally {
      setFechando(false);
    }
  };

  const inspecionarSessao = async (sessao: Caixa) => {
    setSessaoInspecionada(sessao);
    setCarregandoInspecao(true);
    try {
      const lista = await financeiroService.movimentacoesCaixa(sessao.id);
      setMovsInspecao(lista);
    } catch {
      setMovsInspecao([]);
    } finally {
      setCarregandoInspecao(false);
    }
  };

  const exportarExtratoCsv = (linhas: LinhaLivroRazao[], caixaId: number) => {
    downloadCsv(
      `extrato-caixa-${caixaId}.csv`,
      linhas.map((l) => ({
        id: l.id,
        data_hora: l.created_at,
        tipo: l.tipo,
        valor: l.delta.toFixed(2),
        saldo_apos: l.saldoApos.toFixed(2),
        descricao: l.descricao ?? "",
      })),
    );
  };

  const razaoInspecao = useMemo(
    () =>
      sessaoInspecionada
        ? construirLivroRazao(num(sessaoInspecionada.valor_abertura), movsInspecao)
        : null,
    [sessaoInspecionada, movsInspecao],
  );

  return (
    <>
      <PageHeader
        title="Caixa"
        subtitle={
          caixa
            ? `Sessão #${caixa.id} aberta em ${fmtDataHora(caixa.aberto_em)}`
            : "Controle de abertura, movimentações, sangria e conciliação de fechamento"
        }
        action={
          <div className="flex items-center gap-2">
            {caixa && razao.linhas.length > 0 && (
              <button
                type="button"
                onClick={() => exportarExtratoCsv(razao.linhas, caixa.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
              >
                <Download className="h-3.5 w-3.5" /> Exportar CSV
              </button>
            )}
            {caixa && (
              <button
                type="button"
                onClick={abrirModalFechamento}
                className="rounded-full bg-[#D92546] px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                Fechar caixa
              </button>
            )}
            <button
              type="button"
              onClick={() => void carregar()}
              aria-label="Atualizar"
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {caixa ? (
        <>
          {/* 1. Resumo Contábil da Sessão Aberta — 4 cards tipográficos limpos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SectionCard>
              <div className="text-xs text-muted-foreground">Fundo de abertura</div>
              <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                {brl(caixa.valor_abertura)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Aberto às {fmtDataHora(caixa.aberto_em)}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="text-xs text-muted-foreground">Entradas na sessão</div>
              <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-primary">
                +{brl(razao.entradas.toFixed(2))}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Recebimentos: {brl(razao.porTipo.recebimento.toFixed(2))} · Suprimentos:{" "}
                {brl(razao.porTipo.suprimento.toFixed(2))}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="text-xs text-muted-foreground">Saídas na sessão</div>
              <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-[#D92546]">
                −{brl(razao.saidas.toFixed(2))}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Sangrias: {brl(razao.porTipo.sangria.toFixed(2))} · Despesas:{" "}
                {brl(razao.porTipo.despesa.toFixed(2))}
              </div>
            </SectionCard>

            <SectionCard>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Saldo calculado atual</span>
                <StatusPill status="ativo" label="Aberto" />
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                {brl(razao.saldoAtual.toFixed(2))}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {movs.length} lançamento(s) registrado(s)
              </div>
            </SectionCard>
          </div>

          {/* 2. Lançamento Manual (Suprimento, Sangria, Despesa) */}
          <SectionCard>
            <h2 className="mb-3 text-sm font-bold">Lançar movimentação manual</h2>
            <form
              onSubmit={lancar}
              className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[180px_160px_1fr_auto]"
            >
              <label className="text-xs font-medium text-muted-foreground">
                Tipo
                <select
                  className={fieldClass}
                  value={fLanc.tipo}
                  onChange={(e) => setFLanc({ ...fLanc, tipo: e.target.value })}
                >
                  <option value="suprimento">Suprimento (+)</option>
                  <option value="sangria">Sangria (−)</option>
                  <option value="despesa">Despesa (−)</option>
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Valor (R$)
                <input
                  className={`${fieldClass} tabular-nums`}
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0,00"
                  value={fLanc.valor}
                  onChange={(e) => setFLanc({ ...fLanc, valor: e.target.value })}
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Histórico / Descrição
                <input
                  className={fieldClass}
                  placeholder="Ex.: Reforço de troco, retirada p/ cofre, frete motoboy…"
                  value={fLanc.descricao}
                  onChange={(e) => setFLanc({ ...fLanc, descricao: e.target.value })}
                />
              </label>
              <button
                type="submit"
                disabled={lancando || !fLanc.valor}
                className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {lancando ? "Lançando…" : "Lançar"}
              </button>
            </form>
          </SectionCard>

          {/* 3. Livro-Razão (Extrato com Saldo Acumulado) */}
          <SectionCard className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
              <span className="text-sm font-bold">Livro-razão da sessão</span>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary/30 px-2.5 py-1">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="search"
                    value={buscaMov}
                    onChange={(e) => setBuscaMov(e.target.value)}
                    placeholder="Filtrar descrição…"
                    className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <select
                  aria-label="Filtrar por tipo"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="rounded-xl border border-border bg-card px-2.5 py-1 text-xs outline-none"
                >
                  <option value="">Todos os tipos</option>
                  <option value="recebimento">Recebimento</option>
                  <option value="venda">Venda</option>
                  <option value="suprimento">Suprimento</option>
                  <option value="sangria">Sangria</option>
                  <option value="despesa">Despesa</option>
                  <option value="estorno">Estorno</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5 font-semibold">Horário</th>
                    <th className="px-4 py-2.5 font-semibold">Tipo</th>
                    <th className="px-4 py-2.5 font-semibold">Descrição / Origem</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Movimento</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Saldo após</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                        Nenhuma movimentação encontrada.
                      </td>
                    </tr>
                  ) : (
                    linhasFiltradas.map((m) => {
                      const entrada = TIPO_SINAL.has(m.tipo);
                      return (
                        <tr key={m.id} className="border-b border-border/60 last:border-0">
                          <td className="px-5 py-2.5 text-xs text-muted-foreground">
                            {fmtDataHora(m.created_at)}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusPill
                              status={TIPO_COR[m.tipo] ?? "draft"}
                              label={TIPO_LABEL[m.tipo] ?? m.tipo}
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <span>{m.descricao || "—"}</span>
                            {m.pagamento_id && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (Parcela #{m.pagamento_id})
                              </span>
                            )}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                              entrada ? "text-primary" : "text-[#D92546]"
                            }`}
                          >
                            {entrada ? "+" : "−"}
                            {brl(m.valor)}
                          </td>
                          <td className="px-5 py-2.5 text-right font-medium tabular-nums text-muted-foreground">
                            {brl(m.saldoApos.toFixed(2))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      ) : (
        !carregando && (
          <SectionCard>
            <div className="mx-auto max-w-md py-6 text-center">
              <h2 className="text-base font-bold">Nenhum caixa aberto no momento</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Informe o fundo de troco inicial para iniciar as operações financeiras e permitir
                baixas de parcelas.
              </p>

              <form onSubmit={abrirCaixa} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  className={`${fieldClass} mt-0 flex-1 tabular-nums`}
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Valor de abertura (R$)"
                  value={valorAbertura}
                  onChange={(e) => setValorAbertura(e.target.value)}
                />
                <button
                  type="submit"
                  className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  Abrir caixa
                </button>
              </form>

              {sugestaoTrocoAnterior && (
                <button
                  type="button"
                  onClick={() => setValorAbertura(sugestaoTrocoAnterior)}
                  className="mt-2.5 text-xs font-medium text-primary hover:underline"
                >
                  Usar saldo do último fechamento ({brl(sugestaoTrocoAnterior)})
                </button>
              )}
            </div>
          </SectionCard>
        )
      )}

      {/* 4. Histórico de Sessões Anteriores (Clicável para auditar movimentações) */}
      {historico.length > 0 && (
        <SectionCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <span className="text-sm font-bold">Sessões encerradas</span>
            <span className="text-xs text-muted-foreground">
              Clique em uma sessão para ver o extrato completo
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">Sessão</th>
                  <th className="px-4 py-2.5 font-semibold">Abertura</th>
                  <th className="px-4 py-2.5 font-semibold">Fechamento</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Fundo inicial</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Calculado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Informado</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((c) => {
                  const dif = num(c.diferenca);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => void inspecionarSessao(c)}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-5 py-2.5 font-medium">#{c.id}</td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">
                        {fmtDataHora(c.aberto_em)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {fmtDataHora(c.fechado_em)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {brl(c.valor_abertura)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {brl(c.valor_fechamento_calculado)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {brl(c.valor_fechamento_informado)}
                      </td>
                      <td
                        className={`px-5 py-2.5 text-right font-semibold tabular-nums ${
                          dif < 0 ? "text-[#D92546]" : dif > 0 ? "text-[#D9486E]" : "text-primary"
                        }`}
                      >
                        {dif > 0 ? `+${brl(c.diferenca)}` : brl(c.diferenca)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Modal de Fechamento com Conferência em Tempo Real */}
      <FormDialog
        open={fecharOpen}
        onOpenChange={setFecharOpen}
        title="Fechar caixa"
        description="Conferência física de encerramento de turno"
        submitLabel={fechando ? "Fechando…" : "Confirmar fechamento"}
        onSubmit={fechar}
      >
        <div className="sm:col-span-2 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-secondary/30 p-3 text-xs">
          <div>
            <span className="text-muted-foreground">Abertura</span>
            <div className="mt-0.5 font-bold tabular-nums">{brl(caixa?.valor_abertura)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Entradas / Saídas</span>
            <div className="mt-0.5 font-bold tabular-nums">
              +{brl(razao.entradas.toFixed(2))} / −{brl(razao.saidas.toFixed(2))}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Saldo esperado</span>
            <div className="mt-0.5 font-bold tabular-nums text-primary">
              {brl(razao.saldoAtual.toFixed(2))}
            </div>
          </div>
        </div>

        <FormField label="Valor físico apurado em caixa (R$) *" wide>
          <input
            className={`${fieldClass} tabular-nums`}
            type="number"
            step="0.01"
            min="0"
            required
            value={valorInformado}
            onChange={(e) => setValorInformado(e.target.value)}
          />
        </FormField>

        <div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-border px-3.5 py-2.5 text-xs">
          <span className="text-muted-foreground">Resultado da conferência:</span>
          {diferencaPrevia === 0 ? (
            <strong className="text-primary">Caixa batendo exatamente (R$ 0,00)</strong>
          ) : diferencaPrevia < 0 ? (
            <strong className="text-[#D92546]">
              Quebra / Falta de {brl(Math.abs(diferencaPrevia).toFixed(2))}
            </strong>
          ) : (
            <strong className="text-[#D9486E]">Sobra de +{brl(diferencaPrevia.toFixed(2))}</strong>
          )}
        </div>
      </FormDialog>

      {/* Gaveta de Auditoria de Sessão Encerrada */}
      <Sheet
        open={Boolean(sessaoInspecionada)}
        onOpenChange={(o) => !o && setSessaoInspecionada(null)}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 sm:max-w-xl"
        >
          {sessaoInspecionada && (
            <>
              <SheetHeader className="border-b border-border px-6 pt-6 pb-4 text-left">
                <div className="flex items-center gap-2">
                  <StatusPill status="inativo" label="Fechado" />
                  <span className="text-xs text-muted-foreground">
                    Sessão #{sessaoInspecionada.id}
                  </span>
                </div>
                <SheetTitle className="mt-1 text-lg font-bold">
                  Extrato da Sessão #{sessaoInspecionada.id}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Aberto em {fmtDataHora(sessaoInspecionada.aberto_em)} · Fechado em{" "}
                  {fmtDataHora(sessaoInspecionada.fechado_em)}
                </SheetDescription>

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-secondary/30 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Calculado</span>
                    <div className="mt-0.5 font-bold tabular-nums">
                      {brl(sessaoInspecionada.valor_fechamento_calculado)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Informado</span>
                    <div className="mt-0.5 font-bold tabular-nums">
                      {brl(sessaoInspecionada.valor_fechamento_informado)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Diferença</span>
                    <div
                      className={`mt-0.5 font-bold tabular-nums ${
                        num(sessaoInspecionada.diferenca) !== 0 ? "text-[#D92546]" : "text-primary"
                      }`}
                    >
                      {brl(sessaoInspecionada.diferenca)}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {carregandoInspecao ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Carregando movimentações…
                  </p>
                ) : !razaoInspecao || razaoInspecao.linhas.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Nenhuma movimentação registrada nesta sessão.
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          exportarExtratoCsv(razaoInspecao.linhas, sessaoInspecionada.id)
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
                      >
                        <Download className="h-3.5 w-3.5" /> Exportar CSV
                      </button>
                    </div>
                    <ul className="divide-y divide-border/60 text-xs">
                      {razaoInspecao.linhas.map((m) => {
                        const entrada = TIPO_SINAL.has(m.tipo);
                        return (
                          <li key={m.id} className="flex items-center justify-between py-2.5">
                            <div className="min-w-0 pr-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold capitalize">
                                  {TIPO_LABEL[m.tipo] ?? m.tipo}
                                </span>
                                <span className="text-muted-foreground">
                                  {fmtDataHora(m.created_at)}
                                </span>
                              </div>
                              <div className="mt-0.5 truncate text-muted-foreground">
                                {m.descricao || "—"}
                              </div>
                            </div>
                            <div className="text-right tabular-nums">
                              <div
                                className={`font-semibold ${
                                  entrada ? "text-primary" : "text-[#D92546]"
                                }`}
                              >
                                {entrada ? "+" : "−"}
                                {brl(m.valor)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Saldo: {brl(m.saldoApos.toFixed(2))}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
