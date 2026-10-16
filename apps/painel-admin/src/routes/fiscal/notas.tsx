import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { brl, statusLabel } from "@/lib/format";
import { exigePerfil } from "@/lib/guards";
import type { ConfigFiscal, Empresa, NotaFiscal, Pedido } from "@/lib/models";
import { crmService, fiscalService, pedidosService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";

export const Route = createFileRoute("/fiscal/notas")({
  beforeLoad: exigePerfil("admin", "financeiro"),
  component: FiscalPage,
});

/** Notas fiscais — emitir (por pedido), autorizar (stub SEFAZ), cancelar com motivo. */
function FiscalPage() {
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [empresas, setEmpresas] = useState<Map<number, string>>(new Map());
  const [pedidosElegiveis, setPedidosElegiveis] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [configFiscal, setConfigFiscal] = useState<ConfigFiscal | null>(null);
  const [configErro, setConfigErro] = useState(false);

  const [emitirOpen, setEmitirOpen] = useState(false);
  const [pedidoId, setPedidoId] = useState("");
  const [alvo, setAlvo] = useState<NotaFiscal | null>(null);
  const [motivo, setMotivo] = useState("");

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
    void carregarConfig();
  }, [carregar]);

  useRealtimeEvent(
    (t) =>
      t.startsWith("fiscal.nota_") || t === "pedido.status_alterado" || t === "fiscal.configuracao",
    () => {
      void carregar(true);
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
          ["confirmado", "em_separacao", "faturado", "enviado", "entregue", "concluido"].includes(
            ped.status,
          ),
        );
        setPedidosElegiveis(faturaveis);
      })
      .catch(() => toast.error("Falha ao carregar pedidos faturáveis."));
  }, [emitirOpen]);

  const emitir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoId) return;
    try {
      await fiscalService.emitir(Number(pedidoId));
      setEmitirOpen(false);
      setPedidoId("");
      void carregar();
      toast.success("NF emitida em rascunho.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao emitir NF.");
    }
  };

  const autorizar = async (n: NotaFiscal) => {
    try {
      await fiscalService.autorizar(n.id);
      void carregar();
      toast.success("NF autorizada em ambiente de homologação.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao autorizar.");
    }
  };

  const cancelar = async (e: React.FormEvent) => {
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

  return (
    <AppShell>
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
              onClick={() => void carregar()}
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

      <SectionCard className="overflow-hidden p-0">
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
                    {(n.status === "rascunho" || n.status === "rejeitada") && (
                      <button
                        type="button"
                        onClick={() => void autorizar(n)}
                        className="mr-2 rounded-full bg-lime px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Autorizar
                      </button>
                    )}
                    {(n.status === "autorizada" || n.status === "rascunho") && (
                      <button
                        type="button"
                        onClick={() => setAlvo(n)}
                        className="rounded-full border border-[#D92546]/30 px-3 py-1 text-xs font-medium text-[#D92546] hover:bg-[#D92546]/10"
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <FormDialog
        open={emitirOpen}
        onOpenChange={setEmitirOpen}
        title="Emitir nota fiscal"
        description="A NF nasce em rascunho a partir dos dados e itens do pedido selecionado"
        submitLabel="Emitir rascunho"
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
        title={`Cancelar NF #${alvo?.numero || alvo?.id || ""}`}
        description="O cancelamento registra o evento fiscal com justificativa obrigatória"
        submitLabel="Cancelar NF"
        onSubmit={cancelar}
      >
        <FormField label="Justificativa do cancelamento (obrigatório) *" wide>
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
    </AppShell>
  );
}
