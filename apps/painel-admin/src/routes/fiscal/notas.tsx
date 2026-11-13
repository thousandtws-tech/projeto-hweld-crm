import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, FileDown, FileText, History, Plus, RefreshCw } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { Metabox, PageHeader, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField } from "@/components/ui-kit/FormDialog";
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
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

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
            <Button variant="contained" type="button" onClick={() => setEmitirOpen(true)}><Plus className="h-4 w-4" /> Emitir NF</Button>
            <IconButton size="small" type="button" onClick={() => {
                void carregar();
                void carregarDocs();
              }} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></IconButton>
          </div>
        }
      />

      {/* Falha ao ler a configuração — nunca confundir com "faltam credenciais" */}
      {configErro && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void carregarConfig()}>
              Tentar novamente
            </Button>
          }
        >
          <AlertTitle>Não foi possível verificar a configuração fiscal</AlertTitle>
          O estado real da integração SEFAZ está indisponível no momento.
        </Alert>
      )}

      {/* Status da integração SEFAZ — dirigido pela configuração real */}
      {configFiscal?.status_integracao === "pendente_credenciais" && (
        <Alert severity="warning" icon={<AlertTriangle className="h-4 w-4" />} sx={{ mb: 2 }}>
          <AlertTitle>Integração SEFAZ pendente para liberação definitiva em produção</AlertTitle>
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
        </Alert>
      )}
      {configFiscal?.status_integracao === "homologacao_pronta" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <AlertTitle>Credenciais completas — ambiente de homologação</AlertTitle>
          Certificado, CSC e parâmetros configurados. As transmissões seguem em homologação até
          a ativação do emissor fiscal de produção.
        </Alert>
      )}
      {configFiscal?.status_integracao === "producao_pronta" && (
        <Alert severity="success" sx={{ mb: 2 }}>
          <AlertTitle>Integração SEFAZ pronta para produção</AlertTitle>
          Credenciais completas e ambiente em produção — aguardando ativação do transmissor
          fiscal oficial.
        </Alert>
      )}

      {/* Registro de negócio — notas_fiscais no core-api */}
      <Metabox
        title="Notas fiscais"
        action={
          <Typography variant="caption" className="text-muted-foreground">
            registro de negócio — atualizado pelos eventos do provedor
          </Typography>
        }
        className="mb-5"
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table size="small" className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <TableHead>
              <TableRow >
                <TableCell >#</TableCell>
                <TableCell >Pedido</TableCell>
                <TableCell >Empresa</TableCell>
                <TableCell >Número / Série</TableCell>
                <TableCell >Status</TableCell>
                <TableCell >Chave de acesso</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {notas.length === 0 && (
                <TableRow >
                  <TableCell align="center" colSpan={8}>
                    Nenhuma nota fiscal emitida.
                  </TableCell>
                </TableRow>
              )}
              {notas.map((n) => (
                <TableRow key={n.id}>
                  <TableCell >#{n.id}</TableCell>
                  <TableCell >
                    <Link
                      to={`/vendas/pedidos/${n.pedido_id}` as "/"}
                      className="font-medium text-primary hover:underline"
                    >
                      Pedido #{n.pedido_id}
                    </Link>
                  </TableCell>
                  <TableCell >
                    {empresas.get(n.empresa_id) ?? `Empresa #${n.empresa_id}`}
                  </TableCell>
                  <TableCell >
                    {n.numero || "—"}
                    {n.serie ? ` / Série ${n.serie}` : ""}
                  </TableCell>
                  <TableCell >
                    <StatusPill status={n.status} label={statusLabel(n.status)} />
                  </TableCell>
                  <TableCell >
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      title={n.chave ?? undefined}
                    >
                      {n.chave ? `${n.chave.slice(0, 22)}…` : "—"}
                    </span>
                  </TableCell>
                  <TableCell align="right">
                    {brl(n.valor_total)}
                  </TableCell>
                  <TableCell align="right">
                    {n.status === "rascunho" && (
                      <Button variant="outlined" color="error" size="small" type="button" onClick={() => setAlvo(n)}>Descartar</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Metabox>

      {/* Orquestração no provedor — fiscal_documents no operations-api */}
      <Metabox
        title="Transmissões ao provedor fiscal"
        action={
          opsIndisponivel ? (
            <Chip size="small" variant="outlined" color="warning" label="Serviço de orquestração indisponível" />
          ) : (
            <Typography variant="caption" className="text-muted-foreground">
              ciclo de vida no provedor (Focus NFe): emissão, autorização, artefatos, cancelamento
            </Typography>
          )
        }
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table size="small" className="w-full text-sm">
            <TableHead>
              <TableRow >
                <TableCell >Pedido</TableCell>
                <TableCell >Tipo</TableCell>
                <TableCell >Ambiente</TableCell>
                <TableCell >Status</TableCell>
                <TableCell >Provedor</TableCell>
                <TableCell >Número / Série</TableCell>
                <TableCell >Sincronizado</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {docs.length === 0 && (
                <TableRow >
                  <TableCell align="center" colSpan={8}>
                    {opsIndisponivel
                      ? "Documentos do provedor indisponíveis no momento."
                      : "Nenhuma transmissão fiscal registrada."}
                  </TableCell>
                </TableRow>
              )}
              {docs.map((d) => (
                <Fragment key={d.id}>
                  <TableRow >
                    <TableCell >
                      <Link
                        to={`/vendas/pedidos/${d.pedidoId}` as "/"}
                        className="font-medium text-primary hover:underline"
                      >
                        Pedido #{d.pedidoId}
                      </Link>
                      {d.notaFiscalId != null && (
                        <div className="text-xs text-muted-foreground">NF #{d.notaFiscalId}</div>
                      )}
                    </TableCell>
                    <TableCell >{d.docType}</TableCell>
                    <TableCell >
                      <StatusPill
                        status={d.environment === "producao" ? "authorized" : "requested"}
                        label={d.environment === "producao" ? "Produção" : "Homologação"}
                      />
                    </TableCell>
                    <TableCell >
                      <StatusPill status={d.status.toLowerCase()} label={docStatusLabel(d)} />
                      {d.rejectionReason && (
                        <div
                          className="mt-0.5 max-w-[220px] truncate text-xs text-[#D92546]"
                          title={d.rejectionReason}
                        >
                          {d.rejectionReason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell >
                      <div>{d.provider}</div>
                      {statusRemoto(d) && (
                        <div className="max-w-[180px] truncate" title={statusRemoto(d) ?? ""}>
                          {statusRemoto(d)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell >
                      {d.numero || "—"}
                      {d.serie ? ` / ${d.serie}` : ""}
                    </TableCell>
                    <TableCell >
                      {fmtDataHora(d.lastSyncedAt)}
                    </TableCell>
                    <TableCell >
                      <div className="flex items-center justify-end gap-1">
                        <IconButton size="small" type="button" onClick={() => void sincronizarDoc(d)} title="Consultar status no provedor"><RefreshCw className="h-3.5 w-3.5" /></IconButton>
                        <IconButton size="small" type="button" onClick={() => void abrirHistorico(d)} title="Histórico do documento"><History className="h-3.5 w-3.5" /></IconButton>
                        {d.xmlUrl && (
                          <IconButton size="small" type="button" onClick={() => void baixarArtefato(d, "xml")} title="Baixar XML"><FileDown className="h-3.5 w-3.5" /></IconButton>
                        )}
                        {d.pdfUrl && (
                          <IconButton size="small" type="button" onClick={() => void baixarArtefato(d, "pdf")} title="Baixar DANFE (PDF)"><FileText className="h-3.5 w-3.5" /></IconButton>
                        )}
                        {(d.status === "AUTHORIZED" ||
                          d.status === "PROCESSING" ||
                          d.status === "REQUIRES_RECONCILIATION") && (
                          <Button variant="text" size="small" type="button" onClick={() => void reenviarWebhook(d)} title="Reenviar notificação do provedor">Reenviar hook</Button>
                        )}
                        {d.status === "AUTHORIZED" && (
                          <Button variant="outlined" color="error" size="small" type="button" onClick={() => setDocAlvo(d)}>Cancelar</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {historicoId === d.id && (
                    <TableRow >
                      <TableCell colSpan={8}>
                        <div className="flex items-center justify-between pb-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Histórico do documento
                          </span>
                          <Button variant="text" size="small" type="button" onClick={() => setHistoricoId(null)}>Fechar</Button>
                        </div>
                        {historico.length === 0 ? (
                          <Typography variant="body2" component="p" className="text-xs text-muted-foreground">Carregando…</Typography>
                        ) : (
                          <List component="ol" disablePadding>
                            {historico.map((ev) => (
                              <ListItem key={ev.id}>
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
                              </ListItem>
                            ))}
                          </List>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </Metabox>

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
            <TextField size="small" fullWidth select
              required
              value={pedidoId}
              onChange={(e) => setPedidoId(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
              <MenuItem value="">Selecione um pedido…</MenuItem>
              {pedidosElegiveis.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  #{p.id} · {p.numero} — {empresas.get(p.empresa_id) ?? `Empresa #${p.empresa_id}`}{" "}
                  ({brl(p.total)})
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField size="small" fullWidth
              type="number"
              required
              placeholder="ID do pedido"
              value={pedidoId}
              onChange={(e) => setPedidoId(e.target.value)} />
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
          <TextField size="small" fullWidth slotProps={{ htmlInput: { minLength: 15 } }}
            required
           
            placeholder="Mínimo de 15 caracteres conforme exigência fiscal…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)} />
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
          <TextField size="small" fullWidth slotProps={{ htmlInput: { minLength: 15, maxLength: 255 } }}
            required
           
           
            placeholder="Mínimo de 15 caracteres conforme exigência fiscal…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)} />
        </FormField>
      </FormDialog>
    </>
  );
}
