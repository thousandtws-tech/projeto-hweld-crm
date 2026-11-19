import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageSearch,
  RefreshCcw,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { ApiError } from "@/lib/api";
import type {
  CotacaoFrete,
  CotacaoLogistica,
  IntegracaoMelhorEnvio,
} from "@/lib/models";
import { logisticaService, melhorEnvioService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

const inputSm = { size: "small" as const, fullWidth: true };

/** Painel Melhor Envio — abas Visão geral / Configurações / Cotação /
 *  Histórico. Token write-only, ambiente sandbox↔produção (contas
 *  SEPARADAS no Melhor Envio), CEP de origem e cotações persistidas. */
export function MelhorEnvioPainel({
  onView,
}: {
  onView?: (v: IntegracaoMelhorEnvio) => void;
}) {
  const [i, setI] = useState<IntegracaoMelhorEnvio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [aba, setAba] = useState("geral");

  const [fNome, setFNome] = useState("");
  const [fAmbiente, setFAmbiente] = useState("sandbox");
  const [fToken, setFToken] = useState("");
  const [fCep, setFCep] = useState("");
  const [fServicos, setFServicos] = useState("");
  const [fPausada, setFPausada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ verificacao_status: string; mensagem?: string } | null>(null);
  const [alternando, setAlternando] = useState(false);

  // Aba Cotação — dois modos: pedido ou manual (cep + produto).
  const [cPedido, setCPedido] = useState("");
  const [cCep, setCCep] = useState("");
  const [cPeso, setCPeso] = useState("1");
  const [cLarg, setCLarg] = useState("20");
  const [cAlt, setCAlt] = useState("10");
  const [cComp, setCComp] = useState("30");
  const [cValor, setCValor] = useState("100");
  const [cQtd, setCQtd] = useState("1");
  const [cotando, setCotando] = useState(false);
  const [cotacao, setCotacao] = useState<CotacaoFrete | null>(null);

  const [historico, setHistorico] = useState<CotacaoLogistica[]>([]);

  const preencher = useCallback((v: IntegracaoMelhorEnvio) => {
    setI(v);
    onView?.(v);
    setFNome(v.nome_conta ?? "");
    setFAmbiente(v.config?.ambiente === "producao" ? "producao" : "sandbox");
    setFCep(v.config?.cep_origem ?? "");
    setFServicos(v.config?.servicos ?? "");
    setFPausada(v.config?.cotacao_pausada === true);
    setFToken("");
  }, [onView]);

  const carregar = useCallback(async () => {
    setConflito(false);
    try {
      preencher(await melhorEnvioService.view());
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
      setHistorico(await logisticaService.historico());
    } catch { /* aba secundária — não bloqueia */ }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarHistorico();
  }, [carregar, carregarHistorico]);

  const salvar = async () => {
    if (!i) return;
    setSalvando(true);
    try {
      const nova = await melhorEnvioService.salvar({
        versao: i.versao,
        nome_conta: fNome.trim(),
        config: {
          ambiente: fAmbiente,
          cep_origem: fCep.trim(),
          cotacao_pausada: fPausada,
          servicos: fServicos.trim(),
        },
        ...(fToken.trim() ? { segredos: { token: fToken.trim() } } : {}),
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
      setTeste(await melhorEnvioService.testarConexao());
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
      const nova = await melhorEnvioService.habilitar(!i.habilitado);
      preencher(nova);
      toast.success(nova.habilitado ? "Integração habilitada." : "Integração desabilitada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar habilitação.");
    } finally {
      setAlternando(false);
    }
  };

  const cotar = async () => {
    setCotando(true);
    setCotacao(null);
    try {
      if (cPedido.trim()) {
        setCotacao(await logisticaService.cotarPedido(Number(cPedido.trim())));
      } else {
        const produto = {
          id: "item-1",
          width: Math.max(1, Math.round(Number(cLarg) || 0)),
          height: Math.max(1, Math.round(Number(cAlt) || 0)),
          length: Math.max(1, Math.round(Number(cComp) || 0)),
          weight: Number(cPeso) || 0,
          insurance_value: Number(cValor) || 0,
          quantity: Math.max(1, Math.round(Number(cQtd) || 1)),
        };
        setCotacao(await logisticaService.cotarManual({
          cepDestino: cCep.trim(),
          produtos: [produto],
        }));
      }
      void carregarHistorico();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na cotação.");
    } finally {
      setCotando(false);
    }
  };

  const fmtData = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
  };

  const fmtCep = (cep: string) =>
    cep && cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;

  const fmtMoeda = (v: number | null) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (carregando) {
    return (
      <SectionCard>
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando integração Melhor Envio…
        </div>
      </SectionCard>
    );
  }

  if (falha || !i) {
    return (
      <SectionCard>
        <div className="py-8 text-center">
          <Typography variant="body2" className="text-xs text-muted-foreground">
            Não foi possível carregar a integração Melhor Envio.
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
        <Tab value="cotacao" label="Cotação" />
        <Tab value="historico" label="Histórico" />
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
                {i.config?.ambiente === "producao" ? "Produção" : "Sandbox (homologação)"}
              </div>
            </div>
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Conta</div>
              <div className="mt-0.5 font-medium text-foreground">
                {i.nome_conta || "—"}
                {i.conta_id && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">#{i.conta_id}</span>}
              </div>
            </div>
            <div className="rounded-xl border border-border px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CEP de origem</div>
              <div className="mt-0.5 font-mono text-[11px] font-medium text-foreground">
                {fmtCep(i.config?.cep_origem ?? "") || "—"}
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
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <div className="text-xs font-medium text-foreground">Cotações habilitadas</div>
              <div className="text-[11px] text-muted-foreground">
                Desligar interrompe novas cotações — o histórico permanece.
              </div>
            </div>
            <Switch checked={i.habilitado} disabled={alternando}
              onChange={() => void alternarHabilitado()} />
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-3.5 py-3">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <Typography variant="body2" className="text-[11px] leading-relaxed text-muted-foreground">
              <strong>Fase atual:</strong> cotação de fretes (serviços e prazos por transportadora).
              Compra de etiquetas, rastreio e impressão entram na próxima fase.
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
            Painel Melhor Envio → Integrações → seu aplicativo → "Gerar token". O token é
            write-only — campo em branco mantém o valor atual.
            <strong> Atenção:</strong> contas de sandbox e produção são separadas — o token
            de um ambiente não funciona no outro.
          </Typography>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Nome da conexão</div>
              <TextField {...inputSm} placeholder="Ex.: Frete HWeld"
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
                Access token (Bearer) *
                {i.segredos.campos.token && (
                  <span className="text-[10px] font-normal text-[#2E7D4F]">•••••• configurado</span>
                )}
              </div>
              <TextField {...inputSm} type="password" autoComplete="new-password"
                placeholder={i.segredos.campos.token ? "Deixe em branco para manter" : "Token do aplicativo Melhor Envio"}
                value={fToken} onChange={(e) => setFToken(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">CEP de origem *</div>
              <TextField {...inputSm} placeholder="01310-100"
                value={fCep} onChange={(e) => setFCep(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Serviços (opcional)</div>
              <TextField {...inputSm} placeholder="Ex.: 1,2,3 — vazio = todos"
                value={fServicos} onChange={(e) => setFServicos(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <div className="text-xs font-medium text-foreground">Pausar cotações</div>
              <div className="text-[11px] text-muted-foreground">
                Novas cotações são recusadas localmente — histórico e consultas seguem ativos.
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
                <strong> Cotações habilitadas</strong> na aba Visão geral.
              </span>
              <Button size="small" variant="outlined" onClick={() => setAba("geral")}>
                Ir para Visão geral
              </Button>
            </div>
          )}
        </SectionCard>
      )}

      {aba === "cotacao" && (
        <>
          <SectionCard className="mb-4">
            <Typography variant="h6" component="h3" className="text-sm font-semibold">
              Cotar por pedido
            </Typography>
            <Typography variant="body2" className="mb-4 mt-1 text-xs text-muted-foreground">
              Itens, peso e dimensões vêm do cadastro do produto; o destino é o
              endereço de entrega do pedido — nunca digitado aqui.
            </Typography>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <div className="mb-1 text-xs font-medium text-foreground">ID do pedido</div>
                <TextField {...inputSm} placeholder="Ex.: 1024" value={cPedido}
                  onChange={(e) => setCPedido(e.target.value)} />
              </div>
              <Button variant="contained" size="small" disabled={cotando || !cPedido.trim()}
                onClick={() => void cotar()}>
                {cotando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageSearch className="mr-1.5 h-4 w-4" />}
                Cotar pedido
              </Button>
            </div>
          </SectionCard>

          <SectionCard className="mb-4">
            <Typography variant="h6" component="h3" className="text-sm font-semibold">
              Cotação manual
            </Typography>
            <Typography variant="body2" className="mb-4 mt-1 text-xs text-muted-foreground">
              Para simular sem pedido: CEP de destino + um produto (cm, kg, R$).
            </Typography>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <div className="sm:col-span-2 lg:col-span-2">
                <div className="mb-1 text-xs font-medium text-foreground">CEP de destino *</div>
                <TextField {...inputSm} placeholder="20230-010" value={cCep}
                  onChange={(e) => setCCep(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Peso (kg)</div>
                <TextField {...inputSm} value={cPeso} onChange={(e) => setCPeso(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Valor (R$)</div>
                <TextField {...inputSm} value={cValor} onChange={(e) => setCValor(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Qtd.</div>
                <TextField {...inputSm} value={cQtd} onChange={(e) => setCQtd(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Largura (cm)</div>
                <TextField {...inputSm} value={cLarg} onChange={(e) => setCLarg(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Altura (cm)</div>
                <TextField {...inputSm} value={cAlt} onChange={(e) => setCAlt(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-foreground">Comprimento (cm)</div>
                <TextField {...inputSm} value={cComp} onChange={(e) => setCComp(e.target.value)} />
              </div>
            </div>
            <div className="mt-4">
              <Button variant="outlined" size="small"
                disabled={cotando || cPedido.trim() !== "" || !cCep.trim()}
                onClick={() => void cotar()}>
                {cotando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Cotar manual
              </Button>
              {cPedido.trim() !== "" && (
                <span className="ml-2 text-[11px] text-muted-foreground">
                  Limpe o ID do pedido para usar a cotação manual.
                </span>
              )}
            </div>
          </SectionCard>

          {cotacao && (
            <SectionCard>
              <Typography variant="h6" component="h3" className="text-sm font-semibold">
                Resultado — {fmtCep(cotacao.cep_origem)} → {fmtCep(cotacao.cep_destino)}
              </Typography>
              <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
                Provider <code>{cotacao.provider}</code>
                {cotacao.pedido_id != null && <> · pedido #{cotacao.pedido_id}</>}
              </Typography>
              {cotacao.servicos.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Nenhum serviço disponível para este trecho.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Serviço</th>
                        <th className="pb-2 pr-4 font-medium">Transportadora</th>
                        <th className="pb-2 pr-4 font-medium">Prazo</th>
                        <th className="pb-2 font-medium">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cotacao.servicos.map((s) => (
                        <tr key={s.servico_id} className="border-b border-border/60">
                          <td className="py-2 pr-4 font-medium">{s.nome || `Serviço ${s.servico_id}`}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{s.transportadora || "—"}</td>
                          <td className="py-2 pr-4">
                            {s.erro ? "—" : s.prazo_dias != null ? `${s.prazo_dias} dia${s.prazo_dias > 1 ? "s" : ""}` : "—"}
                          </td>
                          <td className="py-2">
                            {s.erro
                              ? <span className="text-[11px] text-[#B3261E]">{s.erro}</span>
                              : <span className="font-medium">{fmtMoeda(s.preco)}</span>}
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
      )}

      {aba === "historico" && (
        <SectionCard>
          <div className="flex items-center justify-between">
            <Typography variant="h6" component="h3" className="text-sm font-semibold">
              Cotações executadas
            </Typography>
            <Button size="small" variant="text" onClick={() => void carregarHistorico()}>
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Typography variant="body2" className="mb-3 mt-1 text-xs text-muted-foreground">
            Últimas cotações registradas — auditoria e base para a contratação
            do frete (próxima fase).
          </Typography>
          {historico.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <PackageSearch className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Nenhuma cotação executada ainda.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Trecho</th>
                    <th className="pb-2 pr-4 font-medium">Pedido</th>
                    <th className="pb-2 pr-4 font-medium">Provider</th>
                    <th className="pb-2 pr-4 font-medium">Serviços</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((q) => (
                    <tr key={q.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-mono text-[11px]">
                        {fmtCep(q.cep_origem)} → {fmtCep(q.cep_destino)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[11px]">{q.pedido_id ?? "—"}</td>
                      <td className="py-2 pr-4">{q.provider}</td>
                      <td className="py-2 pr-4">{q.servicos_count}</td>
                      <td className="py-2 pr-4">
                        <StatusPill
                          status={q.status === "OK" ? "success" : "error"}
                          label={q.status === "OK" ? "Cotado" : "Erro"} />
                        {q.erro && <div className="mt-1 max-w-xs truncate text-[10px] text-[#B3261E]">{q.erro}</div>}
                      </td>
                      <td className="py-2 text-muted-foreground">{fmtData(q.criado_em)}</td>
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
