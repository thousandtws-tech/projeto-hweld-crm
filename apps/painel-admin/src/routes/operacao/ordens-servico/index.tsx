import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { brl, fmtData, statusLabel } from "@/lib/format";
import { exigePerfil } from "@/lib/guards";
import type { Contato, OrdemServico, Pedido, PrioridadeOs, StatusOs } from "@/lib/models";
import { crmService, osService, pedidosService } from "@/lib/services";
import { useEmpresasMap } from "@/lib/use-empresas";
import { useResourceList } from "@/lib/use-resource-list";
import { useAuth } from "@/store/auth-store";

export const Route = createFileRoute("/operacao/ordens-servico/")({
  beforeLoad: exigePerfil("admin", "tecnico"),
  component: OrdensServicoIndexPage,
});

const STATUS_OS: StatusOs[] = [
  "aberta",
  "em_andamento",
  "aguardando_material",
  "concluida",
  "cancelada",
];

const ACAO_RAPIDA_OS: Partial<Record<StatusOs, { para: StatusOs; rotulo: string }>> = {
  aberta: { para: "em_andamento", rotulo: "Iniciar" },
  aguardando_material: { para: "em_andamento", rotulo: "Retomar" },
  em_andamento: { para: "concluida", rotulo: "Concluir" },
};

const optStr = (v: string): string | null => {
  const t = v.trim();
  return t.length > 0 ? t : null;
};

function OrdensServicoIndexPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const empresas = useEmpresasMap();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>("");

  const l = useResourceList<OrdemServico>({
    recurso: "ordens-servico",
    filtros: {
      status: filtroStatus || undefined,
      prioridade: filtroPrioridade || undefined,
    },
    eventos: ["os.criada", "os.status_alterada"],
  });
  const carregando = l.carregando;
  const carregar = l.recarregar;
  const busca = l.busca;
  const setBusca = l.setBusca;

  const [novoOpen, setNovoOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fNovo, setFNovo] = useState({
    empresa_id: "",
    contato_id: "",
    pedido_id: "",
    prioridade: "normal" as PrioridadeOs,
    prevista_em: "",
    valor_mao_obra: "",
    descricao: "",
    observacoes: "",
  });

  useEffect(() => {
    if (!novoOpen) return;
    crmService
      .contatos({ por_pagina: 100 })
      .then((p) => setContatos(p.itens ?? []))
      .catch(() => toast.error("Falha ao carregar contatos."));
    pedidosService
      .listar({ por_pagina: 100 })
      .then((p) => setPedidos(p.itens ?? []))
      .catch(() => toast.error("Falha ao carregar pedidos para vincular."));
  }, [novoOpen]);

  const empresaNome = (id: number) => {
    const e = empresas.get(id);
    return e ? e.nome_fantasia || e.razao_social : `Empresa #${id}`;
  };

  // Status/prioridade/busca já são filtros server-side — a lista renderiza
  // `l.itens` direto; resumo reflete a página carregada.
  const ordensFiltradas = l.itens;

  const resumo = useMemo(() => {
    const ordens = l.itens;
    const emFila = ordens.filter(
      (o) =>
        o.status === "aberta" || o.status === "em_andamento" || o.status === "aguardando_material",
    ).length;
    const urgentes = ordens.filter(
      (o) =>
        o.status !== "concluida" &&
        o.status !== "cancelada" &&
        (o.prioridade === "urgente" || o.prioridade === "alta"),
    ).length;
    const concluidas = ordens.filter((o) => o.status === "concluida").length;
    return { emFila, urgentes, concluidas };
  }, [l.itens]);

  const abrirModalNovo = () => {
    setFNovo({
      empresa_id: "",
      contato_id: "",
      pedido_id: "",
      prioridade: "normal",
      prevista_em: "",
      valor_mao_obra: "",
      descricao: "",
      observacoes: "",
    });
    setNovoOpen(true);
  };

  const criarOs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fNovo.empresa_id || salvando) return;
    setSalvando(true);
    try {
      const criada = await osService.criar({
        empresa_id: Number(fNovo.empresa_id),
        contato_id: fNovo.contato_id ? Number(fNovo.contato_id) : null,
        pedido_id: fNovo.pedido_id ? Number(fNovo.pedido_id) : null,
        responsavel_id: user?.id ?? null,
        prioridade: fNovo.prioridade,
        prevista_em: fNovo.prevista_em || null,
        valor_mao_obra: optStr(fNovo.valor_mao_obra),
        descricao: optStr(fNovo.descricao),
        observacoes: optStr(fNovo.observacoes),
      });
      setNovoOpen(false);
      toast.success(`Ordem de serviço #${criada.numero || criada.id} aberta.`);
      navigate({ to: `/operacao/ordens-servico/${criada.id}` as "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar ordem de serviço.");
    } finally {
      setSalvando(false);
    }
  };

  const transicionarRapido = async (o: OrdemServico, para: StatusOs) => {
    try {
      await osService.transicionar(o.id, para);
      l.recarregar();
      toast.success(`OS #${o.numero || o.id} → ${statusLabel(para)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transição recusada.");
    }
  };

  const contatosDaEmpresa = useMemo(
    () => contatos.filter((c) => c.empresa_id === Number(fNovo.empresa_id)),
    [contatos, fNovo.empresa_id],
  );

  const pedidosDaEmpresa = useMemo(
    () =>
      pedidos.filter((p) => p.empresa_id === Number(fNovo.empresa_id) && p.status !== "cancelado"),
    [pedidos, fNovo.empresa_id],
  );

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        subtitle={`Em atendimento: ${resumo.emFila} · Prioridade alta/urgente: ${resumo.urgentes} · Concluídas: ${resumo.concluidas}`}
        action={
          <button
            type="button"
            onClick={abrirModalNovo}
            className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova OS
          </button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nº, empresa ou descrição…"
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
              Todas ({l.pagina?.total ?? l.itens.length})
            </button>
            {STATUS_OS.map((st) => {
              const count = l.itens.filter((o) => o.status === st).length;
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
            aria-label="Prioridade"
            value={filtroPrioridade}
            onChange={(e) => setFiltroPrioridade(e.target.value)}
            className="rounded-2xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="">Prioridade: todas</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baixa">Baixa</option>
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

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">OS</th>
                <th className="px-4 py-3 font-semibold">Empresa</th>
                <th className="px-4 py-3 font-semibold">Serviço / Escopo</th>
                <th className="px-4 py-3 font-semibold">Prioridade</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Previsão</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {ordensFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma ordem de serviço encontrada.
                  </td>
                </tr>
              ) : (
                ordensFiltradas.map((o) => {
                  const acao = ACAO_RAPIDA_OS[o.status as StatusOs];
                  return (
                    <tr
                      key={o.id}
                      onClick={() => navigate({ to: `/operacao/ordens-servico/${o.id}` as "/" })}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-4 py-3 font-medium">
                        #{o.numero || o.id}
                        {o.pedido_id && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            Pedido #{o.pedido_id}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{empresaNome(o.empresa_id)}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                        {o.descricao || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.prioridade} label={o.prioridade} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={o.status} label={statusLabel(o.status)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {fmtData(o.prevista_em)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {brl(o.valor_total ?? o.valor_mao_obra)}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {acao && (
                          <button
                            type="button"
                            onClick={() => void transicionarRapido(o, acao.para)}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                          >
                            {acao.rotulo}
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
                  <button
                    key={p}
                    onClick={() => l.setPaginaNum(p)}
                    className={`h-8 min-w-8 rounded-xl px-2 text-xs font-semibold ${
                      p === l.paginaNum
                        ? "bg-lime text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {p}
                  </button>
                ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Modal: Nova Ordem de Serviço */}
      <FormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        title="Nova ordem de serviço"
        description="Abertura de atendimento técnico, manutenção ou instalação vinculada ao cliente"
        submitLabel={salvando ? "Abrindo…" : "Abrir OS"}
        onSubmit={criarOs}
      >
        <FormField label="Empresa (Cliente) *">
          <select
            className={fieldClass}
            required
            value={fNovo.empresa_id}
            onChange={(e) =>
              setFNovo({ ...fNovo, empresa_id: e.target.value, contato_id: "", pedido_id: "" })
            }
          >
            <option value="">Selecione…</option>
            {[...empresas.values()].map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nome_fantasia || emp.razao_social}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Contato na empresa">
          <select
            className={fieldClass}
            value={fNovo.contato_id}
            onChange={(e) => setFNovo({ ...fNovo, contato_id: e.target.value })}
            disabled={!fNovo.empresa_id}
          >
            <option value="">— Opcional —</option>
            {contatosDaEmpresa.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Pedido vinculado">
          <select
            className={fieldClass}
            value={fNovo.pedido_id}
            onChange={(e) => setFNovo({ ...fNovo, pedido_id: e.target.value })}
            disabled={!fNovo.empresa_id}
          >
            <option value="">— Opcional —</option>
            {pedidosDaEmpresa.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero} ({brl(p.total)})
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Prioridade">
          <select
            className={fieldClass}
            value={fNovo.prioridade}
            onChange={(e) => setFNovo({ ...fNovo, prioridade: e.target.value as PrioridadeOs })}
          >
            <option value="baixa">Baixa</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </FormField>

        <FormField label="Previsão de conclusão">
          <input
            className={fieldClass}
            type="date"
            value={fNovo.prevista_em}
            onChange={(e) => setFNovo({ ...fNovo, prevista_em: e.target.value })}
          />
        </FormField>

        <FormField label="Valor de mão de obra (R$)">
          <input
            className={fieldClass}
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={fNovo.valor_mao_obra}
            onChange={(e) => setFNovo({ ...fNovo, valor_mao_obra: e.target.value })}
          />
        </FormField>

        <FormField label="Descrição do serviço / equipamento *" wide>
          <textarea
            className={fieldClass}
            rows={3}
            required
            placeholder="Descreva o equipamento, defeito relatado ou serviço solicitado…"
            value={fNovo.descricao}
            onChange={(e) => setFNovo({ ...fNovo, descricao: e.target.value })}
          />
        </FormField>

        <FormField label="Observações técnicas" wide>
          <input
            className={fieldClass}
            value={fNovo.observacoes}
            onChange={(e) => setFNovo({ ...fNovo, observacoes: e.target.value })}
          />
        </FormField>
      </FormDialog>
    </>
  );
}
