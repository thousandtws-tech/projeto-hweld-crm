import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Play,
  RefreshCcw,
  Send,
  Webhook,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { ApiError } from "@/lib/api";
import type { EntregaSms, EventoDlr, IntegracaoInfobip } from "@/lib/models";
import { integracoesService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

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

const inputSm = { size: "small" as const, fullWidth: true };

/** Painel da integração Infobip — abas Visão geral / Configurações /
 *  Eventos / Histórico. Credenciais write-only, webhook DLR com
 *  segredo no path, teste restrito à allowlist e reprocessamento. */
export function InfobipPainel({
  onView,
}: {
  onView?: (v: IntegracaoInfobip) => void;
}) {
  const [i, setI] = useState<IntegracaoInfobip | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [aba, setAba] = useState("geral");

  // Formulário (credenciais + canal) — salvo em uma única gravação
  const [fNome, setFNome] = useState("");
  const [fApiKey, setFApiKey] = useState("");
  const [limparKey, setLimparKey] = useState(false);
  const [fBaseUrl, setFBaseUrl] = useState("");
  const [fRemetente, setFRemetente] = useState("");
  const [fLimite, setFLimite] = useState("3");
  const [fDestinatarios, setFDestinatarios] = useState("");
  const [fPausado, setFPausado] = useState(false);
  const [fEventos, setFEventos] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  // Verificação / teste SMS
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ verificacao_status: string; mensagem?: string; nome_conta?: string } | null>(null);
  const [fTelefone, setFTelefone] = useState("");
  const [fTexto, setFTexto] = useState("");
  const [enviandoSms, setEnviandoSms] = useState(false);
  const [alternando, setAlternando] = useState(false);
  const [rotacionando, setRotacionando] = useState(false);

  // DLRs + histórico
  const [eventos, setEventos] = useState<EventoDlr[]>([]);
  const [historico, setHistorico] = useState<EntregaSms[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroPedido, setFiltroPedido] = useState("");

  const preencher = useCallback((v: IntegracaoInfobip) => {
    setI(v);
    onView?.(v);
    setFNome(v.nome_conta ?? "");
    setFBaseUrl(v.config?.base_url ?? "");
    setFRemetente(v.config?.remetente ?? "");
    setFLimite(String(v.config?.limite_segmentos ?? 3));
    setFPausado(v.config?.envio_pausado === true);
    setFEventos({ ...(v.config?.eventos ?? {}) });
    setFDestinatarios((v.config?.destinatarios_teste ?? []).join(", "));
    setFApiKey("");
    setLimparKey(false);
  }, [onView]);

  const carregar = useCallback(async () => {
    setConflito(false);
    try {
      preencher(await integracoesService.infobip());
      setFalha(false);
    } catch (err) {
      setFalha(true);
      toast.error(err instanceof Error ? err.message : "Falha ao carregar integração.");
    } finally {
      setCarregando(false);
    }
  }, [preencher]);

  const carregarEventos = useCallback(async () => {
    try {
      setEventos(await integracoesService.eventos());
    } catch {
      /* card secundário — não bloqueia a página */
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
    void carregarEventos();
  }, [carregar, carregarEventos]);

  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  const salvar = async () => {
    if (!i) return;
    setSalvando(true);
    try {
      const segredos: { api_key?: string } = {};
      if (limparKey) segredos.api_key = "";
      else if (fApiKey.trim()) segredos.api_key = fApiKey.trim();
      const destinatarios = fDestinatarios
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const limite = Number.parseInt(fLimite, 10);
      const nova = await integracoesService.salvar({
        versao: i.versao,
        nome_conta: fNome.trim(),
        config: {
          base_url: fBaseUrl.trim(),
          remetente: fRemetente.trim(),
          limite_segmentos: Number.isFinite(limite) ? limite : 3,
          envio_pausado: fPausado,
          eventos: fEventos,
          destinatarios_teste: destinatarios,
        },
        ...(Object.keys(segredos).length ? { segredos } : {}),
      });
      preencher(nova);
      toast.success("Configuração salva.");
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
      const r = await integracoesService.testarConexao();
      setTeste(r);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no teste de conexão.");
    } finally {
      setTestando(false);
    }
  };

  const enviarTeste = async () => {
    const digitos = fTelefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 15) {
      toast.error("Informe o telefone com DDI e DDD — 10 a 15 dígitos.");
      return;
    }
    setEnviandoSms(true);
    try {
      const r = await integracoesService.enviarSmsTeste(digitos, fTexto.trim() || undefined);
      toast.success(`SMS aceito — entrega ${r.id.slice(0, 8)}…`);
      setFTelefone("");
      setFTexto("");
      await carregarHistorico();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar SMS de teste.");
    } finally {
      setEnviandoSms(false);
    }
  };

  const alternarHabilitado = async () => {
    if (!i) return;
    setAlternando(true);
    try {
      const nova = await integracoesService.habilitar(!i.habilitado);
      preencher(nova);
      toast.success(nova.habilitado ? "Integração habilitada." : "Integração desabilitada — configuração mantida.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar habilitação.");
    } finally {
      setAlternando(false);
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

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("URL copiada.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const rotacionar = async () => {
    if (!window.confirm(
      "Gerar novo segredo do webhook DLR? A URL atual deixa de aceitar relatórios " +
      "na hora — cadastre a URL nova no painel Infobip em seguida.")) return;
    setRotacionando(true);
    try {
      preencher(await integracoesService.rotacionarSegredo());
      toast.success("Segredo girado — copie a URL nova e atualize no painel Infobip.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao girar o segredo.");
    } finally {
      setRotacionando(false);
    }
  };

  if (carregando) {
    return (
      <SectionCard>
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando integração…
        </div>
      </SectionCard>
    );
  }

  if (falha || !i) {
    return (
      <SectionCard>
        <div className="py-8 text-center">
          <Typography variant="body2" className="text-xs text-muted-foreground">
            Não foi possível carregar esta integração.
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
            Outro administrador alterou esta integração. Recarregue para ver a versão atual antes
            de salvar.
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
          {i.provider_ativo === "log" && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                Provider efetivo: <strong>log</strong> — enquanto as credenciais não estiverem
                completas, os envios são simulados em log (sem custo, sem SMS real).
              </span>
            </div>
          )}

          {/* Webhook DLR */}
          <SectionCard className="mb-4">
            <Typography variant="h6" component="h3" className="flex items-center gap-2 text-sm font-semibold">
              <Webhook className="h-4 w-4 text-muted-foreground" /> Relatórios de entrega (DLR)
            </Typography>
            <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
              Cadastre esta URL no painel Infobip (notification profiles → delivery reports) para a
              confirmação de entrega fechar o ciclo na fila de envio.
            </Typography>
            {i.config?.callback_url ? (
              <div className="flex gap-2">
                <TextField {...inputSm} value={i.config.callback_url}
                  slotProps={{ input: { readOnly: true }, htmlInput: { className: "font-mono" } }} />
                <Button size="small" variant="outlined"
                  onClick={() => void copiar(i.config.callback_url ?? "")}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar
                </Button>
                <Button size="small" variant="outlined" color="warning"
                  disabled={rotacionando} onClick={() => void rotacionar()}>
                  {rotacionando
                    ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    : <KeyRound className="mr-1 h-4 w-4" />}
                  Girar segredo
                </Button>
              </div>
            ) : (
              <Typography variant="body2" className="text-xs text-muted-foreground">
                A URL aparece após salvar — o segredo do path é gerado na primeira gravação.
                {!i.segredos.campos.webhook_secret ? "" : " (APP_PUBLIC_URL ausente no servidor)"}
              </Typography>
            )}
          </SectionCard>

          {/* Operação */}
          <SectionCard>
            <Typography variant="h6" component="h3" className="mb-3 text-sm font-semibold">
              Operação
            </Typography>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <div>
                <div className="text-xs font-semibold text-foreground">Integração habilitada</div>
                <div className="text-[11px] text-muted-foreground">
                  Quando desabilitada, nenhum SMS sai — configuração e credenciais são mantidas.
                </div>
              </div>
              <Switch size="small" checked={i.habilitado} disabled={alternando}
                onChange={() => void alternarHabilitado()} />
            </div>
          </SectionCard>
        </>
      )}

      {aba === "config" && (
        <>
          {/* Credenciais */}
          <SectionCard className="mb-4">
            <Typography variant="h6" component="h3" className="text-sm font-semibold">
              Credenciais
            </Typography>
            <Typography variant="body2" className="mb-4 text-xs text-muted-foreground">
              API key da conta Infobip (Settings → API keys, escopo SMS). Campo em branco mantém o
              valor atual; "Limpar" remove ao salvar.
            </Typography>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Nome da conexão</div>
                <TextField {...inputSm} placeholder="Ex.: SMS da loja"
                  value={fNome} onChange={(e) => setFNome(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
                  API key *
                  {i.segredos.campos.api_key && (
                    <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurado</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <TextField {...inputSm} type="password" autoComplete="new-password"
                    placeholder={limparKey ? "Será removida ao salvar"
                      : i.segredos.campos.api_key ? "Deixe em branco para manter" : "App key da conta"}
                    value={fApiKey} disabled={limparKey}
                    onChange={(e) => setFApiKey(e.target.value)} />
                  {i.segredos.campos.api_key && (
                    <Button size="small" variant="outlined" color={limparKey ? "inherit" : "error"}
                      onClick={() => setLimparKey((v) => !v)}>
                      {limparKey ? "Desfazer" : "Limpar"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
                Segredo do webhook
                {i.segredos.campos.webhook_secret && (
                  <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurado</span>
                )}
              </div>
              <TextField {...inputSm}
                value={i.segredos.campos.webhook_secret
                  ? "Gerado automaticamente pelo servidor"
                  : "Será gerado automaticamente ao salvar"}
                slotProps={{ input: { readOnly: true } }} />
              <div className="mt-1 text-[11px] text-muted-foreground">
                Autentica os relatórios de entrega (DLR) na URL pública — gerado pelo servidor.
              </div>
            </div>
          </SectionCard>

          {/* Configuração do canal */}
          <SectionCard className="mb-4">
            <Typography variant="h6" component="h3" className="text-sm font-semibold">
              Configuração do canal
            </Typography>
            <Typography variant="body2" className="mb-4 text-xs text-muted-foreground">
              Endpoint da conta e remetente autorizado — cobrados por segmento (160 chars GSM-7, 70
              com acentos/emoji).
            </Typography>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="mb-1 text-xs font-medium text-foreground">Base URL *</div>
                <TextField {...inputSm} placeholder="https://xxxxxx.api.infobip.com"
                  value={fBaseUrl} onChange={(e) => setFBaseUrl(e.target.value)}
                  slotProps={{ htmlInput: { className: "font-mono" } }} />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Host oficial da conta — visível no painel Infobip → API keys. HTTPS obrigatório.
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Remetente *</div>
                <TextField {...inputSm} placeholder="HWeld ou +55…"
                  value={fRemetente} onChange={(e) => setFRemetente(e.target.value)} />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Alfanumérico (até 11) ou número aprovado na conta.
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Limite de segmentos</div>
                <TextField {...inputSm} placeholder="3" value={fLimite}
                  onChange={(e) => setFLimite(e.target.value)}
                  slotProps={{ htmlInput: { inputMode: "numeric" } }} />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  1–10 — mensagens maiores são recusadas antes do envio.
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-xs font-medium text-foreground">
                  Destinatários de teste <span className="font-normal text-muted-foreground">(opcional)</span>
                </div>
                <TextField {...inputSm} placeholder="+55 41 99999-0000, +55 41 98888-1111"
                  value={fDestinatarios} onChange={(e) => setFDestinatarios(e.target.value)} />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Separados por vírgula — quando preenchida, o SMS de teste só sai para estes números.
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-foreground">Eventos com SMS</div>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {EVENTOS_SMS.map((ev) => (
                  <div key={ev.tipo}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50">
                    <span className="font-medium text-foreground">{ev.rotulo}</span>
                    <Switch size="small" checked={Boolean(fEventos[ev.tipo])}
                      onChange={(e) => setFEventos((m) => ({ ...m, [ev.tipo]: e.target.checked }))} />
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Avisos saem por SMS apenas com o toggle ligado — e-mail não é afetado.
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <div>
                <div className="text-xs font-semibold text-foreground">Pausar envios</div>
                <div className="text-[11px] text-muted-foreground">
                  Congela o canal sem desligar a integração — itens aguardam na fila.
                </div>
              </div>
              <Switch size="small" checked={fPausado}
                onChange={(e) => setFPausado(e.target.checked)} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="contained" size="small" disabled={salvando}
                onClick={() => void salvar()}>
                {salvando ? "Salvando…" : "Salvar configuração"}
              </Button>
              <div className="flex-1" />
              <span className="text-[11px] text-muted-foreground">
                {i.ultima_verificacao_em
                  ? `Última verificação: ${new Date(i.ultima_verificacao_em).toLocaleString("pt-BR")} — ${i.verificacao_status === "ok" ? "ok" : "falhou"}`
                  : "Nunca verificada."}
              </span>
              <Button variant="outlined" size="small" disabled={testando}
                onClick={() => void testar()}>
                {testando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                Testar conexão
              </Button>
            </div>

            {i.verificacao_status === "falha" && i.verificacao_erro && (
              <div className="mt-2 text-[11px] text-destructive">{i.verificacao_erro}</div>
            )}

            {teste && (
              <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                teste.verificacao_status === "ok"
                  ? "border-[#2E7D4F]/40 bg-[#2E7D4F]/8 text-foreground"
                  : "border-destructive/40 bg-destructive/8 text-foreground"}`}
                role="status">
                {teste.verificacao_status === "ok"
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E7D4F]" />
                  : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                <span>
                  {teste.verificacao_status === "ok"
                    ? `Conexão verificada${teste.nome_conta ? ` — ${teste.nome_conta}` : ""}.`
                    : `Falha na verificação${teste.mensagem ? ` — ${teste.mensagem}` : ""}.`}
                </span>
              </div>
            )}
          </SectionCard>

          {/* SMS de teste */}
          <SectionCard>
            <Typography variant="h6" component="h3" className="text-sm font-semibold">
              SMS de teste
            </Typography>
            <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
              Envio único pela fila transacional — restrito aos destinatários da lista quando ela
              está preenchida. Pode gerar custo na conta Infobip.
            </Typography>
            <div className="grid items-end gap-3 sm:grid-cols-[220px_1fr_auto]">
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Telefone</div>
                <TextField {...inputSm} placeholder="+55 41 99999-0000"
                  slotProps={{ htmlInput: { inputMode: "tel" } }}
                  value={fTelefone} onChange={(e) => setFTelefone(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">
                  Mensagem <span className="font-normal text-muted-foreground">(opcional)</span>
                </div>
                <TextField {...inputSm} placeholder="Usa o texto padrão se vazio"
                  value={fTexto} onChange={(e) => setFTexto(e.target.value)} />
              </div>
              <Button variant="contained" size="small"
                disabled={enviandoSms || fTelefone.replace(/\D/g, "").length === 0}
                onClick={() => void enviarTeste()}>
                {enviandoSms
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <Send className="mr-1.5 h-4 w-4" />}
                {enviandoSms ? "Enviando…" : "Enviar SMS"}
              </Button>
            </div>
          </SectionCard>
        </>
      )}

      {aba === "eventos" && (
        <SectionCard>
          <Typography variant="h6" component="h3" className="text-sm font-semibold">
            Eventos de webhook
          </Typography>
          <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
            Últimos relatórios de entrega recebidos.
          </Typography>
          {eventos.length === 0 ? (
            <Typography variant="body2" className="py-4 text-xs text-muted-foreground">
              Nenhum DLR recebido ainda — depois de cadastrar a URL no painel Infobip, os
              relatórios aparecem aqui.
            </Typography>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Evento</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Recebido em</th>
                    <th className="py-2 font-medium">Último erro</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr key={e.event_id + e.recebido_em} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium">Relatório de entrega</div>
                        <div className="max-w-[220px] truncate font-mono text-[10px] text-muted-foreground">
                          {e.event_id}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill
                          status={/deliver/i.test(e.status) ? "ativo"
                            : /reject|fail|expired|undeliverable/i.test(e.status) ? "cancelado"
                            : "pendente"}
                          label={e.status} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {e.recebido_em ? new Date(e.recebido_em).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {e.ultimo_erro
                          ? <span className="text-destructive">{e.ultimo_erro}</span>
                          : <span>—</span>}
                      </td>
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Typography variant="h6" component="h2" className="text-sm font-semibold">
              Histórico de envios SMS
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
              Nenhum SMS registrado ainda.
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
                        title={d.subject}>
                        {d.templateCode ?? d.subject}
                      </td>
                      <td className="py-2 pr-3" title={d.lastError ?? undefined}>
                        <StatusPill
                          status={d.status === "DELIVERED" || d.status === "SENT" ? "ativo"
                            : d.status === "DEAD" || d.status === "EXPIRED" ? "cancelado"
                            : d.status === "FAILED" || d.status === "UNKNOWN" ? "urgente"
                            : d.status === "SUPPRESSED" ? "inativo" : "pendente"}
                          label={STATUS_ENTREGA[d.status] ?? d.status} />
                        {d.lastError ? (
                          <p className="mt-0.5 max-w-[220px] truncate text-[10px] leading-tight text-muted-foreground">
                            {d.lastError}
                          </p>
                        ) : null}
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
      )}
    </>
  );
}
