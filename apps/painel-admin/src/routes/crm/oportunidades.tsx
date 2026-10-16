import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Kanban, dropHandler } from "react-kanban-kit";
import type { BoardData, BoardItem as BoardItemT, BoardProps } from "react-kanban-kit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, fmtData, fmtDataHora, statusLabel } from "@/lib/format";
import type {
  Contato,
  Empresa,
  EstagioOportunidade,
  Interacao,
  Oportunidade,
  Orcamento,
  Produto,
  Usuario,
} from "@/lib/models";
import { catalogoService, crmService, orcamentosService, usuariosService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import { useAuth } from "@/store/auth-store";

export const Route = createFileRoute("/crm/oportunidades")({
  component: OportunidadesPage,
});

type DropCardParams = Parameters<NonNullable<BoardProps["onCardMove"]>>[0];
type OrdenacaoFunil = "relevancia" | "maior_valor" | "fechamento" | "recentes";
type ModoVisao = "kanban" | "lista";
type FiltroPrazo = "todos" | "atrasadas" | "semana" | "estagnadas";

interface ConfigEstagio {
  slug: EstagioOportunidade;
  titulo: string;
  probabilidade: number;
  metaDiasEstagnacao: number;
  proximo?: EstagioOportunidade;
  rotuloAvancar?: string;
}

const CONFIG_ESTAGIOS: Record<EstagioOportunidade, ConfigEstagio> = {
  lead: {
    slug: "lead",
    titulo: "Lead",
    probabilidade: 0.1,
    metaDiasEstagnacao: 7,
    proximo: "qualificacao",
    rotuloAvancar: "Qualificar",
  },
  qualificacao: {
    slug: "qualificacao",
    titulo: "Qualificação",
    probabilidade: 0.25,
    metaDiasEstagnacao: 10,
    proximo: "proposta",
    rotuloAvancar: "Proposta",
  },
  proposta: {
    slug: "proposta",
    titulo: "Proposta",
    probabilidade: 0.55,
    metaDiasEstagnacao: 10,
    proximo: "negociacao",
    rotuloAvancar: "Negociação",
  },
  negociacao: {
    slug: "negociacao",
    titulo: "Negociação",
    probabilidade: 0.8,
    metaDiasEstagnacao: 14,
    proximo: "ganha",
    rotuloAvancar: "Ganhar",
  },
  ganha: {
    slug: "ganha",
    titulo: "Ganha",
    probabilidade: 1.0,
    metaDiasEstagnacao: 999,
  },
  perdida: {
    slug: "perdida",
    titulo: "Perdida",
    probabilidade: 0.0,
    metaDiasEstagnacao: 999,
  },
};

const ESTAGIOS: EstagioOportunidade[] = [
  "lead",
  "qualificacao",
  "proposta",
  "negociacao",
  "ganha",
  "perdida",
];

const MOTIVOS_PERDA_SUGERIDOS = [
  "Preço acima da concorrência",
  "Prazo de entrega / estoque indisponível",
  "Optou por concorrente",
  "Projeto adiado ou cancelado",
  "Sem retorno do cliente",
  "Especificação incompatível",
];

const ORIGEM_LABELS: Record<string, string> = {
  site: "Site",
  telefone: "Telefone",
  indicacao: "Indicação",
  prospeccao: "Prospecção",
  ecommerce: "E-commerce",
  outro: "Outro",
};

const cardId = (o: Oportunidade) => `op-${o.id}`;
const estagioDe = (id: string) => id.replace("est-", "") as EstagioOportunidade;
const opIdDe = (id: string) => Number(id.replace("op-", ""));

const valorNum = (v: string | null | undefined): number => {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function diasAteData(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const limpa = isoDate.slice(0, 10);
  const alvo = new Date(`${limpa}T12:00:00`);
  if (Number.isNaN(alvo.getTime())) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function diasNoEstagio(o: Oportunidade): number {
  const ref = o.updated_at || o.created_at;
  if (!ref) return 0;
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

export type SaudeNegocio = {
  status: "atrasada" | "urgente" | "estagnada" | "saudavel" | "concluida";
  rotulo: string;
  diasFechamento: number | null;
  diasParado: number;
  scorePrioridade: number;
};

function avaliarSaudeNegocio(o: Oportunidade): SaudeNegocio {
  const cfg = CONFIG_ESTAGIOS[o.estagio] ?? CONFIG_ESTAGIOS.lead;
  const diasFechamento = diasAteData(o.data_prevista_fechamento);
  const diasParado = diasNoEstagio(o);
  const val = valorNum(o.valor_estimado);

  if (o.estagio === "ganha" || o.estagio === "perdida") {
    return {
      status: "concluida",
      rotulo: o.estagio === "ganha" ? "Ganha" : "Perdida",
      diasFechamento,
      diasParado,
      scorePrioridade: val,
    };
  }

  let urgenciaBonus = 1;
  let status: SaudeNegocio["status"] = "saudavel";
  let rotulo = "No prazo";

  if (diasFechamento !== null && diasFechamento < 0) {
    status = "atrasada";
    rotulo = `Atrasada ${Math.abs(diasFechamento)}d`;
    urgenciaBonus = 2.2;
  } else if (diasFechamento !== null && diasFechamento <= 3) {
    status = "urgente";
    rotulo =
      diasFechamento === 0 ? "Hoje" : diasFechamento === 1 ? "Amanhã" : `Em ${diasFechamento}d`;
    urgenciaBonus = 1.75;
  } else if (diasParado >= cfg.metaDiasEstagnacao) {
    status = "estagnada";
    rotulo = `Parada ${diasParado}d`;
    urgenciaBonus = 1.45;
  } else if (diasFechamento !== null) {
    rotulo = dataCurta(o.data_prevista_fechamento!);
  }

  const scorePrioridade = (val > 0 ? val : 1000) * cfg.probabilidade * urgenciaBonus;

  return {
    status,
    rotulo,
    diasFechamento,
    diasParado,
    scorePrioridade,
  };
}

const dataCurta = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 0 || !partes[0]) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function buildBoard(
  ops: Oportunidade[],
  estagiosVisiveis: EstagioOportunidade[],
  ordemColunas?: Record<string, string[]>,
): BoardData {
  const board: BoardData = {
    root: {
      id: "root",
      title: "Pipeline",
      children: [],
      totalChildrenCount: estagiosVisiveis.length,
      parentId: null,
    },
  };
  for (const est of estagiosVisiveis) {
    const itens = ops.filter((o) => o.estagio === est);
    const colId = `est-${est}`;

    const ordemSalva = ordemColunas?.[colId];
    const itensOrdenados = ordemSalva
      ? [...itens].sort((a, b) => {
          const ia = ordemSalva.indexOf(cardId(a));
          const ib = ordemSalva.indexOf(cardId(b));
          if (ia === -1 && ib === -1) return 0;
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        })
      : itens;

    const somaBruta = itensOrdenados.reduce((acc, o) => acc + valorNum(o.valor_estimado), 0);
    const somaPonderada = somaBruta * CONFIG_ESTAGIOS[est].probabilidade;

    board[colId] = {
      id: colId,
      title: statusLabel(est),
      parentId: "root",
      children: itensOrdenados.map(cardId),
      totalChildrenCount: itensOrdenados.length,
      isDraggable: false,
      content: {
        estagio: est,
        somaBruta,
        somaPonderada,
      },
    };
    board.root.children.push(colId);
    for (const o of itensOrdenados) {
      board[cardId(o)] = {
        id: cardId(o),
        title: o.titulo,
        parentId: colId,
        children: [],
        totalChildrenCount: 0,
        type: "card",
        content: o,
      };
    }
  }
  return board;
}

function OportunidadesPage() {
  const { user, pode } = useAuth();
  const podeEditar = pode("admin", "vendedor");

  const [ops, setOps] = useState<Oportunidade[]>([]);
  const [empresas, setEmpresas] = useState<Map<number, Empresa>>(new Map());
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [usuarios, setUsuarios] = useState<Map<number, Usuario>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [salvandoIds, setSalvandoIds] = useState<Set<number>>(new Set());

  const [modoVisao, setModoVisao] = useState<ModoVisao>("kanban");
  const [busca, setBusca] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("");
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>("todos");
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>("todos");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoFunil>("relevancia");
  const [ocultarFechadas, setOcultarFechadas] = useState(false);
  const [ordemIntraColuna, setOrdemIntraColuna] = useState<Record<string, string[]>>({});

  const [novoOpen, setNovoOpen] = useState(false);
  const [estagioInicialNovo, setEstagioInicialNovo] = useState<EstagioOportunidade>("lead");
  const [perda, setPerda] = useState<{
    o: Oportunidade;
    move?: DropCardParams;
  } | null>(null);
  const [motivoPerda, setMotivoPerda] = useState("");
  const [selecionadaId, setSelecionadaId] = useState<number | null>(null);

  const [fNovo, setFNovo] = useState({
    titulo: "",
    empresa_id: "",
    contato_id: "",
    responsavel_id: "",
    valor_estimado: "",
    origem: "",
    data_prevista_fechamento: "",
    descricao: "",
  });

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [pOps, pEmp, pCont] = await Promise.all([
        crmService.oportunidades({ por_pagina: 100 }),
        crmService.empresas({ por_pagina: 100 }),
        crmService.contatos({ por_pagina: 100 }).catch(() => ({ itens: [] as Contato[] })),
      ]);
      setOps(pOps.itens);
      setEmpresas(new Map(pEmp.itens.map((e) => [e.id, e])));
      setContatos(pCont.itens);
    } catch {
      if (!silencioso) toast.error("Não foi possível carregar o pipeline.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    if (pode("admin")) {
      usuariosService
        .listar({ por_pagina: 100 })
        .then((p) => setUsuarios(new Map(p.itens.map((u) => [u.id, u]))))
        .catch(() => {});
    }
  }, [carregar, pode]);

  useRealtimeEvent(["oportunidade.estagio"], () => void carregar(true));

  const empresaNome = useCallback(
    (id: number) => {
      const e = empresas.get(id);
      return e ? e.nome_fantasia || e.razao_social : `Empresa #${id}`;
    },
    [empresas],
  );

  const responsavelNome = useCallback(
    (id: number) => {
      if (user && user.id === id && user.nome) return user.nome;
      const u = usuarios.get(id);
      return u ? u.nome : `#${id}`;
    },
    [usuarios, user],
  );

  const contatoNome = useCallback(
    (id: number | null) => {
      if (!id) return null;
      return contatos.find((c) => c.id === id)?.nome ?? null;
    },
    [contatos],
  );

  const opsFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = ops.filter((o) => {
      if (termo) {
        const emp = empresaNome(o.empresa_id).toLowerCase();
        const cont = (contatoNome(o.contato_id) ?? "").toLowerCase();
        const match =
          o.titulo.toLowerCase().includes(termo) ||
          emp.includes(termo) ||
          cont.includes(termo) ||
          (o.descricao ?? "").toLowerCase().includes(termo);
        if (!match) return false;
      }
      if (filtroOrigem && o.origem !== filtroOrigem) return false;
      if (filtroResponsavel === "meus" && user && o.responsavel_id !== user.id) return false;
      if (
        filtroResponsavel !== "todos" &&
        filtroResponsavel !== "meus" &&
        o.responsavel_id !== Number(filtroResponsavel)
      ) {
        return false;
      }
      if (filtroPrazo !== "todos") {
        const saude = avaliarSaudeNegocio(o);
        if (filtroPrazo === "atrasadas" && saude.status !== "atrasada") return false;
        if (
          filtroPrazo === "semana" &&
          (saude.diasFechamento === null || saude.diasFechamento < 0 || saude.diasFechamento > 7)
        ) {
          return false;
        }
        if (filtroPrazo === "estagnadas" && saude.status !== "estagnada") return false;
      }
      return true;
    });

    return [...filtradas].sort((a, b) => {
      if (ordenacao === "maior_valor") {
        return valorNum(b.valor_estimado) - valorNum(a.valor_estimado);
      }
      if (ordenacao === "fechamento") {
        const da = a.data_prevista_fechamento ?? "9999-12-31";
        const db = b.data_prevista_fechamento ?? "9999-12-31";
        return da.localeCompare(db);
      }
      if (ordenacao === "recentes") {
        return b.id - a.id;
      }
      return avaliarSaudeNegocio(b).scorePrioridade - avaliarSaudeNegocio(a).scorePrioridade;
    });
  }, [
    ops,
    busca,
    filtroOrigem,
    filtroResponsavel,
    filtroPrazo,
    ordenacao,
    empresaNome,
    contatoNome,
    user,
  ]);

  const metricas = useMemo(() => {
    const abertas = opsFiltradas.filter((o) => !["ganha", "perdida"].includes(o.estagio));
    const ganhas = opsFiltradas.filter((o) => o.estagio === "ganha");
    const perdidas = opsFiltradas.filter((o) => o.estagio === "perdida");

    const pipelineAberto = abertas.reduce((acc, o) => acc + valorNum(o.valor_estimado), 0);
    const forecastPonderado = abertas.reduce(
      (acc, o) =>
        acc + valorNum(o.valor_estimado) * (CONFIG_ESTAGIOS[o.estagio]?.probabilidade ?? 0),
      0,
    );
    const totalGanho = ganhas.reduce((acc, o) => acc + valorNum(o.valor_estimado), 0);
    const fechadasCount = ganhas.length + perdidas.length;
    const taxaConversao = fechadasCount > 0 ? Math.round((ganhas.length / fechadasCount) * 100) : 0;
    const emAtencao = abertas.filter((o) => {
      const s = avaliarSaudeNegocio(o).status;
      return s === "atrasada" || s === "estagnada";
    }).length;

    return {
      abertasCount: abertas.length,
      ganhasCount: ganhas.length,
      perdidasCount: perdidas.length,
      pipelineAberto,
      forecastPonderado,
      totalGanho,
      taxaConversao,
      emAtencao,
    };
  }, [opsFiltradas]);

  const estagiosVisiveis = useMemo(
    () => (ocultarFechadas ? ESTAGIOS.filter((e) => e !== "ganha" && e !== "perdida") : ESTAGIOS),
    [ocultarFechadas],
  );

  const [board, setBoard] = useState<BoardData | null>(null);
  useEffect(() => {
    setBoard(buildBoard(opsFiltradas, estagiosVisiveis, ordemIntraColuna));
  }, [opsFiltradas, estagiosVisiveis, ordemIntraColuna]);

  const marcarSalvando = (id: number, ativo: boolean) => {
    setSalvandoIds((prev) => {
      const next = new Set(prev);
      if (ativo) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const moverPara = async (o: Oportunidade, para: EstagioOportunidade, motivo?: string) => {
    const estagioAnterior = o.estagio;
    setOps((lista) =>
      lista.map((item) =>
        item.id === o.id
          ? {
              ...item,
              estagio: para,
              motivo_perda: para === "perdida" ? (motivo ?? null) : null,
              updated_at: new Date().toISOString(),
            }
          : item,
      ),
    );
    marcarSalvando(o.id, true);
    try {
      const atual = await crmService.moverEstagio(o.id, para, motivo);
      setOps((l) => l.map((x) => (x.id === atual.id ? atual : x)));
      toast.success(`${o.titulo} → ${statusLabel(para)}`);
    } catch {
      setOps((lista) =>
        lista.map((item) => (item.id === o.id ? { ...item, estagio: estagioAnterior } : item)),
      );
      toast.error("Transição recusada pelo backend.");
    } finally {
      marcarSalvando(o.id, false);
    }
  };

  const iniciarTransicao = (o: Oportunidade, para: EstagioOportunidade, move?: DropCardParams) => {
    if (!podeEditar) {
      toast.error("Sem permissão para movimentar oportunidades.");
      return;
    }
    if (o.estagio === para) return;
    if (para === "perdida") {
      setMotivoPerda(o.motivo_perda ?? "");
      setPerda({ o, move });
      return;
    }
    if (move && board) {
      setBoard(dropHandler(move, board));
    }
    void moverPara(o, para);
  };

  const onCardMove = (move: DropCardParams) => {
    const o = ops.find((x) => x.id === opIdDe(move.cardId));
    const para = estagioDe(move.toColumnId);
    if (!o || !board) return;

    if (o.estagio === para) {
      const novoBoard = dropHandler(move, board);
      setBoard(novoBoard);
      const col = novoBoard[move.toColumnId];
      if (col?.children) {
        setOrdemIntraColuna((prev) => ({
          ...prev,
          [move.toColumnId]: [...col.children],
        }));
      }
      return;
    }

    iniciarTransicao(o, para, move);
  };

  const confirmarPerda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perda || !motivoPerda.trim()) return;
    if (perda.move && board) {
      setBoard(dropHandler(perda.move, board));
    }
    const alvo = perda.o;
    const motivo = motivoPerda.trim();
    setPerda(null);
    setMotivoPerda("");
    await moverPara(alvo, "perdida", motivo);
  };

  const abrirModalNovo = (estagio: EstagioOportunidade = "lead") => {
    setEstagioInicialNovo(estagio);
    setFNovo({
      titulo: "",
      empresa_id: "",
      contato_id: "",
      responsavel_id: String(user?.id ?? ""),
      valor_estimado: "",
      origem: "",
      data_prevista_fechamento: "",
      descricao: "",
    });
    setNovoOpen(true);
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fNovo.empresa_id || !fNovo.titulo.trim()) return;
    try {
      const responsavelId = Number(fNovo.responsavel_id) || user?.id || 1;
      let criada = await crmService.criarOportunidade({
        titulo: fNovo.titulo.trim(),
        empresa_id: Number(fNovo.empresa_id),
        contato_id: fNovo.contato_id ? Number(fNovo.contato_id) : null,
        responsavel_id: responsavelId,
        valor_estimado: fNovo.valor_estimado ? fNovo.valor_estimado : null,
        origem: fNovo.origem || null,
        data_prevista_fechamento: fNovo.data_prevista_fechamento || null,
        descricao: fNovo.descricao.trim() || null,
      });

      if (estagioInicialNovo !== "lead" && estagioInicialNovo !== "perdida") {
        criada = await crmService.moverEstagio(criada.id, estagioInicialNovo).catch(() => criada);
      }

      setNovoOpen(false);
      setOps((prev) => [criada, ...prev]);
      toast.success("Oportunidade criada.");
    } catch {
      toast.error("Falha ao criar oportunidade.");
    }
  };

  const contatosDaEmpresaNovo = useMemo(() => {
    if (!fNovo.empresa_id) return [];
    const empId = Number(fNovo.empresa_id);
    return contatos.filter((c) => c.empresa_id === empId);
  }, [contatos, fNovo.empresa_id]);

  const selecionada = useMemo(
    () => ops.find((o) => o.id === selecionadaId) ?? null,
    [ops, selecionadaId],
  );

  const temFiltrosAtivos =
    busca.trim() !== "" ||
    filtroOrigem !== "" ||
    filtroResponsavel !== "todos" ||
    filtroPrazo !== "todos" ||
    ocultarFechadas;

  const limparFiltros = () => {
    setBusca("");
    setFiltroOrigem("");
    setFiltroResponsavel("todos");
    setFiltroPrazo("todos");
    setOcultarFechadas(false);
  };

  return (
    <AppShell>
      <PageHeader
        title="Oportunidades"
        subtitle={`Pipeline aberto: ${brl(metricas.pipelineAberto.toFixed(2))} · Ponderado: ${brl(metricas.forecastPonderado.toFixed(2))} · Ganho: ${brl(metricas.totalGanho.toFixed(2))} (${metricas.taxaConversao}%)`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-border bg-card p-1 text-xs">
              <button
                type="button"
                onClick={() => setModoVisao("kanban")}
                className={`rounded-full  px-3 py-1 font-medium transition ${
                  modoVisao === "kanban"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => setModoVisao("lista")}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  modoVisao === "lista"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Lista
              </button>
            </div>

            {podeEditar && (
              <button
                type="button"
                onClick={() => abrirModalNovo("lead")}
                className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                + Oportunidade
              </button>
            )}
          </div>
        }
      />

      {/* Barra de controles minimalista */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar oportunidade ou empresa…"
              className="w-full bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="inline-flex items-center rounded-2xl border border-border bg-card p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFiltroResponsavel("todos")}
              className={`rounded-xl px-2.5 py-1 font-medium transition ${
                filtroResponsavel === "todos"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setFiltroResponsavel("meus")}
              className={`rounded-xl px-2.5 py-1 font-medium transition ${
                filtroResponsavel === "meus"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Minhas
            </button>
          </div>

          <select
            aria-label="Origem"
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
            className="rounded-2xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="">Origem: todas</option>
            <option value="site">Site</option>
            <option value="telefone">Telefone</option>
            <option value="indicacao">Indicação</option>
            <option value="prospeccao">Prospecção</option>
            <option value="ecommerce">E-commerce</option>
            <option value="outro">Outro</option>
          </select>

          <select
            aria-label="Prazo"
            value={filtroPrazo}
            onChange={(e) => setFiltroPrazo(e.target.value as FiltroPrazo)}
            className="rounded-2xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="todos">Prazo: todos</option>
            <option value="atrasadas">Atrasadas ({metricas.emAtencao})</option>
            <option value="semana">Próximos 7 dias</option>
            <option value="estagnadas">Estagnadas</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Ordenar"
            value={ordenacao}
            onChange={(e) => {
              setOrdenacao(e.target.value as OrdenacaoFunil);
              setOrdemIntraColuna({});
            }}
            className="rounded-2xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="relevancia">Ordenar: Prioridade</option>
            <option value="maior_valor">Ordenar: Maior valor</option>
            <option value="fechamento">Ordenar: Fechamento</option>
            <option value="recentes">Ordenar: Recentes</option>
          </select>

          <button
            type="button"
            onClick={() => setOcultarFechadas((v) => !v)}
            className={`rounded-2xl border px-3 py-1.5 text-xs font-medium transition ${
              ocultarFechadas
                ? "border-primary/40 bg-secondary text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {ocultarFechadas ? "Mostrar fechadas" : "Ocultar fechadas"}
          </button>

          {temFiltrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className="px-2 py-1 text-xs font-medium text-[#D92546] hover:underline"
            >
              Limpar
            </button>
          )}

          <button
            type="button"
            onClick={() => void carregar()}
            aria-label="Atualizar"
            className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Visão 1: Kanban Minimalista */}
      {modoVisao === "kanban" && board && (
        <div className="h-[calc(100dvh-11.5rem)] min-h-96">
          <Kanban
            dataSource={board}
            virtualization={false}
            allowColumnDrag={false}
            cardsGap={8}
            onCardMove={onCardMove}
            onCardClick={(e, card) => {
              const target = e.target as HTMLElement;
              if (target.closest("[data-no-card-open]")) return;
              const o = card.content as Oportunidade;
              if (o) setSelecionadaId(o.id);
            }}
            rootClassName="rkk-root"
            columnWrapperClassName={(col) =>
              `rounded-3xl border border-border bg-white dark:bg-zinc-900 ${
                estagioDe(col.id) === "perdida" ? "border-[#D92546]/20" : ""
              }`
            }
            columnClassName={() => "rounded-3xl h-full"}
            columnListContentClassName={() => "min-h-24 px-2 pb-2.5"}
            cardWrapperClassName="group/card"
            renderColumnHeader={(col) => {
              const est = estagioDe(col.id);
              const cfg = CONFIG_ESTAGIOS[est] ?? CONFIG_ESTAGIOS.lead;
              const meta = (col.content ?? { somaBruta: 0 }) as {
                somaBruta: number;
                somaPonderada: number;
              };

              return (
                <div className="px-3 pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusPill status={est} label={cfg.titulo} />
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {col.totalChildrenCount}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {meta.somaBruta > 0 && (
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {brl(meta.somaBruta.toFixed(2))}
                        </span>
                      )}
                      {podeEditar && est !== "perdida" && est !== "ganha" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirModalNovo(est);
                          }}
                          title={`Adicionar em ${cfg.titulo}`}
                          className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition hover:bg-card hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
            renderListFooter={(col) => {
              if (col.totalChildrenCount > 0) return null;
              return (
                <div className="my-1.5 rounded-2xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground/70">
                  Sem oportunidades
                </div>
              );
            }}
            allowListFooter={(col) => col.totalChildrenCount === 0}
            configMap={{
              card: {
                isDraggable: podeEditar,
                render: ({ data }: { data: BoardItemT }) => {
                  const o = data.content as Oportunidade;
                  return (
                    <DealKanbanCard
                      oportunidade={o}
                      empresaNome={empresaNome(o.empresa_id)}
                      responsavelNome={responsavelNome(o.responsavel_id)}
                      salvando={salvandoIds.has(o.id)}
                      podeEditar={podeEditar}
                      onOpen={() => setSelecionadaId(o.id)}
                      onMover={(para) => iniciarTransicao(o, para)}
                    />
                  );
                },
              },
            }}
          />
        </div>
      )}

      {/* Visão 2: Lista Simples */}
      {modoVisao === "lista" && (
        <SectionCard className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Estágio</th>
                  <th className="px-4 py-3 font-semibold">Previsão</th>
                  <th className="px-4 py-3 font-semibold">Origem</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor est.</th>
                  <th className="px-4 py-3 text-right font-semibold" />
                </tr>
              </thead>
              <tbody>
                {opsFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma oportunidade encontrada.
                    </td>
                  </tr>
                ) : (
                  opsFiltradas.map((o) => {
                    const cfg = CONFIG_ESTAGIOS[o.estagio] ?? CONFIG_ESTAGIOS.lead;
                    const saude = avaliarSaudeNegocio(o);
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelecionadaId(o.id)}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                      >
                        <td className="px-4 py-3 font-medium">{o.titulo}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {empresaNome(o.empresa_id)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={o.estagio} label={cfg.titulo} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className={
                              saude.status === "atrasada"
                                ? "font-semibold text-[#D92546]"
                                : saude.status === "urgente" || saude.status === "estagnada"
                                  ? "font-medium text-[#D9486E]"
                                  : "text-muted-foreground"
                            }
                          >
                            {o.data_prevista_fechamento
                              ? `${fmtData(o.data_prevista_fechamento)} (${saude.rotulo})`
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {o.origem ? (ORIGEM_LABELS[o.origem] ?? o.origem) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {o.valor_estimado != null ? brl(o.valor_estimado) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {podeEditar && cfg.proximo && (
                            <button
                              type="button"
                              onClick={() => iniciarTransicao(o, cfg.proximo!)}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                            >
                              {cfg.rotuloAvancar}
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Modal: Nova Oportunidade */}
      <FormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        title="Nova oportunidade"
        description={`Estágio inicial: ${statusLabel(estagioInicialNovo)}`}
        submitLabel="Criar"
        onSubmit={criar}
      >
        <FormField label="Título" wide>
          <input
            className={fieldClass}
            required
            value={fNovo.titulo}
            onChange={(e) => setFNovo({ ...fNovo, titulo: e.target.value })}
          />
        </FormField>
        <FormField label="Empresa">
          <select
            className={fieldClass}
            required
            value={fNovo.empresa_id}
            onChange={(e) => setFNovo({ ...fNovo, empresa_id: e.target.value, contato_id: "" })}
          >
            <option value="">—</option>
            {[...empresas.values()].map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nome_fantasia || emp.razao_social}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Contato">
          <select
            className={fieldClass}
            value={fNovo.contato_id}
            onChange={(e) => setFNovo({ ...fNovo, contato_id: e.target.value })}
            disabled={!fNovo.empresa_id}
          >
            <option value="">—</option>
            {contatosDaEmpresaNovo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Valor estimado">
          <input
            className={fieldClass}
            type="number"
            step="0.01"
            min="0"
            value={fNovo.valor_estimado}
            onChange={(e) => setFNovo({ ...fNovo, valor_estimado: e.target.value })}
          />
        </FormField>
        <FormField label="Previsão de fechamento">
          <input
            className={fieldClass}
            type="date"
            value={fNovo.data_prevista_fechamento}
            onChange={(e) => setFNovo({ ...fNovo, data_prevista_fechamento: e.target.value })}
          />
        </FormField>
        <FormField label="Origem">
          <select
            className={fieldClass}
            value={fNovo.origem}
            onChange={(e) => setFNovo({ ...fNovo, origem: e.target.value })}
          >
            <option value="">—</option>
            <option value="site">Site</option>
            <option value="telefone">Telefone</option>
            <option value="indicacao">Indicação</option>
            <option value="prospeccao">Prospecção</option>
            <option value="ecommerce">E-commerce</option>
            <option value="outro">Outro</option>
          </select>
        </FormField>
        <FormField label="Estágio">
          <select
            className={fieldClass}
            value={estagioInicialNovo}
            onChange={(e) => setEstagioInicialNovo(e.target.value as EstagioOportunidade)}
          >
            {ESTAGIOS.filter((e) => e !== "perdida").map((est) => (
              <option key={est} value={est}>
                {statusLabel(est)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Observações" wide>
          <textarea
            className={fieldClass}
            rows={2}
            value={fNovo.descricao}
            onChange={(e) => setFNovo({ ...fNovo, descricao: e.target.value })}
          />
        </FormField>
      </FormDialog>

      {/* Modal: Motivo da Perda */}
      <FormDialog
        open={perda !== null}
        onOpenChange={(o) => !o && setPerda(null)}
        title="Motivo da perda"
        description={perda?.o.titulo ?? ""}
        submitLabel="Marcar como perdida"
        onSubmit={confirmarPerda}
      >
        <div className="sm:col-span-2 flex flex-wrap gap-1.5">
          {MOTIVOS_PERDA_SUGERIDOS.map((sugestao) => (
            <button
              key={sugestao}
              type="button"
              onClick={() => setMotivoPerda(sugestao)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                motivoPerda === sugestao
                  ? "border-[#D92546] bg-[#D92546]/10 font-medium text-[#D92546]"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {sugestao}
            </button>
          ))}
        </div>
        <FormField label="Motivo (obrigatório)" wide>
          <input
            className={fieldClass}
            required
            value={motivoPerda}
            onChange={(e) => setMotivoPerda(e.target.value)}
          />
        </FormField>
      </FormDialog>

      {/* Gaveta Lateral da Oportunidade */}
      <OportunidadeSheet
        oportunidade={selecionada}
        empresas={empresas}
        contatos={contatos}
        responsavelNome={selecionada ? responsavelNome(selecionada.responsavel_id) : ""}
        podeEditar={podeEditar}
        onClose={() => setSelecionadaId(null)}
        onUpdated={(atualizada) => {
          setOps((prev) => prev.map((x) => (x.id === atualizada.id ? atualizada : x)));
        }}
        onMoverEstagio={(op, para) => iniciarTransicao(op, para)}
      />
    </AppShell>
  );
}

/* ---------------------------------------------------------------------------
 * Card do Kanban — Minimalista, limpo e direto
 * ------------------------------------------------------------------------- */

function DealKanbanCard({
  oportunidade: o,
  empresaNome,
  responsavelNome,
  salvando,
  podeEditar,
  onOpen,
  onMover,
}: {
  oportunidade: Oportunidade;
  empresaNome: string;
  responsavelNome: string;
  salvando: boolean;
  podeEditar: boolean;
  onOpen: () => void;
  onMover: (para: EstagioOportunidade) => void;
}) {
  const cfg = CONFIG_ESTAGIOS[o.estagio] ?? CONFIG_ESTAGIOS.lead;
  const saude = avaliarSaudeNegocio(o);
  const val = valorNum(o.valor_estimado);

  return (
    <div
      className={`group rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 ${
        podeEditar ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {o.titulo}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{empresaNome}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1" data-no-card-open>
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label="Opções"
                className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-2xl">
              <DropdownMenuItem onSelect={onOpen}>Editar detalhes</DropdownMenuItem>
              {podeEditar && cfg.proximo && (
                <DropdownMenuItem onSelect={() => onMover(cfg.proximo!)}>
                  Avançar para {statusLabel(cfg.proximo)}
                </DropdownMenuItem>
              )}
              {podeEditar && (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="rounded-2xl">
                      {ESTAGIOS.map((est) => (
                        <DropdownMenuItem
                          key={est}
                          disabled={est === o.estagio}
                          onSelect={() => onMover(est)}
                        >
                          {statusLabel(est)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  {o.estagio !== "ganha" && (
                    <DropdownMenuItem onSelect={() => onMover("ganha")}>
                      Marcar como ganha
                    </DropdownMenuItem>
                  )}
                  {o.estagio !== "perdida" && (
                    <DropdownMenuItem
                      onSelect={() => onMover("perdida")}
                      className="text-[#D92546]"
                    >
                      Marcar como perdida…
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {o.estagio === "perdida" && o.motivo_perda && (
        <p className="mt-2 truncate text-[11px] text-[#D92546]">{o.motivo_perda}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 pt-0.5 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {(o.data_prevista_fechamento ||
            saude.status === "atrasada" ||
            saude.status === "estagnada") && (
            <span
              className={`truncate text-[11px] ${
                saude.status === "atrasada"
                  ? "font-semibold text-[#D92546]"
                  : saude.status === "urgente" || saude.status === "estagnada"
                    ? "font-medium text-[#D9486E]"
                    : "text-muted-foreground"
              }`}
            >
              {saude.rotulo}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-semibold tabular-nums text-foreground">
            {val > 0 ? brl(o.valor_estimado) : "—"}
          </span>
          <span
            className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[9px] font-bold text-muted-foreground"
            title={`Responsável: ${responsavelNome}`}
          >
            {iniciais(responsavelNome)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Gaveta Lateral da Oportunidade (Edição, Timeline e Orçamentos)
 * ------------------------------------------------------------------------- */

function OportunidadeSheet({
  oportunidade,
  empresas,
  contatos,
  responsavelNome,
  podeEditar,
  onClose,
  onUpdated,
  onMoverEstagio,
}: {
  oportunidade: Oportunidade | null;
  empresas: Map<number, Empresa>;
  contatos: Contato[];
  responsavelNome: string;
  podeEditar: boolean;
  onClose: () => void;
  onUpdated: (o: Oportunidade) => void;
  onMoverEstagio: (o: Oportunidade, para: EstagioOportunidade) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(false);

  const [fEdit, setFEdit] = useState({
    titulo: "",
    empresa_id: "",
    contato_id: "",
    valor_estimado: "",
    origem: "",
    data_prevista_fechamento: "",
    descricao: "",
  });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [fInteracao, setFInteracao] = useState({
    tipo: "ligacao",
    assunto: "",
    descricao: "",
    proxima_acao: "",
    proxima_acao_em: "",
  });
  const [salvandoInteracao, setSalvandoInteracao] = useState(false);

  const [novoOrcOpen, setNovoOrcOpen] = useState(false);
  const [fOrc, setFOrc] = useState({
    produto_id: "",
    quantidade: "1",
    preco_unitario: "",
    desconto: "0",
    frete: "0",
    valido_ate: "",
    condicao_pagamento: "30 dias",
    observacoes: "",
  });
  const [criandoOrc, setCriandoOrc] = useState(false);

  const carregarContexto = useCallback(async (op: Oportunidade) => {
    setCarregandoDados(true);
    try {
      const [pInt, pOrc] = await Promise.all([
        crmService
          .timeline({ oportunidade_id: op.id, por_pagina: 50 })
          .catch(() => ({ itens: [] })),
        orcamentosService
          .listar({ oportunidade_id: op.id, por_pagina: 50 })
          .catch(() => ({ itens: [] as Orcamento[] })),
      ]);
      setInteracoes(pInt.itens as unknown as Interacao[]);
      setOrcamentos(pOrc.itens);
    } finally {
      setCarregandoDados(false);
    }
  }, []);

  useEffect(() => {
    if (!oportunidade) return;
    setFEdit({
      titulo: oportunidade.titulo,
      empresa_id: String(oportunidade.empresa_id),
      contato_id: oportunidade.contato_id ? String(oportunidade.contato_id) : "",
      valor_estimado: oportunidade.valor_estimado ?? "",
      origem: oportunidade.origem ?? "",
      data_prevista_fechamento: oportunidade.data_prevista_fechamento
        ? oportunidade.data_prevista_fechamento.slice(0, 10)
        : "",
      descricao: oportunidade.descricao ?? "",
    });
    void carregarContexto(oportunidade);
  }, [oportunidade, carregarContexto]);

  useEffect(() => {
    if (novoOrcOpen && produtos.length === 0) {
      catalogoService
        .produtos({ por_pagina: 100, ativo: true })
        .then((p) => setProdutos(p.itens))
        .catch(() => toast.error("Falha ao carregar produtos para o orçamento."));
    }
  }, [novoOrcOpen, produtos.length]);

  if (!oportunidade) {
    return <Sheet open={false} onOpenChange={() => onClose()} />;
  }

  const empresa = empresas.get(oportunidade.empresa_id);
  const nomeEmpresa = empresa
    ? empresa.nome_fantasia || empresa.razao_social
    : `Empresa #${oportunidade.empresa_id}`;
  const contatosEmpresa = contatos.filter((c) => c.empresa_id === Number(fEdit.empresa_id));
  const cfg = CONFIG_ESTAGIOS[oportunidade.estagio] ?? CONFIG_ESTAGIOS.lead;

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEditar) return;
    setSalvandoEdicao(true);
    try {
      const atualizada = await crmService.atualizarOportunidade(oportunidade.id, {
        titulo: fEdit.titulo.trim(),
        empresa_id: Number(fEdit.empresa_id),
        contato_id: fEdit.contato_id ? Number(fEdit.contato_id) : null,
        responsavel_id: oportunidade.responsavel_id,
        valor_estimado: fEdit.valor_estimado ? fEdit.valor_estimado : null,
        origem: fEdit.origem || null,
        data_prevista_fechamento: fEdit.data_prevista_fechamento || null,
        descricao: fEdit.descricao.trim() || null,
      });
      onUpdated(atualizada);
      toast.success("Oportunidade atualizada.");
    } catch {
      toast.error("Falha ao atualizar oportunidade.");
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const registrarInteracao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fInteracao.assunto.trim() && !fInteracao.descricao.trim()) return;
    setSalvandoInteracao(true);
    try {
      await crmService.registrarInteracao({
        empresa_id: oportunidade.empresa_id,
        contato_id: oportunidade.contato_id,
        oportunidade_id: oportunidade.id,
        tipo: fInteracao.tipo,
        assunto: fInteracao.assunto.trim() || null,
        descricao: fInteracao.descricao.trim() || null,
        proxima_acao: fInteracao.proxima_acao.trim() || null,
        proxima_acao_em: fInteracao.proxima_acao_em
          ? new Date(fInteracao.proxima_acao_em).toISOString()
          : null,
      });
      setFInteracao({
        tipo: "ligacao",
        assunto: "",
        descricao: "",
        proxima_acao: "",
        proxima_acao_em: "",
      });
      await carregarContexto(oportunidade);
      toast.success("Interação registrada.");
    } catch {
      toast.error("Falha ao registrar interação.");
    } finally {
      setSalvandoInteracao(false);
    }
  };

  const selecionarProdutoOrc = (prodId: string) => {
    const p = produtos.find((x) => x.id === Number(prodId));
    setFOrc((prev) => ({
      ...prev,
      produto_id: prodId,
      preco_unitario: p ? p.preco_venda : prev.preco_unitario,
    }));
  };

  const gerarOrcamento = async (e: React.FormEvent) => {
    e.preventDefault();
    const prod = produtos.find((x) => x.id === Number(fOrc.produto_id));
    if (!prod) return;
    setCriandoOrc(true);
    try {
      const novoOrc = await orcamentosService.criar({
        empresa_id: oportunidade.empresa_id,
        contato_id: oportunidade.contato_id,
        oportunidade_id: oportunidade.id,
        vendedor_id: user?.id || oportunidade.responsavel_id,
        valido_ate: fOrc.valido_ate || null,
        desconto: fOrc.desconto || "0",
        frete: fOrc.frete || "0",
        condicao_pagamento: fOrc.condicao_pagamento.trim() || null,
        observacoes: fOrc.observacoes.trim() || oportunidade.descricao || null,
        itens: [
          {
            produto_id: prod.id,
            descricao: prod.nome,
            quantidade: String(fOrc.quantidade || "1"),
            preco_unitario: String(fOrc.preco_unitario || prod.preco_venda),
            desconto: "0",
          },
        ],
      });

      if (oportunidade.estagio === "lead" || oportunidade.estagio === "qualificacao") {
        crmService
          .moverEstagio(oportunidade.id, "proposta")
          .then(onUpdated)
          .catch(() =>
            toast.warning("Orçamento criado, mas o estágio não avançou — mova manualmente."),
          );
      }

      setNovoOrcOpen(false);
      toast.success(`Orçamento #${novoOrc.id} criado.`);
      onClose();
      navigate({ to: `/vendas/orcamentos/${novoOrc.id}` as "/" });
    } catch {
      toast.error("Falha ao criar orçamento.");
    } finally {
      setCriandoOrc(false);
    }
  };

  return (
    <Sheet open={Boolean(oportunidade)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-6 pt-6 pb-4 text-left">
          <div className="flex items-center gap-2 pr-8">
            <StatusPill status={oportunidade.estagio} label={cfg.titulo} />
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {oportunidade.valor_estimado ? brl(oportunidade.valor_estimado) : "—"}
            </span>
          </div>

          <SheetTitle className="mt-1.5 text-lg font-bold tracking-tight">
            {oportunidade.titulo}
          </SheetTitle>

          <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              to={`/crm/empresas/${oportunidade.empresa_id}` as "/"}
              onClick={onClose}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {nomeEmpresa}
              <ExternalLink className="h-3 w-3" />
            </Link>
            <span>·</span>
            <span>Resp.: {responsavelNome}</span>
          </SheetDescription>

          {/* Seletor enxuto de estágios */}
          <div className="mt-3 flex flex-wrap gap-1">
            {ESTAGIOS.map((est) => {
              const ativo = oportunidade.estagio === est;
              return (
                <button
                  key={est}
                  type="button"
                  disabled={!podeEditar || ativo}
                  onClick={() => onMoverEstagio(oportunidade, est)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    ativo
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {CONFIG_ESTAGIOS[est].titulo}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Tabs defaultValue="detalhes">
            <TabsList className="rounded-2xl bg-secondary/60 p-1">
              <TabsTrigger value="detalhes" className="rounded-xl text-xs">
                Dados
              </TabsTrigger>
              <TabsTrigger value="timeline" className="rounded-xl text-xs">
                Timeline ({interacoes.length})
              </TabsTrigger>
              <TabsTrigger value="orcamentos" className="rounded-xl text-xs">
                Orçamentos ({orcamentos.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="detalhes" className="mt-4 space-y-4">
              {oportunidade.estagio === "perdida" && oportunidade.motivo_perda && (
                <div className="rounded-2xl border border-[#D92546]/30 bg-[#D92546]/10 p-3 text-xs text-[#D92546]">
                  Motivo da perda: {oportunidade.motivo_perda}
                </div>
              )}

              <form onSubmit={salvarEdicao} className="grid gap-4 sm:grid-cols-2">
                <FormField label="Título" wide>
                  <input
                    className={fieldClass}
                    required
                    disabled={!podeEditar}
                    value={fEdit.titulo}
                    onChange={(e) => setFEdit({ ...fEdit, titulo: e.target.value })}
                  />
                </FormField>

                <FormField label="Empresa">
                  <select
                    className={fieldClass}
                    disabled={!podeEditar}
                    value={fEdit.empresa_id}
                    onChange={(e) =>
                      setFEdit({ ...fEdit, empresa_id: e.target.value, contato_id: "" })
                    }
                  >
                    {[...empresas.values()].map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nome_fantasia || emp.razao_social}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Contato">
                  <select
                    className={fieldClass}
                    disabled={!podeEditar}
                    value={fEdit.contato_id}
                    onChange={(e) => setFEdit({ ...fEdit, contato_id: e.target.value })}
                  >
                    <option value="">—</option>
                    {contatosEmpresa.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Valor estimado">
                  <input
                    className={fieldClass}
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!podeEditar}
                    value={fEdit.valor_estimado}
                    onChange={(e) => setFEdit({ ...fEdit, valor_estimado: e.target.value })}
                  />
                </FormField>

                <FormField label="Previsão de fechamento">
                  <input
                    className={fieldClass}
                    type="date"
                    disabled={!podeEditar}
                    value={fEdit.data_prevista_fechamento}
                    onChange={(e) =>
                      setFEdit({ ...fEdit, data_prevista_fechamento: e.target.value })
                    }
                  />
                </FormField>

                <FormField label="Origem" wide>
                  <select
                    className={fieldClass}
                    disabled={!podeEditar}
                    value={fEdit.origem}
                    onChange={(e) => setFEdit({ ...fEdit, origem: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="site">Site</option>
                    <option value="telefone">Telefone</option>
                    <option value="indicacao">Indicação</option>
                    <option value="prospeccao">Prospecção</option>
                    <option value="ecommerce">E-commerce</option>
                    <option value="outro">Outro</option>
                  </select>
                </FormField>

                <FormField label="Descrição / Observações" wide>
                  <textarea
                    className={fieldClass}
                    rows={3}
                    disabled={!podeEditar}
                    value={fEdit.descricao}
                    onChange={(e) => setFEdit({ ...fEdit, descricao: e.target.value })}
                  />
                </FormField>

                {podeEditar && (
                  <div className="flex justify-end sm:col-span-2">
                    <button
                      type="submit"
                      disabled={salvandoEdicao}
                      className="rounded-full bg-lime px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {salvandoEdicao ? "Salvando…" : "Salvar"}
                    </button>
                  </div>
                )}
              </form>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4 space-y-4">
              {podeEditar && (
                <form
                  onSubmit={registrarInteracao}
                  className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2"
                >
                  <FormField label="Tipo">
                    <select
                      className={fieldClass}
                      value={fInteracao.tipo}
                      onChange={(e) => setFInteracao({ ...fInteracao, tipo: e.target.value })}
                    >
                      <option value="ligacao">Ligação</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">E-mail</option>
                      <option value="reuniao">Reunião</option>
                      <option value="visita">Visita</option>
                      <option value="nota_interna">Nota interna</option>
                      <option value="outro">Outro</option>
                    </select>
                  </FormField>
                  <FormField label="Assunto">
                    <input
                      className={fieldClass}
                      value={fInteracao.assunto}
                      onChange={(e) => setFInteracao({ ...fInteracao, assunto: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Descrição" wide>
                    <textarea
                      className={fieldClass}
                      rows={2}
                      required={!fInteracao.assunto.trim()}
                      value={fInteracao.descricao}
                      onChange={(e) => setFInteracao({ ...fInteracao, descricao: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Próxima ação">
                    <input
                      className={fieldClass}
                      value={fInteracao.proxima_acao}
                      onChange={(e) =>
                        setFInteracao({ ...fInteracao, proxima_acao: e.target.value })
                      }
                    />
                  </FormField>
                  <FormField label="Data da próxima ação">
                    <input
                      className={fieldClass}
                      type="datetime-local"
                      required={Boolean(fInteracao.proxima_acao.trim())}
                      value={fInteracao.proxima_acao_em}
                      onChange={(e) =>
                        setFInteracao({ ...fInteracao, proxima_acao_em: e.target.value })
                      }
                    />
                  </FormField>
                  <div className="flex justify-end sm:col-span-2">
                    <button
                      type="submit"
                      disabled={salvandoInteracao}
                      className="rounded-full bg-lime px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {salvandoInteracao ? "Registrando…" : "Registrar"}
                    </button>
                  </div>
                </form>
              )}

              {carregandoDados ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Carregando…</p>
              ) : interacoes.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma interação.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {interacoes.map((item) => (
                    <li key={item.id} className="py-3 text-xs">
                      <div className="flex items-center justify-between">
                        <strong className="capitalize">
                          {item.assunto || String(item.tipo).replaceAll("_", " ")}
                        </strong>
                        <span className="text-muted-foreground">
                          {fmtDataHora(item.ocorrido_em || item.created_at)}
                        </span>
                      </div>
                      {item.descricao && (
                        <p className="mt-1 text-muted-foreground">{item.descricao}</p>
                      )}
                      {item.proxima_acao && (
                        <p className="mt-1 font-medium text-[#D9486E]">
                          Próxima ação: {item.proxima_acao}
                          {item.proxima_acao_em ? ` (${fmtDataHora(item.proxima_acao_em)})` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="orcamentos" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Orçamentos vinculados</span>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => setNovoOrcOpen((v) => !v)}
                    className="rounded-full bg-lime px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    {novoOrcOpen ? "Fechar" : "+ Orçamento"}
                  </button>
                )}
              </div>

              {novoOrcOpen && (
                <form
                  onSubmit={gerarOrcamento}
                  className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2"
                >
                  <FormField label="Produto inicial" wide>
                    <select
                      className={fieldClass}
                      required
                      value={fOrc.produto_id}
                      onChange={(e) => selecionarProdutoOrc(e.target.value)}
                    >
                      <option value="">—</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} · {p.nome} ({brl(p.preco_venda)})
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Quantidade">
                    <input
                      className={fieldClass}
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={fOrc.quantidade}
                      onChange={(e) => setFOrc({ ...fOrc, quantidade: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Preço unitário">
                    <input
                      className={fieldClass}
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={fOrc.preco_unitario}
                      onChange={(e) => setFOrc({ ...fOrc, preco_unitario: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Validade">
                    <input
                      className={fieldClass}
                      type="date"
                      value={fOrc.valido_ate}
                      onChange={(e) => setFOrc({ ...fOrc, valido_ate: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Condição de pagamento">
                    <input
                      className={fieldClass}
                      value={fOrc.condicao_pagamento}
                      onChange={(e) => setFOrc({ ...fOrc, condicao_pagamento: e.target.value })}
                    />
                  </FormField>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={criandoOrc}
                      className="rounded-full bg-lime px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {criandoOrc ? "Criando…" : "Criar orçamento"}
                    </button>
                  </div>
                </form>
              )}

              {orcamentos.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum orçamento vinculado.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {orcamentos.map((orc) => (
                    <li key={orc.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">#{orc.numero || orc.id}</span>
                          <StatusPill status={orc.status} label={statusLabel(orc.status)} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Validade: {orc.valido_ate ? fmtData(orc.valido_ate) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">{brl(orc.total)}</span>
                        <Link
                          to={`/vendas/orcamentos/${orc.id}` as "/"}
                          onClick={onClose}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Abrir <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
