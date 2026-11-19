import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  RefreshCcw,
  Webhook,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { ApiError } from "@/lib/api";
import type { DocumentoSpedy, EventoSpedy, IntegracaoSpedy } from "@/lib/models";
import { spedyService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

const STATUS_DOC: Record<string, string> = {
  REQUESTED: "Solicitada",
  PROCESSING: "Processando",
  AUTHORIZED: "Autorizada",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
  CANCELLATION_PENDING: "Cancelando",
  REQUIRES_RECONCILIATION: "Reconciliação",
  ERROR: "Erro",
};

const RESULTADO_EVENTO: Record<string, string> = {
  PROCESSED: "Processado",
  PROCESSED_NO_CHANGE: "Sem mudança",
  IGNORED: "Ignorado",
  FAILED: "Falhou",
};

const inputSm = { size: "small" as const, fullWidth: true };

/** Painel Spedy fiscal — abas Visão geral / Configurações / Eventos /
 *  Histórico. X-Api-Key write-only, ambiente sandbox/produção, webhook
 *  assinado auto-registrado e documentos fiscais emitidos. */
export function SpedyPainel({
  onView,
}: {
  onView?: (v: IntegracaoSpedy) => void;
}) {
  const [i, setI] = useState<IntegracaoSpedy | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [aba, setAba] = useState("geral");

  const [fNome, setFNome] = useState("");
  const [fAmbiente, setFAmbiente] = useState("sandbox");
  const [fApiKey, setFApiKey] = useState("");
  const [fPausada, setFPausada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ verificacao_status: string; mensagem?: string } | null>(null);
  const [alternando, setAlternando] = useState(false);

  const [eventos, setEventos] = useState<EventoSpedy[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoSpedy[]>([]);

  const preencher = useCallback((v: IntegracaoSpedy) => {
    setI(v);
    onView?.(v);
    setFNome(v.nome_conta ?? "");
    setFAmbiente(v.config?.ambiente === "producao" ? "producao" : "sandbox");
    setFPausada(v.config?.emissao_pausada === true);
    setFApiKey("");
  }, [onView]);

  const carregar = useCallback(async () => {
    setConflito(false);
    try {
      preencher(await spedyService.view());
      setFalha(false);
    } catch (err) {
      setFalha(true);
      toast.error(err instanceof Error ? err.message : "Falha ao carregar integração Spedy.");
    } finally {
      setCarregando(false);
    }
  }, [preencher]);

  const carregarEventos = useCallback(async () => {
    try {
      setEventos(await spedyService.eventos());
    } catch { /* aba secundária */ }
  }, []);

  const carregarDocumentos = useCallback(async () => {
    try {
      setDocumentos(await spedyService.documentos());
    } catch { /* não bloqueia */ }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarEventos();
    void carregarDocumentos();
  }, [carregar, carregarEventos, carregarDocumentos]);

  const salvar = async () => {
    if (!i) return;
    setSalvando(true);
    try {
      const nova = await spedyService.salvar({
        versao: i.versao,
        nome_conta: fNome.trim(),
        config: {
          ambiente: fAmbiente,
          emissao_pausada: fPausada,
        },
        ...(fApiKey.trim() ? { segredos: { api_key: fApiKey.trim() } } : {}),
      });
      preencher(nova);
      toast.success("Configuração salva — webhook sincronizado na conta Spedy.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflito(true);
        toast.error("Integração alterada por outro administrador — recarregue antes de salvar.");
      } else {
        toast.error(err instanceof Error ? err.message : "Falha ao salvar configuração.");
      }
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    setTeste(null);
    try {
      setTeste(await spedyService.testarConexao());
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no teste de conexão.");
    } finally {
      setTestando(false);
    }
  };

  const alternarHabilitado = async () => {
    if (!i) return;
    setAlternando(true);
    try {
      const nova = await spedyService.habilitar(!i.habilitado);
      preencher(nova);
      toast.success(nova.habilitado ? "Integração habilitada." : "Integração desabilitada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar habilitação.");
    } finally {
      setAlternando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("URL copiada.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const fmtData = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
  };

  if (carregando) {
    return (
      <SectionCard>
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando integração Spedy…
        </div>
      </SectionCard>
    );
  }

  if (falha || !i) {
    return (
      <SectionCard>
        <div className="py-8 text-center">
          <Typography variant="body2" className="text-xs text-muted-foreground">
            Não foi possível carregar a integração Spedy.
          </Typography>
          <Button variant="outlined" size="small" className="mt-3" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      {conflito && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[#B8891D]/40 bg-[#B8891D]/8 px-3.5 py-3" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#B8891D]" />
          <span className="flex-1 text-xs text-muted-foreground">
            Outro administrador alterou esta integração. Recarregue antes de salvar.
          </span>
          <Button size="small" variant="outlined" onClick={() => void carregar()}>
            Recarregar
          </Button>
        </div>
      )}

      <Tabs
        value={aba}
        onChange={(_, v) => setAba(v)}
        sx={{ mb: 2.5, minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none" } }}
      >
        <Tab value="geral" label="Visão geral" />
        <Tab value="config" label="Configurações" />
        <Tab value="eventos" label="Eventos e sincronização" />
        <Tab value="historico" label="Histórico" />
      </Tabs>

      {aba === "geral" && (
        <>
          {/* Estado da operação */}
          <SectionCard className="mb-4">
            <Typography variant="h6" component="h3" className="text-sm font-semibold">
              Operação
            </Typography>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-xl border border-border px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ambiente</div>
                <div className="mt-0.5 font-medium text-foreground">
                  {i.config?.ambiente === "producao" ? "Produção" : "Sandbox (homologação)"}
                </div>
              </div>
              <div className="rounded-xl border border-border px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Empresa</div>
                <div className="mt-0.5 font-mono text-[11px] font-medium text-foreground">
                  {i.config?.empresa_id || "—"}
                </div>
              </div>
              <div className="rounded-xl border border-border px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Última verificação</div>
                <div className="mt-0.5 font-medium text-foreground">
                  {i.verificacao_status === "ok" ? "Conexão OK"
                    : i.verificacao_status === "falha" ? "Falha"
                    : "Nunca testada"}
                </div>
                {i.verificacao_status === "falha" && i.verificacao_erro && (
                  <div className="mt-1 text-[11px] text-[#B3261E]">{i.verificacao_erro}</div>
                )}
              </div>
              <div className="rounded-xl border border-border px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Documentos pendentes</div>
                <div className="mt-0.5 font-medium text-foreground">{i.pendentes}</div>
              </div>
            </div>

            {i.config?.webhook_url && (
              <div className="mt-4 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Webhook className="h-3.5 w-3.5" /> Webhook registrado na conta
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate font-mono text-[11px] text-foreground">
                    {i.config.webhook_url}
                  </code>
                  <Button size="small" variant="text" onClick={() => void copiar(i.config.webhook_url!)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Typography variant="body2" className="mt-1.5 text-[11px] text-muted-foreground">
                  Assinado com o segredo da conta (Standard Webhooks) — a Spedy notifica
                  autorizações, rejeições e cancelamentos aqui. Evento: invoice.status_changed.
                </Typography>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <div>
                <div className="text-xs font-medium text-foreground">Emissão habilitada</div>
                <div className="text-[11px] text-muted-foreground">
                  Desligar interrompe novas emissões — documentos existentes continuam reconciliando.
                </div>
              </div>
              <Switch checked={i.habilitado} disabled={alternando}
                onChange={() => void alternarHabilitado()} />
            </div>
          </SectionCard>
        </>
      )}

      {aba === "config" && (
        <SectionCard>
          <Typography variant="h6" component="h3" className="text-sm font-semibold">
            Credenciais da empresa
          </Typography>
          <Typography variant="body2" className="mb-4 text-xs text-muted-foreground">
            Painel Spedy → menu do perfil → Minha empresa → Credenciais de API. A chave é
            write-only — campo em branco mantém o valor atual. Emita primeiro em
            <strong> sandbox</strong> para homologar o fluxo.
          </Typography>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Nome da conexão</div>
              <TextField {...inputSm} placeholder="Ex.: Fiscal HWeld"
                value={fNome} onChange={(e) => setFNome(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Ambiente *</div>
              <TextField {...inputSm} select value={fAmbiente}
                onChange={(e) => setFAmbiente(e.target.value)}>
                <MenuItem value="sandbox">Sandbox (homologação)</MenuItem>
                <MenuItem value="producao">Produção</MenuItem>
              </TextField>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
                X-Api-Key da empresa *
                {i.segredos.campos.api_key && (
                  <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurada</span>
                )}
              </div>
              <TextField {...inputSm} type="password" autoComplete="new-password"
                placeholder={i.segredos.campos.api_key ? "Deixe em branco para manter" : "Chave de API da empresa"}
                value={fApiKey} onChange={(e) => setFApiKey(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <div className="text-xs font-medium text-foreground">Pausar emissões</div>
              <div className="text-[11px] text-muted-foreground">
                Novas emissões são recusadas localmente — consultas e webhooks seguem ativos.
              </div>
            </div>
            <Switch checked={fPausada} onChange={(e) => setFPausada(e.target.checked)} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Button variant="contained" size="small" disabled={salvando}
              onClick={() => void salvar()}>
              {salvando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salvar configuração
            </Button>
            <Button variant="outlined" size="small" disabled={testando || !i.segredos.campos.api_key}
              onClick={() => void testar()}>
              {testando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1.5 h-4 w-4" />}
              Testar conexão
            </Button>
            {teste && (
              <span className={`flex items-center gap-1.5 text-[11px] ${
                teste.verificacao_status === "ok" ? "text-[#2E7D4F]" : "text-[#B3261E]"}`}>
                {teste.verificacao_status === "ok"
                  ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : <AlertTriangle className="h-3.5 w-3.5" />}
                {teste.mensagem}
              </span>
            )}
          </div>

          {i.segredos.campos.api_key && !i.habilitado && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#B8891D]/40 bg-[#B8891D]/8 px-3.5 py-3" role="note">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#B8891D]" />
              <span className="flex-1 text-xs text-muted-foreground">
                Credenciais salvas — para concluir a conexão, ative
                <strong> Emissão habilitada</strong> na aba Visão geral.
              </span>
              <Button size="small" variant="outlined" onClick={() => setAba("geral")}>
                Ir para Visão geral
              </Button>
            </div>
          )}
        </SectionCard>
      )}

      {aba === "eventos" && (
        <SectionCard>
          <Typography variant="h6" component="h3" className="text-sm font-semibold">
            Eventos de webhook
          </Typography>
          <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
            Últimas entregas recebidas da Spedy — verificação de assinatura e deduplicação
            aplicadas antes de atualizar o documento.
          </Typography>
          {eventos.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhum evento recebido ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Entrega</th>
                    <th className="pb-2 pr-4 font-medium">Resultado</th>
                    <th className="pb-2 pr-4 font-medium">Documento</th>
                    <th className="pb-2 font-medium">Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-mono text-[11px]">{e.evento.slice(0, 13)}…</td>
                      <td className="py-2 pr-4">
                        <StatusPill
                          status={e.resultado === "PROCESSED" || e.resultado === "PROCESSED_NO_CHANGE"
                            ? "success" : e.resultado === "FAILED" ? "error" : "default"}
                          label={RESULTADO_EVENTO[e.resultado] ?? e.resultado} />
                        {e.erro && <div className="mt-1 max-w-xs truncate text-[10px] text-[#B3261E]">{e.erro}</div>}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[11px]">
                        {e.documento ? `${e.documento.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">{fmtData(e.recebido_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {aba === "historico" && (
        <SectionCard>
          <Typography variant="h6" component="h3" className="text-sm font-semibold">
            Documentos fiscais
          </Typography>
          <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
            NF-e emitidas via Spedy. O ciclo de vida completo (emissão, cancelamento,
            artefatos) está em <strong>Fiscal → Notas</strong>.
          </Typography>
          {documentos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Nenhum documento emitido por esta integração ainda.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Pedido</th>
                    <th className="pb-2 pr-4 font-medium">Tipo</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Número/Série</th>
                    <th className="pb-2 font-medium">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-mono text-[11px]">{d.pedido_id ?? "—"}</td>
                      <td className="py-2 pr-4">{d.tipo}</td>
                      <td className="py-2 pr-4">
                        <StatusPill
                          status={d.status === "AUTHORIZED" ? "success"
                            : d.status === "REJECTED" || d.status === "ERROR" ? "error"
                            : d.status === "CANCELLED" ? "default" : "info"}
                          label={STATUS_DOC[d.status] ?? d.status} />
                        {d.motivo_rejeicao && (
                          <div className="mt-1 max-w-xs truncate text-[10px] text-[#B3261E]">
                            {d.motivo_rejeicao}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[11px]">
                        {d.numero || d.serie ? `${d.numero || "—"}/${d.serie || "—"}` : "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">{fmtData(d.criado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </>
  );
}
