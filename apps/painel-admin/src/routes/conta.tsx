import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleHelp, Eye, EyeOff, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { avaliarEntropiaSenha } from "@/lib/algoritmos";
import { api, ApiError } from "@/lib/api";
import { brl, fmtDataHora, tempoRelativo } from "@/lib/format";
import type { LogAuditoria, Oportunidade, Orcamento, Sessao, Usuario } from "@/lib/models";
import {
  auditoriaService,
  crmService,
  orcamentosService,
  pedidosService,
  sessaoService,
} from "@/lib/services";
import { claimsSessaoAtual, refreshTokens } from "@/lib/session";
import { useAuth } from "@/store/auth-store";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/conta")({
  component: ContaPage,
});

const PERFIL_LABEL: Record<string, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  financeiro: "Financeiro",
  estoque: "Estoque",
  tecnico: "Técnico",
};

const PERMISSOES_PERFIL: Record<string, string[]> = {
  admin: ["Acesso irrestrito", "Gestão de usuários", "Auditoria", "Reindexação de busca"],
  vendedor: ["Empresas & Contatos", "Pipeline de Oportunidades", "Orçamentos", "Pedidos"],
  financeiro: ["Contas a receber", "Sessões de Caixa", "Emissão e cancelamento de NF"],
  estoque: ["Produtos & Categorias", "Movimentações de estoque", "Reposição de mínimo"],
  tecnico: ["Ordens de serviço", "Consumo de materiais", "Histórico técnico"],
};

const ICONES_DISPOSITIVO = {
  desktop: Monitor,
  smartphone: Smartphone,
  tablet: Tablet,
  desconhecido: CircleHelp,
} as const;

function IconeDispositivo({ categoria }: { categoria: Sessao["dispositivo"]["categoria"] }) {
  const Icon = ICONES_DISPOSITIVO[categoria] ?? CircleHelp;
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary/60 text-muted-foreground">
      <Icon className="h-4 w-4" />
    </div>
  );
}

/** "Chrome · Windows 10" — ou "Dispositivo desconhecido" quando o UA não identifica. */
function rotuloDispositivo(s: Sessao): string {
  const partes = [s.dispositivo.navegador, s.dispositivo.sistema].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "Dispositivo desconhecido";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 0 || !partes[0]) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function ContaPage() {
  const navigate = useNavigate();
  const { user, perfil, signOut, trocarSenha } = useAuth();

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [atividade, setAtividade] = useState<LogAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [renovandoSessao, setRenovandoSessao] = useState(false);

  // "Suas sessões" — dispositivo/IP de cada sessão ativa no backend.
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [erroSessoes, setErroSessoes] = useState(false);
  const [encerrandoId, setEncerrandoId] = useState<string | null>(null);
  const [encerrandoOutras, setEncerrandoOutras] = useState(false);

  // Estado do formulário de senha
  const [f, setF] = useState({ senha_atual: "", nova_senha: "", confirmar: "" });
  const [mostrarSenhas, setMostrarSenhas] = useState(false);
  const [touched, setTouched] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Relógio de TTL da sessão JWT
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const userId = user?.id ?? 0;

  const carregar = useCallback(async () => {
    if (!userId) return;
    setCarregando(true);
    try {
      if (perfil === "admin") {
        api
          .get<Usuario>("usuarios", userId)
          .then(setUsuario)
          .catch(() => setUsuario(null));
        auditoriaService
          .listar({ usuario_id: userId, por_pagina: 8 })
          .then((p) => setAtividade(p.itens ?? []))
          .catch(() => setAtividade([]));
      } else {
        setUsuario(null);
        setAtividade([]);
      }

      const [pOps, pOrcs, pPeds] = await Promise.all([
        crmService.oportunidades({ responsavel_id: userId, por_pagina: 100 }).catch(() => null),
        orcamentosService.listar({ vendedor_id: userId, por_pagina: 100 }).catch(() => null),
        pedidosService.listar({ por_pagina: 1 }).catch(() => null),
      ]);

      setOportunidades(pOps?.itens ?? []);
      setOrcamentos(pOrcs?.itens ?? []);
      setTotalPedidos(pPeds?.total ?? 0);
    } finally {
      setCarregando(false);
    }
  }, [userId, perfil]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarSessoes = useCallback(() => {
    sessaoService
      .listar()
      .then((itens) => {
        setSessoes(itens);
        setErroSessoes(false);
      })
      .catch(() => setErroSessoes(true));
  }, []);

  useEffect(() => {
    carregarSessoes();
  }, [carregarSessoes]);

  // Métricas da Carteira Individual do Usuário
  const carteira = useMemo(() => {
    const opsAbertas = oportunidades.filter((o) => !["ganha", "perdida"].includes(o.estagio));
    const opsGanhas = oportunidades.filter((o) => o.estagio === "ganha");
    const pipelineValor = opsAbertas.reduce((acc, o) => acc + (Number(o.valor_estimado) || 0), 0);

    const orcsAtivos = orcamentos.filter((o) =>
      ["rascunho", "enviado", "em_analise", "aprovado"].includes(o.status),
    );
    const orcsValor = orcsAtivos.reduce((acc, o) => acc + (Number(o.total) || 0), 0);

    return {
      opsTotal: oportunidades.length,
      opsAbertasCount: opsAbertas.length,
      opsGanhasCount: opsGanhas.length,
      pipelineValor,
      orcsTotal: orcamentos.length,
      orcsAtivosCount: orcsAtivos.length,
      orcsValor,
    };
  }, [oportunidades, orcamentos]);

  const claims = claimsSessaoAtual();
  const minutosRestantesJwt = useMemo(() => {
    if (!claims.expiraEm) return null;
    return Math.max(0, Math.round((claims.expiraEm.getTime() - agoraMs) / 60_000));
  }, [claims.expiraEm, agoraMs]);

  const entropia = useMemo(() => avaliarEntropiaSenha(f.nova_senha), [f.nova_senha]);
  const igualAtual = f.nova_senha.length > 0 && f.nova_senha === f.senha_atual;
  const mismatch = f.confirmar.length > 0 && f.nova_senha !== f.confirmar;
  const valido =
    f.senha_atual.length > 0 &&
    f.nova_senha.length >= 6 &&
    f.nova_senha === f.confirmar &&
    !igualAtual;

  const nome = usuario?.nome ?? user?.nome ?? `Usuário #${userId}`;
  const email = usuario?.email ?? user?.email ?? "—";
  const permissoes = PERMISSOES_PERFIL[perfil ?? ""] ?? [];

  const renovarTokenManual = async () => {
    setRenovandoSessao(true);
    try {
      const ok = await refreshTokens();
      if (ok) {
        setAgoraMs(Date.now());
        toast.success("Token de sessão renovado.");
      } else {
        toast.error("Não foi possível renovar a sessão.");
      }
    } finally {
      setRenovandoSessao(false);
    }
  };

  const encerrarSessao = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const sessaoAtual = sessoes.find((s) => s.atual) ?? null;
  const outrasSessoes = sessoes.filter((s) => !s.atual);

  const encerrarSessaoPorId = async (id: string) => {
    setEncerrandoId(id);
    try {
      await sessaoService.encerrar(id);
      setSessoes((ss) => ss.filter((s) => s.id !== id));
      toast.success("Sessão encerrada.");
    } catch {
      toast.error("Não foi possível encerrar a sessão.");
    } finally {
      setEncerrandoId(null);
    }
  };

  const encerrarOutrasSessoes = async () => {
    setEncerrandoOutras(true);
    try {
      const { encerradas } = await sessaoService.encerrarOutras();
      setSessoes((ss) => ss.filter((s) => s.atual));
      toast.success(
        encerradas > 0 ? `${encerradas} sessão(ões) encerrada(s).` : "Nenhuma outra sessão ativa.",
      );
    } catch {
      toast.error("Não foi possível encerrar as outras sessões.");
    } finally {
      setEncerrandoOutras(false);
    }
  };

  const submitTrocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido || salvando) return;
    setSalvando(true);
    try {
      await trocarSenha(f.senha_atual, f.nova_senha);
      setF({ senha_atual: "", nova_senha: "", confirmar: "" });
      setTouched(false);
      toast.success("Senha alterada com sucesso.");
    } catch (err) {
      toast.error(
        err instanceof ApiError && (err.status === 401 || err.status === 422)
          ? "Senha atual incorreta."
          : "Falha ao alterar a senha.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Minha conta"
        subtitle="Identidade, escopo de permissões, carteira atribuída e segurança da sessão"
        action={
          <IconButton size="small" type="button" onClick={() => void carregar()} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></IconButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Coluna Esquerda: Identidade, Escopo RBAC e Sessão JWT */}
        <div className="space-y-4">
          <SectionCard className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
                {iniciais(nome)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold tracking-tight">{nome}</div>
                <div className="text-xs text-muted-foreground">
                  {PERFIL_LABEL[perfil ?? ""] ?? perfil ?? "—"} · ID #{userId}
                </div>
              </div>
              <StatusPill
                status={usuario?.ativo === false ? "inativo" : "ativo"}
                label={usuario?.ativo === false ? "Inativo" : "Ativo"}
              />
            </div>

            <Box component="dl" className="space-y-2 border-t border-border/60 pt-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">E-mail</Typography>
                <Typography component="dd" variant="body2" className="truncate font-medium text-foreground">{email}</Typography>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">Perfil de acesso</Typography>
                <Typography component="dd" variant="body2" className="font-medium capitalize text-foreground">{perfil ?? "—"}</Typography>
              </div>
            </Box>

            {permissoes.length > 0 && (
              <div className="border-t border-border/60 pt-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Escopo habilitado no perfil
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {permissoes.map((p) => (
                    <span
                      key={p}
                      className="rounded-lg border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-foreground"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Suas sessões — dispositivo/IP por sessão (estilo Google/GitHub) */}
          <SectionCard className="space-y-3">
            <div className="flex items-center justify-between">
              <Typography variant="h6" component="h2" className="text-sm font-bold">Sessões ativas</Typography>
              <span className="text-xs text-muted-foreground">JWT HS256</span>
            </div>

            {sessaoAtual ? (
              <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
                <IconeDispositivo categoria={sessaoAtual.dispositivo.categoria} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">
                    {rotuloDispositivo(sessaoAtual)}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {sessaoAtual.ip ?? "IP não registrado"} · ativa{" "}
                    {tempoRelativo(sessaoAtual.ultimo_acesso_em)}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Esta sessão
                </span>
              </div>
            ) : (
              <Typography variant="body2" component="p" className="text-xs text-muted-foreground">
                {erroSessoes
                  ? "Não foi possível carregar as sessões."
                  : "Dispositivo desta sessão ainda não identificado (sessão anterior à atualização)."}
              </Typography>
            )}

            <Box component="dl" className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">Emitido em</Typography>
                <Typography component="dd" variant="body2" className="tabular-nums font-medium">
                  {claims.emitidoEm ? fmtDataHora(claims.emitidoEm.toISOString()) : "—"}
                </Typography>
              </div>
              <div className="flex items-center justify-between">
                <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">Expira em</Typography>
                <Typography component="dd" variant="body2" className="tabular-nums font-medium">
                  {minutosRestantesJwt !== null ? `${minutosRestantesJwt} min` : "—"}
                </Typography>
              </div>
              {claims.jti && (
                <div className="flex items-center justify-between gap-2">
                  <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-muted-foreground">Token ID</Typography>
                  <Typography component="dd" variant="body2" className="truncate font-mono text-[11px] text-muted-foreground">
                    {claims.jti.slice(0, 13)}…
                  </Typography>
                </div>
              )}
            </Box>

            {outrasSessoes.length > 0 && (
              <div className="space-y-2.5 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Outras sessões
                  </div>
                  <Button variant="text" type="button" disabled={encerrandoOutras} onClick={() => void encerrarOutrasSessoes()}>{encerrandoOutras ? "Encerrando…" : "Encerrar todas as outras"}</Button>
                </div>
                {outrasSessoes.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <IconeDispositivo categoria={s.dispositivo.categoria} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">
                        {rotuloDispositivo(s)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.ip ?? "—"} · {tempoRelativo(s.ultimo_acesso_em)}
                      </div>
                    </div>
                    <Button variant="outlined" size="small" type="button" disabled={encerrandoId === s.id} onClick={() => void encerrarSessaoPorId(s.id)}>{encerrandoId === s.id ? "…" : "Encerrar"}</Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outlined" size="small" type="button" disabled={renovandoSessao} onClick={() => void renovarTokenManual()}>{renovandoSessao ? "Renovando…" : "Renovar token"}</Button>
              <Button variant="contained" color="error" size="small" type="button" onClick={() => void encerrarSessao()}>Encerrar sessão</Button>
            </div>
          </SectionCard>
        </div>

        {/* Coluna Direita: Carteira Comercial, Segurança e Atividade */}
        <div className="space-y-4">
          {/* 1. Resumo da Carteira Individual */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link to="/crm/oportunidades">
              <SectionCard className="h-full transition-colors hover:border-primary/40">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Minhas oportunidades</span>
                  <span className="tabular-nums">{carteira.opsAbertasCount} abertas</span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                  {brl(carteira.pipelineValor.toFixed(2))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {carteira.opsTotal} total · {carteira.opsGanhasCount} ganha(s)
                </div>
              </SectionCard>
            </Link>

            <Link to="/vendas/orcamentos">
              <SectionCard className="h-full transition-colors hover:border-primary/40">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Meus orçamentos</span>
                  <span className="tabular-nums">{carteira.orcsAtivosCount} ativos</span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                  {brl(carteira.orcsValor.toFixed(2))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {carteira.orcsTotal} emitido(s) no histórico
                </div>
              </SectionCard>
            </Link>

            <Link to="/vendas/pedidos">
              <SectionCard className="h-full transition-colors hover:border-primary/40">
                <div className="text-xs text-muted-foreground">Pedidos na operação</div>
                <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                  {totalPedidos.toLocaleString("pt-BR")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Total de pedidos registrados
                </div>
              </SectionCard>
            </Link>
          </div>

          {/* 2. Segurança e Troca de Senha com Medidor de Entropia */}
          <SectionCard>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Typography variant="h6" component="h2" className="text-base font-bold">Alterar senha</Typography>
                <Typography variant="body2" component="p" className="text-xs text-muted-foreground">
                  A senha é protegida com Argon2id no servidor
                </Typography>
              </div>
              <Button variant="text" size="small" type="button" onClick={() => setMostrarSenhas((v) => !v)}>{mostrarSenhas ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> Ocultar
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Mostrar
                  </>
                )}</Button>
            </div>

            <Box component="form" onSubmit={submitTrocarSenha} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Senha atual">
                  <TextField size="small" fullWidth
                    type={mostrarSenhas ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={f.senha_atual}
                    onChange={(e) => setF({ ...f, senha_atual: e.target.value })} />
                </FormField>

                <FormField label="Nova senha (mín. 6)">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { minLength: 6 } }}
                    type={mostrarSenhas ? "text" : "password"}
                    required
                   
                    autoComplete="new-password"
                    value={f.nova_senha}
                    onChange={(e) => setF({ ...f, nova_senha: e.target.value })} />
                </FormField>

                <FormField label="Confirmar nova senha">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { minLength: 6 } }}
                    type={mostrarSenhas ? "text" : "password"}
                    required
                   
                    autoComplete="new-password"
                    value={f.confirmar}
                    onChange={(e) => setF({ ...f, confirmar: e.target.value })}
                    onBlur={() => setTouched(true)} />
                </FormField>
              </div>

              {/* Barra de Entropia de Shannon */}
              {f.nova_senha.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Força da senha: <strong className="text-foreground">{entropia.rotulo}</strong>
                    </span>
                    <span className="tabular-nums text-[11px] text-muted-foreground">
                      ~{entropia.bits} bits de entropia
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`h-1.5 rounded-full transition-colors ${
                          entropia.nivel >= step
                            ? entropia.nivel <= 1
                              ? "bg-[#D92546]"
                              : entropia.nivel === 2
                                ? "bg-[#D9486E]"
                                : "bg-primary"
                            : "bg-secondary"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {mismatch && touched && (
                <Typography variant="body2" component="p" className="text-xs text-[#D92546]">
                  A confirmação não confere com a nova senha.
                </Typography>
              )}
              {igualAtual && (
                <Typography variant="body2" component="p" className="text-xs text-[#D92546]">
                  A nova senha deve ser diferente da senha atual.
                </Typography>
              )}

              <div className="flex justify-end">
                <Button variant="contained" type="submit" disabled={!valido || salvando}>{salvando ? "Salvando…" : "Atualizar senha"}</Button>
              </div>
            </Box>
          </SectionCard>

          {/* 3. Trilha de Atividade / Carteira Recente */}
          {perfil === "admin" ? (
            <SectionCard className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
                <Typography variant="h6" component="h2" className="text-sm font-bold">Sua atividade recente na auditoria</Typography>
                <Link
                  to="/auditoria"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Ver trilha completa →
                </Link>
              </div>
              {atividade.length === 0 ? (
                <Typography variant="body2" component="p" className="px-5 py-6 text-xs text-muted-foreground">Nenhuma ação registrada.</Typography>
              ) : (
                <List disablePadding>
                  {atividade.map((a) => (
                    <ListItem key={a.id}>
                      <div>
                        <span className="font-semibold uppercase text-foreground">{a.acao}</span>
                        <span className="ml-2 text-muted-foreground">
                          {a.entidade} #{a.entidade_id}
                        </span>
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtDataHora(a.created_at)}
                      </span>
                    </ListItem>
                  ))}
                </List>
              )}
            </SectionCard>
          ) : (
            oportunidades.length > 0 && (
              <SectionCard className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
                  <Typography variant="h6" component="h2" className="text-sm font-bold">Suas oportunidades recentes</Typography>
                  <Link
                    to="/crm/oportunidades"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Abrir pipeline →
                  </Link>
                </div>
                <List disablePadding>
                  {oportunidades.slice(0, 5).map((op) => (
                    <ListItem key={op.id}>
                      <span className="truncate font-medium text-foreground">{op.titulo}</span>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-muted-foreground">
                          {op.valor_estimado ? brl(op.valor_estimado) : "—"}
                        </span>
                        <StatusPill status={op.estagio} />
                      </div>
                    </ListItem>
                  ))}
                </List>
              </SectionCard>
            )
          )}
        </div>
      </div>
    </>
  );
}
