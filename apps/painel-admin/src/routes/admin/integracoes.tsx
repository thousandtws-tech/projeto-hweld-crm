import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  MessageSquare,
  Play,
  RefreshCcw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField } from "@/components/ui-kit/FormDialog";
import { exigePerfil } from "@/lib/guards";
import type { EntregaSms, IntegracaoInfobip } from "@/lib/models";
import { integracoesService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/admin/integracoes")({
  beforeLoad: exigePerfil("admin"),
  component: IntegracoesPage,
});

const EVENTOS_SMS: { tipo: string; rotulo: string }[] = [
  { tipo: "OrderCreated", rotulo: "Pedido registrado" },
  { tipo: "PaymentRequested", rotulo: "Cobrança gerada" },
  { tipo: "PaymentConfirmed", rotulo: "Pagamento confirmado" },
  { tipo: "PaymentFailed", rotulo: "Pagamento não aprovado" },
  { tipo: "PaymentExpired", rotulo: "Cobrança expirada" },
  { tipo: "InvoiceAuthorized", rotulo: "NF-e autorizada" },
];

const STATUS_ENTREGA: Record<string, string> = {
  QUEUED: "Na fila",
  SENDING: "Enviando",
  SENT: "Aceito pelo provider",
  ACCEPTED: "Aceito pelo provider",
  DELIVERED: "Entregue",
  FAILED: "Falha (retry agendado)",
  EXPIRED: "Expirado",
  SUPPRESSED: "Suprimido",
  UNKNOWN: "Sem confirmação (DLR)",
  DEAD: "Falha definitiva",
};

const PREVIEW_SMS_TESTE = "HWeld: SMS de teste da integração Infobip. Nenhuma ação necessária.";

/** Dependências que impedem o estado "pronta para uso". */
function pendencias(cfg: IntegracaoInfobip): string[] {
  const p: string[] = [];
  if (cfg.provedor === "log") {
    p.push("Provider de log (dev) — configure SMS_PROVIDER=infobip + INFOBIP_* no ambiente");
  } else {
    if (!cfg.baseUrlConfigurada) p.push("Base URL da conta (INFOBIP_BASE_URL)");
    if (!cfg.apiKeyConfigurada) p.push("API key (INFOBIP_API_KEY)");
    if (!cfg.remetente) p.push("Remetente autorizado (INFOBIP_SENDER ou configuração)");
    if (!cfg.callbackConfigurado) p.push("Callback DLR (INFOBIP_DLR_AUTH_TOKEN)");
  }
  return p;
}

/** Módulo Integrações — card Infobip SMS: estado, toggles, testes e histórico. */
function IntegracoesPage() {
  const [cfg, setCfg] = useState<IntegracaoInfobip | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [testando, setTestando] = useState(false);
  const [dialogConfig, setDialogConfig] = useState(false);
  const [dialogSms, setDialogSms] = useState(false);

  const [form, setForm] = useState({ sender: "", maxSegmentos: "3", destinatarios: "" });
  const [smsDestino, setSmsDestino] = useState("");
  const [enviandoSms, setEnviandoSms] = useState(false);

  const [historico, setHistorico] = useState<EntregaSms[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroPedido, setFiltroPedido] = useState("");

  const carregar = useCallback(async () => {
    try {
      setCfg(await integracoesService.infobip());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar integração.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarHistorico = useCallback(async () => {
    try {
      const f: Record<string, string> = { porPagina: "50" };
      if (filtroStatus) f.status = filtroStatus;
      if (filtroPedido.trim()) f.pedidoId = filtroPedido.trim();
      setHistorico((await integracoesService.historico(f)).content);
    } catch {
      toast.error("Falha ao carregar histórico SMS.");
    }
  }, [filtroStatus, filtroPedido]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const abrirConfig = () => {
    if (!cfg) return;
    setForm({
      sender: cfg.remetente,
      maxSegmentos: String(cfg.maxSegmentos),
      destinatarios: cfg.destinatariosTeste.join(", "),
    });
    setDialogConfig(true);
  };

  const salvarConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const destinatarios = form.destinatarios
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const cfgNova = await integracoesService.salvarConfig({
        enabled: cfg?.ativado ?? false,
        sender: form.sender.trim(),
        maxSegments: Number(form.maxSegmentos) || 3,
        testRecipients: destinatarios,
        events: cfg?.eventos ?? {},
      });
      setCfg(cfgNova);
      setDialogConfig(false);
      toast.success("Configuração da integração salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar configuração.");
    }
  };

  const alternarAtivacao = async () => {
    if (!cfg) return;
    try {
      const cfgNova = await integracoesService.salvarConfig({
        enabled: !cfg.ativado,
        sender: cfg.remetente,
        maxSegments: cfg.maxSegmentos,
        testRecipients: cfg.destinatariosTeste,
        events: cfg.eventos,
      });
      setCfg(cfgNova);
      toast.success(cfgNova.ativado ? "Envios de SMS ativados." : "Novos envios pausados — relatórios DLR continuam registrados.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar ativação.");
    }
  };

  const alternarEvento = async (tipo: string, ligado: boolean) => {
    if (!cfg) return;
    try {
      const cfgNova = await integracoesService.salvarConfig({
        enabled: cfg.ativado,
        sender: cfg.remetente,
        maxSegments: cfg.maxSegmentos,
        testRecipients: cfg.destinatariosTeste,
        events: { ...cfg.eventos, [tipo]: ligado },
      });
      setCfg(cfgNova);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar gatilho.");
    }
  };

  const testarConexao = async () => {
    setTestando(true);
    try {
      const r = await integracoesService.testarConexao();
      if (r.ok) toast.success(`Conexão válida — ${r.detalhe}`);
      else toast.error(`Conexão falhou — ${r.detalhe}`);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no teste de conexão.");
    } finally {
      setTestando(false);
    }
  };

  const enviarSmsTeste = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoSms(true);
    try {
      const d = await integracoesService.enviarSmsTeste(smsDestino);
      setDialogSms(false);
      toast.success(`SMS de teste enfileirado — entrega ${d.id.slice(0, 8)}…`);
      await carregarHistorico();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar SMS de teste.");
    } finally {
      setEnviandoSms(false);
    }
  };

  const reprocessar = async (id: string) => {
    try {
      await integracoesService.reprocessar(id);
      toast.success("Entrega reenfileirada — se já houve envio, pode haver duplicidade.");
      await carregarHistorico();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reprocessar.");
    }
  };

  const pendentes = cfg ? pendencias(cfg) : [];
  const pronto = cfg !== null && pendentes.length === 0;

  return (
    <>
      <PageHeader
        title="Integrações"
        subtitle="Canais e provedores externos conectados ao HWeld"
      />

      {/* Card Infobip — SMS */}
      <SectionCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-border bg-secondary/60 p-2.5">
              <MessageSquare className="h-5 w-5 text-[#26488c]" />
            </div>
            <div>
              <Typography variant="h6" component="h2" className="text-sm font-semibold">
                Infobip — SMS
              </Typography>
              <Typography variant="body2" className="text-xs text-muted-foreground">
                Comunicação · mensagens transacionais (pedidos, cobranças, NF-e)
              </Typography>
            </div>
          </div>
          {cfg && (
            <StatusPill
              status={pronto ? (cfg.ativado ? "ativo" : "inativo") : "urgente"}
              label={pronto ? (cfg.ativado ? "Ativa" : "Configurada — pausada") : "Integração pendente"}
            />
          )}
        </div>

        {/* Estado — cada dependência separada, nunca mascara pendência */}
        {cfg && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <EstadoItem rotulo="Credenciais" ok={cfg.envConfigurado}
              detalhe={cfg.provedor === "log" ? "provider de log (dev)" : "INFOBIP_* configuradas"} />
            <EstadoItem rotulo="Remetente" ok={Boolean(cfg.remetente)}
              detalhe={cfg.remetente || "não definido"} />
            <EstadoItem rotulo="Callback DLR" ok={cfg.callbackConfigurado}
              detalhe={cfg.callbackConfigurado ? "autenticado" : "não configurado"} />
            <EstadoItem rotulo="Última validação"
              ok={cfg.ultimaValidacao?.ok === true}
              detalhe={cfg.ultimaValidacao?.at
                ? new Date(cfg.ultimaValidacao.at).toLocaleString("pt-BR")
                : "nunca testada"} />
          </div>
        )}

        {cfg && pendentes.length > 0 && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#B8891D]/40 bg-[#B8891D]/8 px-3.5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B8891D]" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#B8891D]">Pendências antes do uso</div>
              {pendentes.map((p) => (
                <div key={p} className="text-xs text-muted-foreground">· {p}</div>
              ))}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="contained" size="small" onClick={abrirConfig} disabled={!cfg}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Configurar
          </Button>
          <Button variant="outlined" size="small" onClick={() => void testarConexao()}
            disabled={!cfg || testando}>
            {testando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            Testar conexão
          </Button>
          <Button variant="outlined" size="small" onClick={() => setDialogSms(true)}
            disabled={!cfg || (cfg.destinatariosTeste?.length ?? 0) === 0}>
            <MessageSquare className="mr-1.5 h-4 w-4" /> Enviar SMS de teste
          </Button>
          <Button variant="outlined" size="small"
            color={cfg?.ativado ? "error" : "primary"}
            onClick={() => void alternarAtivacao()} disabled={!cfg}>
            {cfg?.ativado ? "Pausar novos envios" : "Ativar envios"}
          </Button>
        </div>

        {/* Gatilhos por evento */}
        {cfg && (
          <div className="mt-5 border-t border-border/60 pt-4">
            <Typography variant="body2" className="mb-2 text-xs font-semibold text-foreground">
              Gatilhos SMS por evento
            </Typography>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {EVENTOS_SMS.map((ev) => (
                <label key={ev.tipo}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50">
                  {ev.rotulo}
                  <Switch size="small"
                    checked={cfg.ativado && Boolean(cfg.eventos?.[ev.tipo])}
                    disabled={!cfg.ativado}
                    onChange={(e) => void alternarEvento(ev.tipo, e.target.checked)} />
                </label>
              ))}
            </div>
            {!cfg.ativado && (
              <Typography variant="body2" className="mt-1 text-[11px] text-muted-foreground">
                Ative a integração para habilitar os gatilhos.
              </Typography>
            )}
          </div>
        )}
      </SectionCard>

      {/* Histórico SMS */}
      <SectionCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Typography variant="h6" component="h2" className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" /> Histórico de envios SMS
          </Typography>
          <div className="flex items-center gap-2">
            <TextField size="small" select sx={{ minWidth: 190 }}
              value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
              slotProps={{ select: { displayEmpty: true } }}>
              <MenuItem value="">Todos os status</MenuItem>
              {Object.entries(STATUS_ENTREGA).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" placeholder="Pedido (id)" sx={{ width: 130 }}
              value={filtroPedido} onChange={(e) => setFiltroPedido(e.target.value)} />
            <Button variant="outlined" size="small" onClick={() => void carregarHistorico()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {historico.length === 0 ? (
          <Typography variant="body2" className="py-6 text-center text-xs text-muted-foreground">
            {carregando ? "Carregando…" : "Nenhum SMS registrado ainda."}
          </Typography>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Destinatário</th>
                  <th className="py-2 pr-3 font-medium">Mensagem</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Segm.</th>
                  <th className="py-2 pr-3 font-medium">Tent.</th>
                  <th className="py-2 pr-3 font-medium">Criado</th>
                  <th className="py-2 pr-3 font-medium">Entrega</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {historico.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 font-mono">{d.recipient}</td>
                    <td className="max-w-[260px] truncate py-2 pr-3 text-muted-foreground"
                      title={(d as { payload?: { text?: string } }).payload?.text ?? d.subject}>
                      {d.templateCode ?? d.subject}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill
                        status={d.status === "DELIVERED" || d.status === "SENT" ? "ativo"
                          : d.status === "DEAD" || d.status === "EXPIRED" ? "cancelado"
                          : d.status === "FAILED" || d.status === "UNKNOWN" ? "urgente"
                          : d.status === "SUPPRESSED" ? "inativo" : "pendente"}
                        label={STATUS_ENTREGA[d.status] ?? d.status} />
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{d.segments ?? "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">{d.attempts}</td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {d.deliveredAt ? new Date(d.deliveredAt).toLocaleString("pt-BR")
                        : d.sentAt ? `aceito ${new Date(d.sentAt).toLocaleTimeString("pt-BR")}` : "—"}
                    </td>
                    <td className="py-2">
                      {(d.status === "FAILED" || d.status === "DEAD" || d.status === "UNKNOWN") && (
                        <Button size="small" variant="outlined"
                          title={d.status === "UNKNOWN"
                            ? "O provider pode já ter enviado — reprocessar assume risco de duplicidade"
                            : "Reenfileirar"}
                          onClick={() => void reprocessar(d.id)}>
                          <RefreshCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Configuração operacional — segredos ficam no ambiente, nunca aqui */}
      <FormDialog open={dialogConfig} onOpenChange={setDialogConfig}
        title="Infobip — configuração operacional"
        description="Remetente, limites e destinatários de teste. Credenciais (Base URL, API key, token DLR) vêm das variáveis INFOBIP_* do ambiente."
        submitLabel="Salvar" onSubmit={(e) => void salvarConfig(e)}>
        <FormField label="Remetente autorizado">
          <TextField size="small" fullWidth
            placeholder="Ex.: HWeld ou +5511…"
            value={form.sender}
            onChange={(e) => setForm((f) => ({ ...f, sender: e.target.value }))} />
        </FormField>
        <FormField label="Máx. segmentos por SMS">
          <TextField size="small" fullWidth type="number"
            slotProps={{ htmlInput: { min: 1, max: 10 } }}
            value={form.maxSegmentos}
            onChange={(e) => setForm((f) => ({ ...f, maxSegmentos: e.target.value }))} />
        </FormField>
        <FormField label="Destinatários de teste (E.164, separados por vírgula)" wide>
          <TextField size="small" fullWidth multiline minRows={2}
            placeholder="+5511998887766, +5511987654321"
            value={form.destinatarios}
            onChange={(e) => setForm((f) => ({ ...f, destinatarios: e.target.value }))} />
        </FormField>
      </FormDialog>

      {/* SMS de teste — destinatário explícito, preview e aviso de custo */}
      <FormDialog open={dialogSms} onOpenChange={setDialogSms}
        title="Enviar SMS de teste"
        description="O envio passa pela fila transacional e pode gerar custo na conta Infobip."
        submitLabel="Enviar SMS" onSubmit={(e) => void enviarSmsTeste(e)}>
        <FormField label="Destinatário (lista de testes)" wide>
          <TextField size="small" fullWidth select
            value={smsDestino}
            onChange={(e) => setSmsDestino(e.target.value)}
            slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">Selecione…</MenuItem>
            {(cfg?.destinatariosTeste ?? []).map((d) => (
              <MenuItem key={d} value={d}>{d}</MenuItem>
            ))}
          </TextField>
        </FormField>
        <FormField label="Prévia da mensagem" wide>
          <Box className="rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-xs text-muted-foreground">
            {PREVIEW_SMS_TESTE}
          </Box>
        </FormField>
        <div className="col-span-2 flex items-start gap-2 rounded-xl border border-[#B8891D]/40 bg-[#B8891D]/8 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B8891D]" />
          <div className="text-[11px] text-muted-foreground">
            Este é um envio real — pode gerar cobrança. Somente destinatários da lista de testes
            são aceitos; em contas trial, o destino também precisa estar verificado no Infobip.
          </div>
        </div>
        {enviandoSms && <Loader2 className="h-4 w-4 animate-spin" />}
      </FormDialog>
    </>
  );
}

function EstadoItem({ rotulo, ok, detalhe }: { rotulo: string; ok: boolean; detalhe: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5">
      {ok ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2E7D4F]" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B8891D]" />
      )}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">{rotulo}</div>
        <div className="truncate text-[11px] text-muted-foreground" title={detalhe}>{detalhe}</div>
      </div>
      {ok && <CheckCircle2 className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2E7D4F]" />}
    </div>
  );
}
