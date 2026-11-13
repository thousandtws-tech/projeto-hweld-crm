import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, FileDown, FileText, History, Plus, RefreshCw } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { msgErro } from "@/lib/api";
import { brl, fmtDataHora, statusLabel } from "@/lib/format";
import { exigePerfil } from "@/lib/guards";
import type {
  ConfigFiscal,
  Empresa,
  FiscalDocumento,
  FiscalDocumentoEvento,
  NotaFiscal,
  Pedido,
} from "@/lib/models";
import { crmService, fiscalDocService, fiscalService, pedidosService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";

export const Route = createFileRoute("/fiscal/notas")({
  beforeLoad: exigePerfil("admin", "financeiro"),
  component: FiscalPage,
});

/** Notas fiscais — emitir via provedor (Focus NFe), acompanhar, cancelar com motivo. */
function FiscalPage() {
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [docs, setDocs] = useState<FiscalDocumento[]>([]);
  const [empresas, setEmpresas] = useState<Map<number, string>>(new Map());
  const [pedidosElegiveis, setPedidosElegiveis] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [emitindo, setEmitindo] = useState(false);
  const [opsIndisponivel, setOpsIndisponivel] = useState(false);
  const [configFiscal, setConfigFiscal] = useState<ConfigFiscal | null>(null);
  const [configErro, setConfigErro] = useState(false);

  const [emitirOpen, setEmitirOpen] = useState(false);
  const [pedidoId, setPedidoId] = useState("");
  const [alvo, setAlvo] = useState<NotaFiscal | null>(null);
  const [docAlvo, setDocAlvo] = useState<FiscalDocumento | null>(null);
  const [motivo, setMotivo] = useState("");
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [historico, setHistorico] = useState<FiscalDocumentoEvento[]>([]);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [pNotas, pEmps] = await Promise.all([
        fiscalService.listar({ por_pagina: 50 }),
        crmService.empresas({ por_pagina: 100 }).catch(() => ({ itens: [] as Empresa[] })),
      ]);
      setNotas(pNotas.itens ?? []);
      setEmpresas(
        new Map((pEmps.itens ?? []).map((e) => [e.id, e.nome_fantasia || e.razao_social])),
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  // Documentos de orquestração (provedor fiscal) — falha não derruba a lista
  // do core: o painel continua operável em modo "somente notas".
  const carregarDocs = useCallback(async () => {
    try {
      const p = await fiscalDocService.documentos({ porPagina: 50 });
      setDocs(p.content ?? []);
      setOpsIndisponivel(false);
    } catch {
      setOpsIndisponivel(true);
    }
  }, []);

  const carregarConfig = () =>
    fiscalService
      .config()
      .then((c) => {
        setConfigFiscal(c);
        setConfigErro(false);
      })
      .catch(() => setConfigErro(true));

  useEffect(() => {
    void carregar();
    void carregarDocs();
    void carregarConfig();
  }, [carregar, carregarDocs]);

  useRealtimeEvent(
    (t) =>
      t.startsWith("fiscal.nota_") ||
      t === "pedido.status_alterado" ||
      t === "fiscal.configuracao" ||
      t === "nf.solicitada" ||
      t === "integracao.evento_financeiro",
    () => {
      void carregar(true);
      void carregarDocs();
      void carregarConfig();
    },
  );

  // Carrega pedidos faturáveis ao abrir o modal de emissão
  useEffect(() => {
    if (!emitirOpen) return;
    pedidosService
      .listar({ por_pagina: 100 })
      .then((p) => {
        const faturaveis = (p.itens ?? []).filter((ped) =>
          // Regra do core-api: emissão só com pedido em separação ou faturado —
          // listar outros status deixava o usuário escolher pedido que o
          // backend rejeita com 422.
          ["em_separacao", "faturado"].includes(ped.status),
        );
        setPedidosElegiveis(faturaveis);
      })
      .catch(() => toast.error("Falha ao carregar pedidos faturáveis."));
  }, [emitirOpen]);

  // Emissão em duas etapas: a NF nasce rascunho no core-api (registro de
  // negócio) e é submetida ao provedor pelo operations-api — que devolve o
  // resultado por eventos de integração, sem ação extra do staff.
  const emitir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoId || emitindo) return;
    setEmitindo(true);
    try {
      const nota = await fiscalService.emitir(Number(pedidoId));
      try {
        await fiscalDocService.emitir(Number(pedidoId), nota.id);
        toast.success("Emissão enviada ao provedor fiscal.");
      } catch (errOps) {
        toast.warning(
          `NF #${nota.id} criada em rascunho, mas a transmissão falhou: ${msgErro(errOps)}`,
        );
      }
      setEmitirOpen(false);
      setPedidoId("");
      void carregar();
      void carregarDocs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao emitir NF.");
    } finally {
      setEmitindo(false);
    }
  };

  const cancelarRascunho = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alvo || !motivo.trim()) return;
    try {
      await fiscalService.cancelar(alvo.id, motivo);
      setAlvo(null);
      setMotivo("");
      void carregar();
      toast.success("NF cancelada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar.");
    }
  };

  const cancelarDocumento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docAlvo || motivo.trim().length < 15) return;
    try {
      await fiscalDocService.cancelar(docAlvo.id, motivo.trim());
      setDocAlvo(null);
      setMotivo("");
      void carregarDocs();
      toast.success("Cancelamento enviado ao provedor.");
    } catch (err) {
      toast.error(msgErro(err, "Falha ao cancelar documento."));
    }
  };

  const sincronizarDoc = async (d: FiscalDocumento) => {
    try {
      await fiscalDocService.refresh(d.id);
      void carregarDocs();
      toast.success("Status atualizado pelo provedor.");
    } catch (err) {
      toast.error(msgErro(err, "Falha ao consultar provedor."));
    }
  };

  const baixarArtefato = async (d: FiscalDocumento, tipo: "xml" | "pdf") => {
    try {
      const blob =
        tipo === "xml" ? await fiscalDocService.xml(d.id) : await fiscalDocService.pdf(d.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${d.docType.toLowerCase()}-${d.numero ?? d.id}.${tipo}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(msgErro(err, `Artefato ${tipo.toUpperCase()} indisponível.`));
    }
  };

  const reenviarWebhook = async (d: FiscalDocumento) => {
    try {
      await fiscalDocService.webhookResend(d.id);
      toast.success("Reenvio de notificação solicitado ao provedor.");
    } catch (err) {
      toast.error(msgErro(err, "Falha ao solicitar reenvio."));
    }
  };

  const abrirHistorico = async (d: FiscalDocumento) => {
    setHistoricoId(d.id);
    setHistorico([]);
    try {
      setHistorico(await fiscalDocService.historico(d.id));
    } catch (err) {
      toast.error(msgErro(err, "Falha ao carregar histórico."));
    }
  };

  const docStatusLabel = (d: FiscalDocumento) => statusLabel(d.status.toLowerCase());

  const statusRemoto = (d: FiscalDocumento) =>
    d.providerStatus ? `${d.providerStatus}${d.statusDetail ? ` — ${d.statusDetail}` : ""}` : null;

  return (
    <>
      <PageHeader
        title="Notas fiscais"
        subtitle="Emissão, transmissão e cancelamento de NF-e vinculadas aos pedidos de venda"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEmitirOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Emitir NF
            </button>
            <button
              type="button"
              onClick={() => {
                void carregar();
                void carregarDocs();
              }}
              aria-label="Atualizar"
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {/* Falha ao ler a configuração — nunca confundir com "faltam credenciais" */}
      {configErro && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3.5 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5">
            <div className="font-bold">Não foi possível verificar a configuração fiscal</div>
            <p className="text-muted-foreground">
              O estado real da integração SEFAZ está indisponível no momento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void carregarConfig()}
            className="ml-auto shrink-0 rounded-full border border-border bg-card px-3 py-1.5 font-medium hover:bg-secondary"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Status da integração SEFAZ — dirigido pela configuração real */}
      {configFiscal?.status_integracao === "pendente_credenciais" && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#D9486E]/40 bg-[var(--pill-warn-bg)] px-4 py-3.5 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D9486E]" />
          <div className="space-y-0.5">
            <div className="font-bold text-[#D9486E]">
              Integração SEFAZ pendente para liberação definitiva deste módulo em produção
            </div>
            <p className="text-muted-foreground">
              As emissões operam em modo simulado (homologação interna).{" "}
              {configFiscal && configFiscal.pendencias.length > 0
                ? `Pendente: ${configFiscal.pendencias
                    .map(
                      (p) =>
                        (
                          ({
                            certificado_a1: "certificado A1",
                            certificado_expirado: "certificado expirado",
                            csc: "CSC",
                            serie_nf: "série da NF-e",
                            regime_tributario: "regime tributário",
                          }) as Record<string, string>
                        )[p] ?? p,
                    )
                    .join(", ")}. `
                : ""}
              Configure as credenciais em{" "}
              <Link to="/fiscal/configuracao" className="font-medium text-primary hover:underline">
                Configuração fiscal
              </Link>
              .
            </p>
          </div>
        </div>
      )}
      {configFiscal?.status_integracao === "homologacao_pronta" && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#B8891D]/40 bg-[#B8891D]/8 px-4 py-3.5 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B8891D]" />
          <div className="space-y-0.5">
            <div className="font-bold text-[#B8891D]">
              Credenciais completas — ambiente de homologação
            </div>
            <p className="text-muted-foreground">
              Certificado, CSC e parâmetros configurados. As transmissões seguem em homologação até
              a ativação do emissor fiscal de produção.
            </p>
          </div>
        </div>
      )}
      {configFiscal?.status_integracao === "producao_pronta" && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#2E7D4F]/40 bg-[#2E7D4F]/8 px-4 py-3.5 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#2E7D4F]" />
          <div className="space-y-0.5">
            <div className="font-bold text-[#2E7D4F]">Integração SEFAZ pronta para produção</div>
            <p className="text-muted-foreground">
              Credenciais completas e ambiente em produção — aguardando ativação do transmissor
              fiscal oficial.
            </p>
          </div>
        </div>
      )}

      {/* Registro de negócio — notas_fiscais no core-api */}
      <SectionCard className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Notas fiscais</h2>
          <p className="text-xs text-muted-foreground">
            Registro de negócio no sistema — atualizado automaticamente pelos eventos do provedor.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Pedido</th>
                <th className="px-4 py-3 font-semibold">Empresa</th>
                <th className="px-4 py-3 font-semibold">Número / Série</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Chave de acesso</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {notas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma nota fiscal emitida.
                  </td>
                </tr>
              )}
              {notas.map((n) => (
                <tr key={n.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">#{n.id}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/vendas/pedidos/${n.pedido_id}` as "/"}
                      className="font-medium text-primary hover:underline"
                    >
                      Pedido #{n.pedido_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {empresas.get(n.empresa_id) ?? `Empresa #${n.empresa_id}`}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {n.numero || "—"}
                    {n.serie ? ` / Série ${n.serie}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={n.status} label={statusLabel(n.status)} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      title={n.chave ?? undefined}
                    >
                      {n.chave ? `${n.chave.slice(0, 22)}…` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {brl(n.valor_total)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {n.status === "rascunho" && (
                      <button
                        type="button"
                        onClick={() => setAlvo(n)}
                        className="rounded-full border border-[#D92546]/30 px-3 py-1 text-xs font-medium text-[#D92546] hover:bg-[#D92546]/10"
                      >
                        Descartar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Orquestração no provedor — fiscal_documents no operations-api */}
      <SectionCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Transmissões ao provedor fiscal</h2>
            <p className="text-xs text-muted-foreground">
              Ciclo de vida no provedor (Focus NFe): emissão, autorização, artefatos e cancelamento.
            </p>
          </div>
          {opsIndisponivel && (
            <span className="rounded-full border border-[#B8891D]/40 bg-[#B8891D]/8 px-3 py-1 text-xs font-medium text-[#B8891D]">
              Serviço de orquestração indisponível
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Pedido</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Ambiente</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Provedor</th>
                <th className="px-4 py-3 font-semibold">Número / Série</th>
                <th className="px-4 py-3 font-semibold">Sincronizado</th>
                <th className="px-4 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {opsIndisponivel
                      ? "Documentos do provedor indisponíveis no momento."
                      : "Nenhuma transmissão fiscal registrada."}
                  </td>
                </tr>
              )}
              {docs.map((d) => (
                <Fragment key={d.id}>
                  <tr className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        to={`/vendas/pedidos/${d.pedidoId}` as "/"}
                        className="font-medium text-primary hover:underline"
                      >
                        Pedido #{d.pedidoId}
                      </Link>
                      {d.notaFiscalId != null && (
                        <div className="text-xs text-muted-foreground">NF #{d.notaFiscalId}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{d.docType}</td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status={d.environment === "producao" ? "authorized" : "requested"}
                        label={d.environment === "producao" ? "Produção" : "Homologação"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={d.status.toLowerCase()} label={docStatusLabel(d)} />
                      {d.rejectionReason && (
                        <div
                          className="mt-0.5 max-w-[220px] truncate text-xs text-[#D92546]"
                          title={d.rejectionReason}
                        >
                          {d.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>{d.provider}</div>
                      {statusRemoto(d) && (
                        <div className="max-w-[180px] truncate" title={statusRemoto(d) ?? ""}>
                          {statusRemoto(d)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {d.numero || "—"}
                      {d.serie ? ` / ${d.serie}` : ""}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmtDataHora(d.lastSyncedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void sincronizarDoc(d)}
                          title="Consultar status no provedor"
                          className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void abrirHistorico(d)}
                          title="Histórico do documento"
                          className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                        {d.xmlUrl && (
                          <button
                            type="button"
                            onClick={() => void baixarArtefato(d, "xml")}
                            title="Baixar XML"
                            className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {d.pdfUrl && (
                          <button
                            type="button"
                            onClick={() => void baixarArtefato(d, "pdf")}
                            title="Baixar DANFE (PDF)"
                            className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(d.status === "AUTHORIZED" ||
                          d.status === "PROCESSING" ||
                          d.status === "REQUIRES_RECONCILIATION") && (
                          <button
                            type="button"
                            onClick={() => void reenviarWebhook(d)}
                            title="Reenviar notificação do provedor"
                            className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                          >
                            Reenviar hook
                          </button>
                        )}
                        {d.status === "AUTHORIZED" && (
                          <button
                            type="button"
                            onClick={() => setDocAlvo(d)}
                            className="rounded-full border border-[#D92546]/30 px-3 py-1 text-xs font-medium text-[#D92546] hover:bg-[#D92546]/10"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {historicoId === d.id && (
                    <tr className="border-b border-border/60 bg-secondary/30 last:border-0">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex items-center justify-between pb-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Histórico do documento
                          </span>
                          <button
                            type="button"
                            onClick={() => setHistoricoId(null)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Fechar
                          </button>
                        </div>
                        {historico.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Carregando…</p>
                        ) : (
                          <ol className="space-y-1.5">
                            {historico.map((ev) => (
                              <li key={ev.id} className="flex items-baseline gap-3 text-xs">
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {fmtDataHora(ev.createdAt)}
                                </span>
                                <span className="rounded-full border border-border bg-card px-2 py-0.5 font-medium">
                                  {ev.eventType}
                                </span>
                                {(ev.statusFrom || ev.statusTo) && (
                                  <span className="text-muted-foreground">
                                    {ev.statusFrom ?? "—"} → {ev.statusTo ?? "—"}
                                  </span>
                                )}
                                {ev.message && (
                                  <span className="text-foreground">{ev.message}</span>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <FormDialog
        open={emitirOpen}
        onOpenChange={setEmitirOpen}
        title="Emitir nota fiscal"
        description="A NF nasce em rascunho a partir dos dados e itens do pedido e é enviada ao provedor fiscal para autorização"
        submitLabel={emitindo ? "Emitindo…" : "Emitir NF"}
        onSubmit={emitir}
      >
        <FormField label="Pedido *" wide>
          {pedidosElegiveis.length > 0 ? (
            <select
              className={fieldClass}
              required
              value={pedidoId}
              onChange={(e) => setPedidoId(e.target.value)}
            >
              <option value="">Selecione um pedido…</option>
              {pedidosElegiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} · {p.numero} — {empresas.get(p.empresa_id) ?? `Empresa #${p.empresa_id}`}{" "}
                  ({brl(p.total)})
                </option>
              ))}
            </select>
          ) : (
            <input
              className={fieldClass}
              type="number"
              required
              placeholder="ID do pedido"
              value={pedidoId}
              onChange={(e) => setPedidoId(e.target.value)}
            />
          )}
        </FormField>
      </FormDialog>

      <FormDialog
        open={alvo !== null}
        onOpenChange={(o) => !o && setAlvo(null)}
        title={`Descartar NF #${alvo?.numero || alvo?.id || ""}`}
        description="Descarta o rascunho no sistema — não afeta documento já transmitido"
        submitLabel="Descartar rascunho"
        onSubmit={cancelarRascunho}
      >
        <FormField label="Justificativa (obrigatório) *" wide>
          <input
            className={fieldClass}
            required
            minLength={15}
            placeholder="Mínimo de 15 caracteres conforme exigência fiscal…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </FormField>
      </FormDialog>

      <FormDialog
        open={docAlvo !== null}
        onOpenChange={(o) => !o && setDocAlvo(null)}
        title={`Cancelar documento ${docAlvo?.numero ?? docAlvo?.id.slice(0, 8) ?? ""}`}
        description="Envia o cancelamento ao provedor fiscal — exige justificativa de 15 a 255 caracteres"
        submitLabel="Cancelar documento"
        onSubmit={cancelarDocumento}
      >
        <FormField label="Justificativa do cancelamento (obrigatório) *" wide>
          <input
            className={fieldClass}
            required
            minLength={15}
            maxLength={255}
            placeholder="Mínimo de 15 caracteres conforme exigência fiscal…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </FormField>
      </FormDialog>
    </>
  );
}
