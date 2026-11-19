import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  QrCode,
  RefreshCcw,
  Webhook,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { SectionCard } from "@/components/ui-kit/primitives";
import { ApiError } from "@/lib/api";
import type {
  EventoMercadoPago,
  IntegracaoMercadoPago,
  TransacaoMercadoPago,
} from "@/lib/models";
import { mercadoPagoService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

const inputSm = { size: "small" as const, fullWidth: true };

/** Painel Mercado Pago — abas Visão geral / Configurações / Eventos / Transações.
 *  Access Token write-only (TEST-/APP_USR- por ambiente), segredo de webhook
 *  HMAC write-only, Checkout Pro para cartão e histórico de cobranças. */
export function MercadoPagoPainel({
  onView,
}: {
  onView?: (v: IntegracaoMercadoPago) => void;
}) {
  const [i, setI] = useState<IntegracaoMercadoPago | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [aba, setAba] = useState("geral");

  const [fNome, setFNome] = useState("");
  const [fAmbiente, setFAmbiente] = useState("teste");
  const [fToken, setFToken] = useState("");
  const [fSegredo, setFSegredo] = useState("");
  const [fParcelas, setFParcelas] = useState("12");
  const [fPausada, setFPausada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ verificacao_status: string; mensagem?: string } | null>(null);
  const [alternando, setAlternando] = useState(false);

  const [eventos, setEventos] = useState<EventoMercadoPago[]>([]);
  const [transacoes, setTransacoes] = useState<TransacaoMercadoPago[]>([]);

  const preencher = useCallback((v: IntegracaoMercadoPago) => {
    setI(v);
    onView?.(v);
    setFNome(v.nome_conta ?? "");
    setFAmbiente(v.config?.ambiente === "producao" ? "producao" : "teste");
    setFParcelas(String(v.config?.parcelas_max ?? 12));
    setFPausada(v.config?.cobrancas_pausadas === true);
    setFToken("");
    setFSegredo("");
  }, [onView]);

  const carregar = useCallback(async () => {
    setConflito(false);
    try {
      preencher(await mercadoPagoService.view());
      setFalha(false);
    } catch (err) {
      setFalha(true);
      toast.error(err instanceof Error ? err.message : "Falha ao carregar integração.");
    } finally {
      setCarregando(false);
    }
  }, [preencher]);

  const carregarHistorico = useCallback(async () => {
    try {
      const [ev, tx] = await Promise.allSettled([
        mercadoPagoService.eventos(),
        mercadoPagoService.transacoes(0, 20),
      ]);
      if (ev.status === "fulfilled") setEventos(ev.value);
      if (tx.status === "fulfilled") setTransacoes(tx.value.itens);
    } catch { /* abas secundárias — não bloqueiam */ }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarHistorico();
  }, [carregar, carregarHistorico]);

  const salvar = async () => {
    if (!i) return;
    setSalvando(true);
    try {
      const segredos: { token?: string; webhook_secret?: string } = {};
      if (fToken.trim()) segredos.token = fToken.trim();
      if (fSegredo.trim()) segredos.webhook_secret = fSegredo.trim();
      const nova = await mercadoPagoService.salvar({
        versao: i.versao,
        nome_conta: fNome.trim(),
        config: {
          ambiente: fAmbiente,
          parcelas_max: Math.max(1, Math.min(24, Number(fParcelas) || 12)),
          cobrancas_pausadas: fPausada,
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
      setTeste(await mercadoPagoService.testarConexao());
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
      const nova = await mercadoPagoService.habilitar(!i.habilitado);
      preencher(nova);
      toast.success(nova.habilitado ? "Cobranças habilitadas." : "Cobranças desabilitadas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar habilitação.");
    } finally {
      setAlternando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const fmtData = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
  };

  const fmtValor = (v: string, moeda: string) => {
    const n = Number(v);
    return Number.isNaN(n)
      ? v
      : n.toLocaleString("pt-BR", { style: "currency", currency: moeda || "BRL" });
  };

  const rotuloStatus = (s: string) => {
    switch (s) {
      case "PENDING": return "Pendente";
      case "PROCESSING": return "Em análise";
      case "CONFIRMED": return "Confirmado";
      case "FAILED": return "Recusado";
      case "CANCELLED": return "Cancelado";
      case "REFUNDED": return "Estornado";
      case "EXPIRED": return "Expirado";
      default: return s;
    }
  };

  if (carregando) {
    return (
      <SectionCard>
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando integração Mercado Pago…
        </div>
      </SectionCard>
    );
  }

  if (falha || !i) {
    return (
      <SectionCard>
        <div className="py-8 text-center">
          <Typography variant="body2" className="text-xs text-muted-foreground">
            Não foi possível carregar a integração Mercado Pago.
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
        <Tab value="eventos" label="Eventos" />
        <Tab value="transacoes" label="Transações" />
      </Tabs>

      {aba === "geral" && (
        <SectionCard>
          <Typography variant="h6" component="h3" className="text-sm font-semibold">
            Operação
          </Typography>
          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ambiente</div>
              <div className="mt-0.5 font-medium text-foreground">
                {i.config?.ambiente === "producao" ? "Produção" : "Teste (usuário de teste)"}
              </div>
            </div>
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Conta</div>
              <div className="mt-0.5 font-medium text-foreground">{i.nome_conta || "—"}</div>
            </div>
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Meios ativos</div>
              <div className="mt-0.5 font-medium text-foreground">Pix · Cartão</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Cartão via Checkout Pro hospedado no Mercado Pago — dados do
                cartão nunca passam pelo sistema. Boleto e assinaturas entram
                nas próximas fases.
              </div>
            </div>
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Última verificação</div>
              <div className="mt-0.5 font-medium text-foreground">
                {i.verificacao_status === "ok" ? "Conexão OK"
                  : i.verificacao_status === "falha" ? "Falha"
                  : "Nunca testada"}
              </div>
              {i.ultima_verificacao_em && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {fmtData(i.ultima_verificacao_em)}
                </div>
              )}
              {i.verificacao_status === "falha" && i.verificacao_erro && (
                <div className="mt-1 text-[11px] text-[#B3261E]">{i.verificacao_erro}</div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <div className="text-xs font-medium text-foreground">Cobranças habilitadas</div>
              <div className="text-[11px] text-muted-foreground">
                Desligar interrompe novas cobranças — cobranças já criadas seguem reconciliáveis.
              </div>
            </div>
            <Switch checked={i.habilitado} disabled={alternando}
              onChange={() => void alternarHabilitado()} />
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-3.5 py-3">
            <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <Typography variant="body2" className="text-[11px] leading-relaxed text-muted-foreground">
              <strong>Confirmação de pagamento:</strong> o Mercado Pago assina cada
              notificação (HMAC-SHA256) — configure o segredo gerado no painel MP
              em Suas integrações → Webhooks
              {i.config?.webhook_url ? ` para a URL ${i.config.webhook_url}` : ""}.
              O estado vem sempre da consulta ao pagamento real, nunca do payload.
            </Typography>
          </div>
        </SectionCard>
      )}

      {aba === "config" && (
        <SectionCard>
          <Typography variant="h6" component="h3" className="text-sm font-semibold">
            Credenciais da conta
          </Typography>
          <Typography variant="body2" className="mb-4 text-xs text-muted-foreground">
            Painel Mercado Pago Developers → Suas integrações → Credenciais.
            Ambiente de <strong>teste</strong> usa token com prefixo <code>TEST-</code>;
            <strong> produção</strong> usa <code>APP_USR-</code> — os tokens são
            diferentes e não funcionam trocados. Campos em branco mantêm os valores atuais.
          </Typography>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Nome da conexão</div>
              <TextField {...inputSm} placeholder="Ex.: Mercado Pago HWeld"
                value={fNome} onChange={(e) => setFNome(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Ambiente *</div>
              <TextField {...inputSm} select value={fAmbiente}
                onChange={(e) => setFAmbiente(e.target.value)}>
                <MenuItem value="teste">Teste (token TEST-)</MenuItem>
                <MenuItem value="producao">Produção (token APP_USR-)</MenuItem>
              </TextField>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
                Access Token (Bearer) *
                {i.segredos.campos.token && (
                  <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurado</span>
                )}
              </div>
              <TextField {...inputSm} type="password" autoComplete="new-password"
                placeholder={i.segredos.campos.token
                  ? "Deixe em branco para manter" : "TEST-… ou APP_USR-…"}
                value={fToken} onChange={(e) => setFToken(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-foreground">
                Segredo de assinatura do webhook
                {i.segredos.campos.webhook_secret && (
                  <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurado</span>
                )}
              </div>
              <TextField {...inputSm} type="password" autoComplete="new-password"
                placeholder={i.segredos.campos.webhook_secret
                  ? "Deixe em branco para manter" : "Gerado no painel MP → Webhooks → Assinatura"}
                value={fSegredo} onChange={(e) => setFSegredo(e.target.value)} />
              <Typography variant="body2" className="mt-1 text-[11px] text-muted-foreground">
                Sem ele, os webhooks do Mercado Pago são rejeitados — recomendado
                sempre que a URL de webhook estiver cadastrada no painel MP.
              </Typography>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Parcelas máximas (cartão)</div>
              <TextField {...inputSm} type="number" inputProps={{ min: 1, max: 24 }}
                value={fParcelas} onChange={(e) => setFParcelas(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <div className="text-xs font-medium text-foreground">Pausar cobranças</div>
              <div className="text-[11px] text-muted-foreground">
                Novas cobranças são recusadas localmente — webhooks e consultas seguem ativos.
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
            <Button variant="outlined" size="small" disabled={testando || !i.segredos.campos.token}
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

          {i.segredos.campos.token && !i.habilitado && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#B8891D]/40 bg-[#B8891D]/8 px-3.5 py-3" role="note">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#B8891D]" />
              <span className="flex-1 text-xs text-muted-foreground">
                Credenciais salvas — para concluir a conexão, ative
                <strong> Cobranças habilitadas</strong> na aba Visão geral.
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
            Webhooks recebidos
          </Typography>
          <Typography variant="body2" className="mb-4 mt-1 text-xs text-muted-foreground">
            Cada notificação tem a assinatura HMAC verificada antes de qualquer
            processamento; o estado aplicado vem do pagamento real no Mercado
            Pago. Reenvios da mesma notificação são deduplicados.
          </Typography>
          {eventos.length === 0 ? (
            <Typography variant="body2" className="py-6 text-center text-xs text-muted-foreground">
              Nenhum webhook Mercado Pago recebido ainda.
            </Typography>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Evento</th>
                    <th className="py-2 pr-3 font-medium">Resultado</th>
                    <th className="py-2 pr-3 font-medium">Recebido</th>
                    <th className="py-2 font-medium">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e) => (
                    <tr key={e.id} className="border-b border-border/60 align-top">
                      <td className="max-w-[280px] truncate py-2 pr-3 font-mono text-[11px]"
                        title={e.evento}>{e.evento}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          e.resultado === "PROCESSED"
                            ? "bg-[#2E7D4F]/10 text-[#2E7D4F]"
                            : e.resultado === "FAILED"
                              ? "bg-[#B3261E]/10 text-[#B3261E]"
                              : "bg-secondary text-muted-foreground"}`}>
                          {e.resultado}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-[11px] text-muted-foreground">
                        {fmtData(e.recebido_em)}
                      </td>
                      <td className="max-w-[200px] truncate py-2 text-[11px] text-muted-foreground"
                        title={e.erro}>{e.erro || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {aba === "transacoes" && (
        <SectionCard>
          <Typography variant="h6" component="h3" className="text-sm font-semibold">
            Cobranças Mercado Pago
          </Typography>
          <Typography variant="body2" className="mb-4 mt-1 text-xs text-muted-foreground">
            Cobranças criadas pelo checkout/pedido via Mercado Pago — confirmação
            sempre por webhook assinado ou reconciliação, nunca pela UI.
          </Typography>
          {transacoes.length === 0 ? (
            <Typography variant="body2" className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma cobrança Mercado Pago registrada ainda.
            </Typography>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Pedido</th>
                    <th className="py-2 pr-3 font-medium">Valor</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Pagamento</th>
                    <th className="py-2 font-medium">Criada</th>
                  </tr>
                </thead>
                <tbody>
                  {transacoes.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 font-medium">
                        {t.pedido_numero || `#${t.pedido_id}`}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">{fmtValor(t.valor, t.moeda)}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          t.status === "CONFIRMED"
                            ? "bg-[#2E7D4F]/10 text-[#2E7D4F]"
                            : t.status === "FAILED" || t.status === "CANCELLED"
                              ? "bg-[#B3261E]/10 text-[#B3261E]"
                              : "bg-secondary text-muted-foreground"}`}>
                          {rotuloStatus(t.status)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {t.metodo === "PIX" && t.pix_copia_cola ? (
                          <button type="button"
                            className="flex items-center gap-1 text-[11px] text-foreground hover:underline"
                            title="Copiar código Pix"
                            onClick={() => void copiar(t.pix_copia_cola)}>
                            <QrCode className="h-3.5 w-3.5" /> copia-e-cola
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ) : t.checkout_url ? (
                          <a href={t.checkout_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-[11px] text-foreground hover:underline">
                            <CreditCard className="h-3.5 w-3.5" /> link de pagamento
                          </a>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 text-[11px] text-muted-foreground">
                        {fmtData(t.criado_em)}
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
