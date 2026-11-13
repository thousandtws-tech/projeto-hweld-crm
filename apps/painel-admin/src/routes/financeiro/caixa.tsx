import { createFileRoute } from "@tanstack/react-router";
import { Download, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { downloadCsv, FormDialog, FormField } from "@/components/ui-kit/FormDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  construirLivroRazao,
  num,
  TIPOS_ENTRADA_CAIXA,
  type LinhaLivroRazao,
} from "@/lib/algoritmos";
import { ApiError } from "@/lib/api";
import { brl, fmtDataHora } from "@/lib/format";
import { exigePerfil } from "@/lib/guards";
import type { Caixa, CaixaMovimentacao } from "@/lib/models";
import { financeiroService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

export const Route = createFileRoute("/financeiro/caixa")({
  beforeLoad: exigePerfil("admin", "financeiro"),
  component: CaixaPage,
});

/** Eventos que movem o caixa — baixa/estorno de parcela lança recebimento/estorno. */
const EV_CAIXA = [
  "pagamento.parcelas",
  "pagamento.baixado",
  "pagamento.estornado",
  "caixa.aberto",
  "caixa.movimento",
  "caixa.fechado",
];

const TIPO_COR: Record<string, string> = {
  suprimento: "pago",
  venda: "pago",
  recebimento: "pago",
  sangria: "vencido",
  despesa: "vencido",
  estorno: "em_andamento",
};

const TIPO_LABEL: Record<string, string> = {
  suprimento: "Suprimento",
  sangria: "Sangria",
  venda: "Venda",
  recebimento: "Recebimento",
  despesa: "Despesa",
  estorno: "Estorno",
};

const TIPO_SINAL = TIPOS_ENTRADA_CAIXA;

function CaixaPage() {
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [movs, setMovs] = useState<CaixaMovimentacao[]>([]);
  const [historico, setHistorico] = useState<Caixa[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros do extrato da sessão
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [buscaMov, setBuscaMov] = useState("");

  // Abertura e lançamento manual
  const [valorAbertura, setValorAbertura] = useState("");
  const [fLanc, setFLanc] = useState({ tipo: "suprimento", valor: "", descricao: "" });
  const [lancando, setLancando] = useState(false);

  // Fechamento com conferência em tempo real
  const [fecharOpen, setFecharOpen] = useState(false);
  const [valorInformado, setValorInformado] = useState("");
  const [fechando, setFechando] = useState(false);

  // Gaveta de inspeção de sessão encerrada
  const [sessaoInspecionada, setSessaoInspecionada] = useState<Caixa | null>(null);
  const [movsInspecao, setMovsInspecao] = useState<CaixaMovimentacao[]>([]);
  const [carregandoInspecao, setCarregandoInspecao] = useState(false);

  const carregarHistorico = useCallback(async () => {
    try {
      const p = await financeiroService.caixas({ por_pagina: 20 });
      const fechados = (p.itens ?? []).filter((c) => c.status === "fechado");
      setHistorico(fechados);
    } catch {
      setHistorico([]);
    }
  }, []);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const c = await financeiroService.caixaAberto();
        setCaixa(c);
        if (c) {
          const listaMovs = await financeiroService.movimentacoesCaixa(c.id).catch(() => []);
          setMovs(listaMovs);
        } else {
          setMovs([]);
        }
      } catch {
        setCaixa(null);
        setMovs([]);
      } finally {
        setCarregando(false);
      }
      void carregarHistorico();
    },
    [carregarHistorico],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(EV_CAIXA, () => void carregar(true));

  // Sugere o fundo de troco a partir do fechamento da última sessão encerrada
  const sugestaoTrocoAnterior = useMemo(() => {
    const ultimo = historico[0];
    return ultimo?.valor_fechamento_informado ?? ultimo?.valor_fechamento_calculado ?? null;
  }, [historico]);

  // Livro-razão da sessão aberta
  const razao = useMemo(
    () => construirLivroRazao(num(caixa?.valor_abertura), movs),
    [caixa?.valor_abertura, movs],
  );

  const linhasFiltradas = useMemo(() => {
    const q = buscaMov.trim().toLowerCase();
    return razao.linhas.filter((m) => {
      if (filtroTipo && m.tipo !== filtroTipo) return false;
      if (q) {
        const desc = (m.descricao ?? "").toLowerCase();
        const tp = (TIPO_LABEL[m.tipo] ?? m.tipo).toLowerCase();
        if (!desc.includes(q) && !tp.includes(q) && !String(m.id).includes(q)) return false;
      }
      return true;
    });
  }, [razao.linhas, filtroTipo, buscaMov]);

  const abrirCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const c = await financeiroService.abrir(String(valorAbertura || "0"));
      setCaixa(c);
      setMovs([]);
      toast.success("Caixa aberto.");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? "Já existe um caixa aberto."
          : "Falha ao abrir o caixa.",
      );
    }
  };

  const lancar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fLanc.valor || lancando) return;
    const val = num(fLanc.valor);
    if ((fLanc.tipo === "sangria" || fLanc.tipo === "despesa") && val > razao.saldoAtual) {
      toast.warning("Atenção: o valor de saída é maior que o saldo calculado atual do caixa.");
    }
    setLancando(true);
    try {
      const mov = await financeiroService.lancar({
        tipo: fLanc.tipo,
        valor: String(fLanc.valor),
        descricao: fLanc.descricao.trim() || undefined,
      });
      setMovs((l) => [mov, ...l]);
      setFLanc((p) => ({ ...p, valor: "", descricao: "" }));
      toast.success("Movimentação lançada.");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 422
          ? "Sem caixa aberto ou tipo inválido."
          : "Falha ao lançar movimentação.",
      );
    } finally {
      setLancando(false);
    }
  };

  const abrirModalFechamento = () => {
    setValorInformado(razao.saldoAtual.toFixed(2));
    setFecharOpen(true);
  };

  const diferencaPrevia = useMemo(() => {
    if (valorInformado === "") return 0;
    return Math.round((num(valorInformado) - razao.saldoAtual) * 100) / 100;
  }, [valorInformado, razao.saldoAtual]);

  const fechar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fechando) return;
    setFechando(true);
    try {
      const c = await financeiroService.fechar(String(valorInformado));
      setCaixa(null);
      setMovs([]);
      setFecharOpen(false);
      setValorInformado("");
      void carregarHistorico();
      const dif = num(c.diferenca);
      if (dif !== 0) {
        toast.warning(`Caixa fechado com diferença de ${brl(c.diferenca ?? "0")}.`);
      } else {
        toast.success("Caixa fechado sem divergência.");
      }
    } catch {
      toast.error("Falha ao fechar o caixa.");
    } finally {
      setFechando(false);
    }
  };

  const inspecionarSessao = async (sessao: Caixa) => {
    setSessaoInspecionada(sessao);
    setCarregandoInspecao(true);
    try {
      const lista = await financeiroService.movimentacoesCaixa(sessao.id);
      setMovsInspecao(lista);
    } catch {
      setMovsInspecao([]);
    } finally {
      setCarregandoInspecao(false);
    }
  };

  const exportarExtratoCsv = (linhas: LinhaLivroRazao[], caixaId: number) => {
    downloadCsv(
      `extrato-caixa-${caixaId}.csv`,
      linhas.map((l) => ({
        id: l.id,
        data_hora: l.created_at,
        tipo: l.tipo,
        valor: l.delta.toFixed(2),
        saldo_apos: l.saldoApos.toFixed(2),
        descricao: l.descricao ?? "",
      })),
    );
  };

  const razaoInspecao = useMemo(
    () =>
      sessaoInspecionada
        ? construirLivroRazao(num(sessaoInspecionada.valor_abertura), movsInspecao)
        : null,
    [sessaoInspecionada, movsInspecao],
  );

  return (
    <>
      <PageHeader
        title="Caixa"
        subtitle={
          caixa
            ? `Sessão #${caixa.id} aberta em ${fmtDataHora(caixa.aberto_em)}`
            : "Controle de abertura, movimentações, sangria e conciliação de fechamento"
        }
        action={
          <Stack direction="row" alignItems="center" spacing={1}>
            {caixa && razao.linhas.length > 0 && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download size={14} />}
                onClick={() => exportarExtratoCsv(razao.linhas, caixa.id)}
              >
                Exportar CSV
              </Button>
            )}
            {caixa && (
              <Button
                variant="contained"
                color="error"
                size="small"
                onClick={abrirModalFechamento}
              >
                Fechar caixa
              </Button>
            )}
            <IconButton
              size="small"
              onClick={() => void carregar()}
              aria-label="Atualizar"
              disabled={carregando}
            >
              <RefreshCw className={carregando ? "animate-spin" : ""} size={14} />
            </IconButton>
          </Stack>
        }
      />

      {caixa ? (
        <>
          {/* 1. Resumo Contábil da Sessão Aberta — 4 cards tipográficos limpos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SectionCard>
              <Typography variant="caption" color="text.secondary">Fundo de abertura</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ mt: 1, fontVariantNumeric: "tabular-nums" }}>
                {brl(caixa.valor_abertura)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }} display="block">
                Aberto às {fmtDataHora(caixa.aberto_em)}
              </Typography>
            </SectionCard>

            <SectionCard>
              <Typography variant="caption" color="text.secondary">Entradas na sessão</Typography>
              <Typography variant="h5" fontWeight={700} color="primary" sx={{ mt: 1, fontVariantNumeric: "tabular-nums" }}>
                +{brl(razao.entradas.toFixed(2))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }} display="block">
                Recebimentos: {brl(razao.porTipo.recebimento.toFixed(2))} · Suprimentos:{" "}
                {brl(razao.porTipo.suprimento.toFixed(2))}
              </Typography>
            </SectionCard>

            <SectionCard>
              <Typography variant="caption" color="text.secondary">Saídas na sessão</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ mt: 1, color: "#D92546", fontVariantNumeric: "tabular-nums" }}>
                −{brl(razao.saidas.toFixed(2))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }} display="block">
                Sangrias: {brl(razao.porTipo.sangria.toFixed(2))} · Despesas:{" "}
                {brl(razao.porTipo.despesa.toFixed(2))}
              </Typography>
            </SectionCard>

            <SectionCard>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Saldo calculado atual</Typography>
                <StatusPill status="ativo" label="Aberto" />
              </Stack>
              <Typography variant="h5" fontWeight={700} sx={{ mt: 1, fontVariantNumeric: "tabular-nums" }}>
                {brl(razao.saldoAtual.toFixed(2))}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }} display="block">
                {movs.length} lançamento(s) registrado(s)
              </Typography>
            </SectionCard>
          </div>

          {/* 2. Lançamento Manual (Suprimento, Sangria, Despesa) */}
          <SectionCard>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Lançar movimentação manual</Typography>
            <Box
              component="form"
              onSubmit={lancar}
              sx={{
                display: "grid",
                alignItems: "end",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr 1fr", lg: "180px 160px 1fr auto" },
              }}
            >
              <TextField size="small" fullWidth select label="Tipo"
                value={fLanc.tipo}
                onChange={(e) => setFLanc({ ...fLanc, tipo: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="suprimento">Suprimento (+)</MenuItem>
                <MenuItem value="sangria">Sangria (−)</MenuItem>
                <MenuItem value="despesa">Despesa (−)</MenuItem>
              </TextField>
              <TextField size="small" fullWidth label="Valor (R$)" slotProps={{ htmlInput: { step: "0.01", min: "0.01" } }}
                type="number"
                required
                placeholder="0,00"
                value={fLanc.valor}
                onChange={(e) => setFLanc({ ...fLanc, valor: e.target.value })} />
              <TextField size="small" fullWidth label="Histórico / Descrição"
                placeholder="Ex.: Reforço de troco, retirada p/ cofre, frete motoboy…"
                value={fLanc.descricao}
                onChange={(e) => setFLanc({ ...fLanc, descricao: e.target.value })} />
              <Button
                type="submit"
                variant="contained"
                disabled={lancando || !fLanc.valor}
              >
                {lancando ? "Lançando…" : "Lançar"}
              </Button>
            </Box>
          </SectionCard>

          {/* 3. Livro-Razão (Extrato com Saldo Acumulado) */}
          <SectionCard className="overflow-hidden p-0">
            <Stack
              direction="row"
              flexWrap="wrap"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
              sx={{ borderBottom: 1, borderColor: "divider", px: 2.5, py: 1.75 }}
            >
              <Typography variant="subtitle2">Livro-razão da sessão</Typography>

              <Stack direction="row" flexWrap="wrap" alignItems="center" spacing={1}>
                <TextField
                  size="small"
                  placeholder="Filtrar descrição…"
                  value={buscaMov}
                  onChange={(e) => setBuscaMov(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search size={14} />
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{ width: 180 }}
                />

                <TextField size="small" select aria-label="Filtrar por tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
                  <MenuItem value="">Todos os tipos</MenuItem>
                  <MenuItem value="recebimento">Recebimento</MenuItem>
                  <MenuItem value="venda">Venda</MenuItem>
                  <MenuItem value="suprimento">Suprimento</MenuItem>
                  <MenuItem value="sangria">Sangria</MenuItem>
                  <MenuItem value="despesa">Despesa</MenuItem>
                  <MenuItem value="estorno">Estorno</MenuItem>
                </TextField>
              </Stack>
            </Stack>

            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Horário</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Descrição / Origem</TableCell>
                    <TableCell align="right">Movimento</TableCell>
                    <TableCell align="right">Saldo após</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {linhasFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6, color: "text.secondary" }}>
                        Nenhuma movimentação encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    linhasFiltradas.map((m) => {
                      const entrada = TIPO_SINAL.has(m.tipo);
                      return (
                        <TableRow key={m.id} hover>
                          <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            {fmtDataHora(m.created_at)}
                          </TableCell>
                          <TableCell>
                            <StatusPill
                              status={TIPO_COR[m.tipo] ?? "draft"}
                              label={TIPO_LABEL[m.tipo] ?? m.tipo}
                            />
                          </TableCell>
                          <TableCell>
                            {m.descricao || "—"}
                            {m.pagamento_id && (
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                (Parcela #{m.pagamento_id})
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: entrada ? "primary.main" : "#D92546" }}
                          >
                            {entrada ? "+" : "−"}
                            {brl(m.valor)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
                            {brl(m.saldoApos.toFixed(2))}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Box>
          </SectionCard>
        </>
      ) : (
        !carregando && (
          <SectionCard>
            <Box sx={{ mx: "auto", maxWidth: 400, py: 3, textAlign: "center" }}>
              <Typography variant="subtitle1" fontWeight={700}>Nenhum caixa aberto no momento</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Informe o fundo de troco inicial para iniciar as operações financeiras e permitir
                baixas de parcelas.
              </Typography>

              <Box component="form" onSubmit={abrirCaixa} sx={{ mt: 2, display: "flex", gap: 1, flexDirection: { xs: "column", sm: "row" } }}>
                <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                  type="number"
                  required
                  placeholder="Valor de abertura (R$)"
                  value={valorAbertura}
                  onChange={(e) => setValorAbertura(e.target.value)} />
                <Button type="submit" variant="contained" sx={{ whiteSpace: "nowrap" }}>
                  Abrir caixa
                </Button>
              </Box>

              {sugestaoTrocoAnterior && (
                <Button
                  variant="text"
                  size="small"
                  onClick={() => setValorAbertura(sugestaoTrocoAnterior)}
                  sx={{ mt: 1.5, textTransform: "none" }}
                >
                  Usar saldo do último fechamento ({brl(sugestaoTrocoAnterior)})
                </Button>
              )}
            </Box>
          </SectionCard>
        )
      )}

      {/* 4. Histórico de Sessões Anteriores (Clicável para auditar movimentações) */}
      {historico.length > 0 && (
        <SectionCard className="overflow-hidden p-0">
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ borderBottom: 1, borderColor: "divider", px: 2.5, py: 1.75 }}
          >
            <Typography variant="subtitle2">Sessões encerradas</Typography>
            <Typography variant="caption" color="text.secondary">
              Clique em uma sessão para ver o extrato completo
            </Typography>
          </Stack>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Sessão</TableCell>
                  <TableCell>Abertura</TableCell>
                  <TableCell>Fechamento</TableCell>
                  <TableCell align="right">Fundo inicial</TableCell>
                  <TableCell align="right">Calculado</TableCell>
                  <TableCell align="right">Informado</TableCell>
                  <TableCell align="right">Diferença</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {historico.map((c) => {
                  const dif = num(c.diferenca);
                  return (
                    <TableRow
                      key={c.id}
                      hover
                      onClick={() => void inspecionarSessao(c)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>#{c.id}</TableCell>
                      <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {fmtDataHora(c.aberto_em)}
                      </TableCell>
                      <TableCell sx={{ color: "text.secondary", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {fmtDataHora(c.fechado_em)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {brl(c.valor_abertura)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {brl(c.valor_fechamento_calculado)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {brl(c.valor_fechamento_informado)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          color: dif < 0 ? "#D92546" : dif > 0 ? "#D9486E" : "primary.main",
                        }}
                      >
                        {dif > 0 ? `+${brl(c.diferenca)}` : brl(c.diferenca)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </SectionCard>
      )}

      {/* Modal de Fechamento com Conferência em Tempo Real */}
      <FormDialog
        open={fecharOpen}
        onOpenChange={setFecharOpen}
        title="Fechar caixa"
        description="Conferência física de encerramento de turno"
        submitLabel={fechando ? "Fechando…" : "Confirmar fechamento"}
        onSubmit={fechar}
      >
        <Box
          sx={{
            gridColumn: { sm: "span 2" },
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "action.hover",
            p: 1.5,
          }}
        >
          {[
            ["Abertura", brl(caixa?.valor_abertura)],
            ["Entradas / Saídas", `+${brl(razao.entradas.toFixed(2))} / −${brl(razao.saidas.toFixed(2))}`],
            ["Saldo esperado", brl(razao.saldoAtual.toFixed(2))],
          ].map(([k, v], i) => (
            <Box key={k}>
              <Typography variant="caption" color="text.secondary" display="block">{k}</Typography>
              <Typography
                variant="body2"
                fontWeight={700}
                color={i === 2 ? "primary" : undefined}
                sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}
              >
                {v}
              </Typography>
            </Box>
          ))}
        </Box>

        <FormField label="Valor físico apurado em caixa (R$) *" wide>
          <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
            type="number"
           
           
            required
            value={valorInformado}
            onChange={(e) => setValorInformado(e.target.value)} />
        </FormField>

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            gridColumn: { sm: "span 2" },
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            px: 1.75,
            py: 1.25,
          }}
        >
          <Typography variant="caption" color="text.secondary">Resultado da conferência:</Typography>
          {diferencaPrevia === 0 ? (
            <Typography variant="caption" fontWeight={700} color="primary">
              Caixa batendo exatamente (R$ 0,00)
            </Typography>
          ) : diferencaPrevia < 0 ? (
            <Typography variant="caption" fontWeight={700} sx={{ color: "#D92546" }}>
              Quebra / Falta de {brl(Math.abs(diferencaPrevia).toFixed(2))}
            </Typography>
          ) : (
            <Typography variant="caption" fontWeight={700} sx={{ color: "#D9486E" }}>
              Sobra de +{brl(diferencaPrevia.toFixed(2))}
            </Typography>
          )}
        </Stack>
      </FormDialog>

      {/* Gaveta de Auditoria de Sessão Encerrada */}
      <Sheet
        open={Boolean(sessaoInspecionada)}
        onOpenChange={(o) => !o && setSessaoInspecionada(null)}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 sm:max-w-xl"
        >
          {sessaoInspecionada && (
            <>
              <SheetHeader className="border-b border-border px-6 pt-6 pb-4 text-left">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <StatusPill status="inativo" label="Fechado" />
                  <Typography variant="caption" color="text.secondary">
                    Sessão #{sessaoInspecionada.id}
                  </Typography>
                </Stack>
                <SheetTitle className="mt-1 text-lg font-bold">
                  Extrato da Sessão #{sessaoInspecionada.id}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Aberto em {fmtDataHora(sessaoInspecionada.aberto_em)} · Fechado em{" "}
                  {fmtDataHora(sessaoInspecionada.fechado_em)}
                </SheetDescription>

                <Box
                  sx={{
                    mt: 1.5,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 1,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    bgcolor: "action.hover",
                    p: 1.5,
                  }}
                >
                  {[
                    ["Calculado", brl(sessaoInspecionada.valor_fechamento_calculado), false],
                    ["Informado", brl(sessaoInspecionada.valor_fechamento_informado), false],
                    ["Diferença", brl(sessaoInspecionada.diferenca), num(sessaoInspecionada.diferenca) !== 0],
                  ].map(([k, v, alerta]) => (
                    <Box key={k as string}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {k as string}
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums", color: alerta ? "#D92546" : "primary.main" }}
                      >
                        {v as string}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </SheetHeader>

              <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2 }}>
                {carregandoInspecao ? (
                  <Typography variant="caption" color="text.secondary" align="center" display="block" sx={{ py: 4 }}>
                    Carregando movimentações…
                  </Typography>
                ) : !razaoInspecao || razaoInspecao.linhas.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" align="center" display="block" sx={{ py: 4 }}>
                    Nenhuma movimentação registrada nesta sessão.
                  </Typography>
                ) : (
                  <>
                    <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Download size={14} />}
                        onClick={() =>
                          exportarExtratoCsv(razaoInspecao.linhas, sessaoInspecionada.id)
                        }
                      >
                        Exportar CSV
                      </Button>
                    </Stack>
                    <List disablePadding dense>
                      {razaoInspecao.linhas.map((m) => {
                        const entrada = TIPO_SINAL.has(m.tipo);
                        return (
                          <ListItem key={m.id} divider disableGutters
                            secondaryAction={
                              <Box sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                <Typography
                                  variant="caption"
                                  fontWeight={600}
                                  sx={{ color: entrada ? "primary.main" : "#D92546" }}
                                  display="block"
                                >
                                  {entrada ? "+" : "−"}
                                  {brl(m.valor)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Saldo: {brl(m.saldoApos.toFixed(2))}
                                </Typography>
                              </Box>
                            }
                          >
                            <ListItemText
                              primary={
                                <>
                                  <Typography component="span" variant="caption" fontWeight={600} sx={{ textTransform: "capitalize" }}>
                                    {TIPO_LABEL[m.tipo] ?? m.tipo}
                                  </Typography>{" "}
                                  <Typography component="span" variant="caption" color="text.secondary">
                                    {fmtDataHora(m.created_at)}
                                  </Typography>
                                </>
                              }
                              secondary={m.descricao || "—"}
                              secondaryTypographyProps={{ variant: "caption", noWrap: true }}
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  </>
                )}
              </Box>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
