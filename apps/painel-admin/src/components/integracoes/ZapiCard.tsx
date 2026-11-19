import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  History,
  Loader2,
  Play,
  QrCode,
  RefreshCcw,
  Send,
  Webhook,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { ApiError } from "@/lib/api";
import type { EntregaSms, EventoZapi, IntegracaoZapi } from "@/lib/models";
import { zapiService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

const EVENTOS_WA: { tipo: string; rotulo: string }[] = [
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
  UNKNOWN: "Sem confirmação",
  DEAD: "Falha definitiva",
};

const inputSm = { size: "small" as const, fullWidth: true };

/** Painel Z-API WhatsApp — abas Visão geral / Configurações / Eventos /
 *  Histórico. Credenciais write-only, QR de conexão, webhooks
 *  auto-configurados e histórico canal WHATSAPP. */
export function ZapiCard({
  onView,
}: {
  onView?: (v: IntegracaoZapi) => void;
}) {
  const [i, setI] = useState<IntegracaoZapi | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [aba, setAba] = useState("geral");

  const [fNome, setFNome] = useState("");
  const [fInstanceId, setFInstanceId] = useState("");
  const [fToken, setFToken] = useState("");
  const [fClientToken, setFClientToken] = useState("");
  const [fDestinatarios, setFDestinatarios] = useState("");
  const [fPausado, setFPausado] = useState(false);
  const [fEventos, setFEventos] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ verificacao_status: string; mensagem?: string } | null>(null);
  const [fTelefone, setFTelefone] = useState("");
  const [fTexto, setFTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [alternando, setAlternando] = useState(false);

  const [qr, setQr] = useState<string | null>(null);
  const [qrErro, setQrErro] = useState<string | null>(null);
  const [carregandoQr, setCarregandoQr] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  const [eventos, setEventos] = useState<EventoZapi[]>([]);
  const [historico, setHistorico] = useState<EntregaSms[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");

  const preencher = useCallback((v: IntegracaoZapi) => {
    setI(v);
    onView?.(v);
    setFNome(v.nome_conta ?? "");
    setFInstanceId(v.config?.instance_id ?? "");
    setFPausado(v.config?.envio_pausado === true);
    setFEventos({ ...(v.config?.eventos ?? {}) });
    setFDestinatarios((v.config?.destinatarios_teste ?? []).join(", "));
    setFToken("");
    setFClientToken("");
  }, [onView]);

  const carregar = useCallback(async () => {
    setConflito(false);
    try {
      preencher(await zapiService.view());
      setFalha(false);
    } catch (err) {
      setFalha(true);
      toast.error(err instanceof Error ? err.message : "Falha ao carregar integração Z-API.");
    } finally {
      setCarregando(false);
    }
  }, [preencher]);

  const carregarEventos = useCallback(async () => {
    try {
      setEventos(await zapiService.eventos());
    } catch { /* card secundário */ }
  }, []);

  const carregarHistorico = useCallback(async () => {
    try {
      const f: Record<string, string> = { porPagina: "50" };
      if (filtroStatus) f.status = filtroStatus;
      setHistorico((await zapiService.historico(f)).content);
    } catch { /* não bloqueia */ }
  }, [filtroStatus]);

  useEffect(() => {
    void carregar();
    void carregarEventos();
    void carregarHistorico();
  }, [carregar, carregarEventos, carregarHistorico]);

  const salvar = async () => {
    if (!i) return;
    setSalvando(true);
    try {
      const segredos: { instance_token?: string; client_token?: string } = {};
      if (fToken.trim()) segredos.instance_token = fToken.trim();
      if (fClientToken.trim()) segredos.client_token = fClientToken.trim();
      const nova = await zapiService.salvar({
        versao: i.versao,
        nome_conta: fNome.trim(),
        config: {
          instance_id: fInstanceId.trim(),
          envio_pausado: fPausado,
          eventos: fEventos,
          destinatarios_teste: fDestinatarios.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
        },
        ...(Object.keys(segredos).length ? { segredos } : {}),
      });
      preencher(nova);
      toast.success("Configuração salva — webhooks registrados na instância.");
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
      setTeste(await zapiService.testarConexao());
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no teste de conexão.");
    } finally {
      setTestando(false);
    }
  };

  const verQr = async () => {
    setCarregandoQr(true);
    setQrErro(null);
    try {
      const r = await zapiService.qrcode();
      if (r.imagem) setQr(r.imagem);
      else setQrErro(r.erro ?? "QR indisponível.");
    } catch (err) {
      setQrErro(err instanceof Error ? err.message : "Falha ao obter QR Code.");
    } finally {
      setCarregandoQr(false);
    }
  };

  const desconectar = async () => {
    setDesconectando(true);
    try {
      preencher(await zapiService.desconectar());
      setQr(null);
      toast.success("Instância desconectada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desconectar.");
    } finally {
      setDesconectando(false);
    }
  };

  const enviarTeste = async () => {
    const digitos = fTelefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 15) {
      toast.error("Informe o telefone com DDI e DDD — 10 a 15 dígitos.");
      return;
    }
    setEnviando(true);
    try {
      const r = await zapiService.mensagemTeste(digitos, fTexto.trim() || undefined);
      toast.success(`Mensagem aceita — entrega ${r.id.slice(0, 8)}…`);
      setFTelefone("");
      setFTexto("");
      await carregarHistorico();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
    } finally {
      setEnviando(false);
    }
  };

  const alternarHabilitado = async () => {
    if (!i) return;
    setAlternando(true);
    try {
      const nova = await zapiService.habilitar(!i.habilitado);
      preencher(nova);
      toast.success(nova.habilitado ? "Integração habilitada." : "Integração desabilitada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar habilitação.");
    } finally {
      setAlternando(false);
    }
  };

  const reprocessar = async (id: string) => {
    try {
      await zapiService.reprocessar(id);
      toast.success("Entrega reenfileirada — pode haver duplicidade se já foi enviada.");
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

  if (carregando) {
    return (
      <SectionCard>
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando integração Z-API…
        </div>
      </SectionCard>
    );
  }

  if (falha || !i) {
    return (
      <SectionCard>
        <div className="py-8 text-center">
          <Typography variant="body2" className="text-xs text-muted-foreground">
            Não foi possível carregar a integração Z-API.
          </Typography>
          <Button variant="outlined" size="small" className="mt-3" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </div>
      </SectionCard>
    );
  }

  const conectado = i.conexao?.conectado === true && i.conexao?.smartphone === true;

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

      {i.conexao?.consultado === true && aba === "geral" && (
        <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2 ${
          conectado ? "border-[#2E7D4F]/40 bg-[#2E7D4F]/8" : "border-border bg-secondary/50"}`}>
          {conectado
            ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2E7D4F]" />
            : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="text-[11px] text-muted-foreground">
            {conectado
              ? <>Número conectado ao WhatsApp{i.conexao.sessao ? ` — sessão ${i.conexao.sessao}` : ""}.</>
              : "Instância criada, mas o número ainda não está conectado — escaneie o QR Code abaixo."}
          </span>
        </div>
      )}

      {/* Credenciais */}
      {aba === "config" && (
      <SectionCard>
        <Typography variant="h6" component="h3" className="text-sm font-semibold">
          Credenciais da instância
        </Typography>
        <Typography variant="body2" className="mb-4 text-xs text-muted-foreground">
          Painel Z-API → sua instância: ID, Token e Client-Token da conta. Tokens são
          write-only — campo em branco mantém o valor atual.
        </Typography>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-foreground">Nome da conexão</div>
            <TextField {...inputSm} placeholder="Ex.: WhatsApp da loja"
              value={fNome} onChange={(e) => setFNome(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-foreground">Instance ID *</div>
            <TextField {...inputSm} placeholder="3C4F5E…" value={fInstanceId}
              onChange={(e) => setFInstanceId(e.target.value)}
              slotProps={{ htmlInput: { className: "font-mono" } }} />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
              Token da instância *
              {i.segredos.campos.instance_token && (
                <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurado</span>
              )}
            </div>
            <TextField {...inputSm} type="password" autoComplete="new-password"
              placeholder={i.segredos.campos.instance_token ? "Deixe em branco para manter" : "Token da instância"}
              value={fToken} onChange={(e) => setFToken(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
              Client-Token (conta) *
              {i.segredos.campos.client_token && (
                <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurado</span>
              )}
            </div>
            <TextField {...inputSm} type="password" autoComplete="new-password"
              placeholder={i.segredos.campos.client_token ? "Deixe em branco para manter" : "Client-Token da conta"}
              value={fClientToken} onChange={(e) => setFClientToken(e.target.value)} />
          </div>
        </div>
      </SectionCard>
      )}

      {/* Conexão WhatsApp */}
      {aba === "geral" && (
      <SectionCard className="mb-4">
        <Typography variant="h6" component="h3" className="text-sm font-semibold">
          Conexão do número
        </Typography>
        <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
          Escaneie o QR Code com o WhatsApp do número que vai enviar as mensagens —
          igual ao WhatsApp Web.
        </Typography>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outlined" size="small" disabled={carregandoQr || !i.segredos.campos.instance_token}
            onClick={() => void verQr()}>
            {carregandoQr ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <QrCode className="mr-1.5 h-4 w-4" />}
            {qr ? "Atualizar QR" : "Mostrar QR Code"}
          </Button>
          {conectado && (
            <Button variant="outlined" size="small" color="error" disabled={desconectando}
              onClick={() => void desconectar()}>
              {desconectando ? "Desconectando…" : "Desconectar número"}
            </Button>
          )}
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

        {qrErro && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/8 px-3 py-2.5 text-xs" role="alert">
            <XCircle className="h-4 w-4 shrink-0 text-destructive" /> {qrErro}
          </div>
        )}
        {qr && (
          <div className="mt-4 flex justify-center rounded-xl border border-border bg-white p-4">
            <img src={qr} alt="QR Code para conectar o WhatsApp" className="h-56 w-56" />
          </div>
        )}

        {i.verificacao_status === "falha" && i.verificacao_erro && (
          <div className="mt-2 text-[11px] text-destructive">{i.verificacao_erro}</div>
        )}
        {teste && (
          <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
            teste.verificacao_status === "ok"
              ? "border-[#2E7D4F]/40 bg-[#2E7D4F]/8"
              : "border-destructive/40 bg-destructive/8"}`}
            role="status">
            {teste.verificacao_status === "ok"
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E7D4F]" />
              : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
            <span>{teste.mensagem ?? (teste.verificacao_status === "ok" ? "Conexão verificada." : "Falha na verificação.")}</span>
          </div>
        )}
      </SectionCard>
      )}

      {/* Webhooks */}
      {aba === "geral" && (
      <SectionCard className="mb-4">
        <Typography variant="h6" component="h3" className="flex items-center gap-2 text-sm font-semibold">
          <Webhook className="h-4 w-4 text-muted-foreground" /> Webhooks da instância
        </Typography>
        <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
          Registrados automaticamente ao salvar — mensagens recebidas, entregas e quedas de
          conexão chegam aqui. O segredo no path autentica cada chamada.
        </Typography>
        {i.config?.webhook_received ? (
          <div className="grid gap-2">
            {([["Recebimento", i.config.webhook_received],
               ["Entrega", i.config.webhook_delivery],
               ["Desconexão", i.config.webhook_disconnected]] as const).map(([rotulo, url]) => (
              <div key={rotulo} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">{rotulo}</span>
                <TextField {...inputSm} value={url}
                  slotProps={{ input: { readOnly: true }, htmlInput: { className: "font-mono" } }} />
                <Button size="small" variant="outlined" onClick={() => void copiar(url ?? "")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Typography variant="body2" className="text-xs text-muted-foreground">
            As URLs aparecem após a primeira gravação — o segredo do path é gerado no servidor.
          </Typography>
        )}
      </SectionCard>
      )}

      {/* Configuração operacional */}
      {aba === "config" && (
      <SectionCard className="mb-4">
        <Typography variant="h6" component="h3" className="text-sm font-semibold">
          Configuração do canal
        </Typography>

        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-foreground">
            Destinatários de teste <span className="font-normal text-muted-foreground">(opcional)</span>
          </div>
          <TextField {...inputSm} placeholder="+55 41 99999-0000, +55 41 98888-1111"
            value={fDestinatarios} onChange={(e) => setFDestinatarios(e.target.value)} />
          <div className="mt-1 text-[11px] text-muted-foreground">
            Separados por vírgula — quando preenchida, a mensagem de teste só sai para estes números.
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-foreground">Eventos com WhatsApp</div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {EVENTOS_WA.map((ev) => (
              <div key={ev.tipo}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50">
                <span className="font-medium text-foreground">{ev.rotulo}</span>
                <Switch size="small" checked={Boolean(fEventos[ev.tipo])}
                  onChange={(e) => setFEventos((m) => ({ ...m, [ev.tipo]: e.target.checked }))} />
              </div>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Avisos saem por WhatsApp apenas com o toggle ligado — e-mail e SMS não são afetados.
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
        </div>
      </SectionCard>
      )}

      {/* Mensagem de teste */}
      {aba === "config" && (
      <SectionCard className="mb-4">
        <Typography variant="h6" component="h3" className="text-sm font-semibold">
          Mensagem de teste
        </Typography>
        <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
          Envio único pela fila transacional — restrito à lista de teste quando preenchida.
          Requer o número conectado.
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
            disabled={enviando || fTelefone.replace(/\D/g, "").length === 0}
            onClick={() => void enviarTeste()}>
            {enviando
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <Send className="mr-1.5 h-4 w-4" />}
            {enviando ? "Enviando…" : "Enviar mensagem"}
          </Button>
        </div>
      </SectionCard>
      )}

      {/* Operação */}
      {aba === "geral" && (
      <SectionCard>
        <Typography variant="h6" component="h3" className="mb-3 text-sm font-semibold">
          Operação
        </Typography>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
          <div>
            <div className="text-xs font-semibold text-foreground">Integração habilitada</div>
            <div className="text-[11px] text-muted-foreground">
              Quando desabilitada, nenhum WhatsApp sai — configuração e credenciais são mantidas.
            </div>
          </div>
          <Switch size="small" checked={i.habilitado} disabled={alternando}
            onChange={() => void alternarHabilitado()} />
        </div>
      </SectionCard>
      )}

      {/* Eventos de webhook */}
      {aba === "eventos" && (
      <SectionCard>
        <Typography variant="h6" component="h3" className="text-sm font-semibold">
          Eventos de webhook
        </Typography>
        <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
          Últimas mensagens e callbacks recebidos da instância.
        </Typography>
        {eventos.length === 0 ? (
          <Typography variant="body2" className="py-4 text-xs text-muted-foreground">
            Nenhum evento recebido ainda — após salvar, mensagens para o número conectado
            aparecem aqui.
          </Typography>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Telefone</th>
                  <th className="py-2 pr-3 font-medium">Conteúdo</th>
                  <th className="py-2 font-medium">Recebido em</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3">
                      <StatusPill
                        status={e.direcao === "in" ? "ativo" : e.direcao === "sys" ? "inativo" : "pendente"}
                        label={e.tipo.replace("Callback", "")} />
                    </td>
                    <td className="py-2 pr-3 font-mono">{e.telefone || "—"}</td>
                    <td className="max-w-[280px] truncate py-2 pr-3 text-muted-foreground" title={e.conteudo}>
                      {e.conteudo || "—"}
                    </td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {e.recebido_em ? new Date(e.recebido_em).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      )}

      {/* Histórico */}
      {aba === "historico" && (
      <SectionCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Typography variant="h6" component="h2" className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" /> Histórico de envios WhatsApp
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
            <Button variant="outlined" size="small" onClick={() => void carregarHistorico()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {historico.length === 0 ? (
          <Typography variant="body2" className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma mensagem WhatsApp registrada ainda.
          </Typography>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Destinatário</th>
                  <th className="py-2 pr-3 font-medium">Mensagem</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
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
                        <Button size="small" variant="outlined" title="Reenfileirar"
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
