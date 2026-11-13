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
import { toast } from "@/components/ui/sonner";

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
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import MenuItem from "@mui/material/MenuItem";
import { DateField, DateTimeField } from "@/components/ui-kit/DateField";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Box from "@mui/material/Box";

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
    <>
      <PageHeader
        title="Oportunidades"
        subtitle={`Pipeline aberto: ${brl(metricas.pipelineAberto.toFixed(2))} · Ponderado: ${brl(metricas.forecastPonderado.toFixed(2))} · Ganho: ${brl(metricas.totalGanho.toFixed(2))} (${metricas.taxaConversao}%)`}
        action={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <ToggleButtonGroup
              size="small"
              exclusive
              value={modoVisao}
              onChange={(_, v) => v && setModoVisao(v)}
              sx={{ "& .MuiToggleButton-root": { px: 1.5, py: 0.25, fontSize: 12 } }}
            >
              <ToggleButton value="kanban">Kanban</ToggleButton>
              <ToggleButton value="lista">Lista</ToggleButton>
            </ToggleButtonGroup>

            {podeEditar && (
              <Button variant="contained" size="small" onClick={() => abrirModalNovo("lead")}>
                + Oportunidade
              </Button>
            )}
          </Stack>
        }
      />

      {/* Barra de controles */}
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} alignItems="center" justifyContent="space-between">
        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} alignItems="center" flex={1}>
          <TextField
            size="small"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar oportunidade ou empresa…"
            sx={{ minWidth: 210, flex: { xs: 1, sm: "0 1 auto" } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={14} />
                  </InputAdornment>
                ),
              },
            }}
          />

          <ToggleButtonGroup
            size="small"
            exclusive
            value={filtroResponsavel}
            onChange={(_, v) => v && setFiltroResponsavel(v)}
            sx={{ "& .MuiToggleButton-root": { px: 1.25, py: 0.25, fontSize: 12 } }}
          >
            <ToggleButton value="todos">Todas</ToggleButton>
            <ToggleButton value="meus">Minhas</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            select
            size="small"
            aria-label="Origem"
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
           
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Origem: todas</MenuItem>
            <MenuItem value="site">Site</MenuItem>
            <MenuItem value="telefone">Telefone</MenuItem>
            <MenuItem value="indicacao">Indicação</MenuItem>
            <MenuItem value="prospeccao">Prospecção</MenuItem>
            <MenuItem value="ecommerce">E-commerce</MenuItem>
            <MenuItem value="outro">Outro</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            aria-label="Prazo"
            value={filtroPrazo}
            onChange={(e) => setFiltroPrazo(e.target.value as FiltroPrazo)}
           
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="todos">Prazo: todos</MenuItem>
            <MenuItem value="atrasadas">Atrasadas ({metricas.emAtencao})</MenuItem>
            <MenuItem value="semana">Próximos 7 dias</MenuItem>
            <MenuItem value="estagnadas">Estagnadas</MenuItem>
          </TextField>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            select
            size="small"
            aria-label="Ordenar"
            value={ordenacao}
            onChange={(e) => {
              setOrdenacao(e.target.value as OrdenacaoFunil);
              setOrdemIntraColuna({});
            }}
           
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="relevancia">Ordenar: Prioridade</MenuItem>
            <MenuItem value="maior_valor">Ordenar: Maior valor</MenuItem>
            <MenuItem value="fechamento">Ordenar: Fechamento</MenuItem>
            <MenuItem value="recentes">Ordenar: Recentes</MenuItem>
          </TextField>

          <Button
            size="small"
            variant={ocultarFechadas ? "contained" : "outlined"}
            onClick={() => setOcultarFechadas((v) => !v)}
          >
            {ocultarFechadas ? "Mostrar fechadas" : "Ocultar fechadas"}
          </Button>

          {temFiltrosAtivos && (
            <Button size="small" color="error" onClick={limparFiltros}>
              Limpar
            </Button>
          )}

          <IconButton
            size="small"
            onClick={() => void carregar()}
            aria-label="Atualizar"
            sx={{ border: 1, borderColor: "divider" }}
          >
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
          </IconButton>
        </Stack>
      </Stack>

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
                        <IconButton size="small" type="button" onClick={(e) => {
                            e.stopPropagation();
                            abrirModalNovo(est);
                          }} title={`Adicionar em ${cfg.titulo}`}><Plus className="h-3.5 w-3.5" /></IconButton>
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
            <Table size="small" className="w-full text-sm">
              <TableHead>
                <TableRow >
                  <TableCell >Título</TableCell>
                  <TableCell >Empresa</TableCell>
                  <TableCell >Estágio</TableCell>
                  <TableCell >Previsão</TableCell>
                  <TableCell >Origem</TableCell>
                  <TableCell align="right">Valor est.</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {opsFiltradas.length === 0 ? (
                  <TableRow >
                    <TableCell align="center" colSpan={7}>
                      Nenhuma oportunidade encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  opsFiltradas.map((o) => {
                    const cfg = CONFIG_ESTAGIOS[o.estagio] ?? CONFIG_ESTAGIOS.lead;
                    const saude = avaliarSaudeNegocio(o);
                    return (
                      <TableRow key={o.id} onClick={() => setSelecionadaId(o.id)} sx={{ cursor: "pointer" }} hover>
                        <TableCell >{o.titulo}</TableCell>
                        <TableCell >
                          {empresaNome(o.empresa_id)}
                        </TableCell>
                        <TableCell >
                          <StatusPill status={o.estagio} label={cfg.titulo} />
                        </TableCell>
                        <TableCell >
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
                        </TableCell>
                        <TableCell >
                          {o.origem ? (ORIGEM_LABELS[o.origem] ?? o.origem) : "—"}
                        </TableCell>
                        <TableCell align="right">
                          {o.valor_estimado != null ? brl(o.valor_estimado) : "—"}
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          {podeEditar && cfg.proximo && (
                            <Button variant="outlined" size="small" type="button" onClick={() => iniciarTransicao(o, cfg.proximo!)}>{cfg.rotuloAvancar}
                              <ChevronRight className="h-3 w-3" /></Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
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
          <TextField size="small" fullWidth
            required
            value={fNovo.titulo}
            onChange={(e) => setFNovo({ ...fNovo, titulo: e.target.value })} />
        </FormField>
        <FormField label="Empresa">
          <TextField size="small" fullWidth select
            required
            value={fNovo.empresa_id}
            onChange={(e) => setFNovo({ ...fNovo, empresa_id: e.target.value, contato_id: "" })}>
            <MenuItem value="">—</MenuItem>
            {[...empresas.values()].map((emp) => (
              <MenuItem key={emp.id} value={String(emp.id)}>
                {emp.nome_fantasia || emp.razao_social}
              </MenuItem>
            ))}
          </TextField>
        </FormField>
        <FormField label="Contato">
          <TextField size="small" fullWidth select
            value={fNovo.contato_id}
            onChange={(e) => setFNovo({ ...fNovo, contato_id: e.target.value })}
            disabled={!fNovo.empresa_id}>
            <MenuItem value="">—</MenuItem>
            {contatosDaEmpresaNovo.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nome}
              </MenuItem>
            ))}
          </TextField>
        </FormField>
        <FormField label="Valor estimado">
          <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
            type="number"
           
           
            value={fNovo.valor_estimado}
            onChange={(e) => setFNovo({ ...fNovo, valor_estimado: e.target.value })} />
        </FormField>
        <FormField label="Previsão de fechamento">
          <DateField value={fNovo.data_prevista_fechamento} onChange={(v) => setFNovo({ ...fNovo, data_prevista_fechamento: v })} />
        </FormField>
        <FormField label="Origem">
          <TextField size="small" fullWidth select
            value={fNovo.origem}
            onChange={(e) => setFNovo({ ...fNovo, origem: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            <MenuItem value="site">Site</MenuItem>
            <MenuItem value="telefone">Telefone</MenuItem>
            <MenuItem value="indicacao">Indicação</MenuItem>
            <MenuItem value="prospeccao">Prospecção</MenuItem>
            <MenuItem value="ecommerce">E-commerce</MenuItem>
            <MenuItem value="outro">Outro</MenuItem>
          </TextField>
        </FormField>
        <FormField label="Estágio">
          <TextField size="small" fullWidth select
            value={estagioInicialNovo}
            onChange={(e) => setEstagioInicialNovo(e.target.value as EstagioOportunidade)}>
            {ESTAGIOS.filter((e) => e !== "perdida").map((est) => (
              <MenuItem key={est} value={String(est)}>
                {statusLabel(est)}
              </MenuItem>
            ))}
          </TextField>
        </FormField>
        <FormField label="Observações" wide>
          <TextField size="small" fullWidth multiline minRows={3}
            rows={2}
            value={fNovo.descricao}
            onChange={(e) => setFNovo({ ...fNovo, descricao: e.target.value })} />
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
            <Chip label={<>{sugestao}</>} size="small" variant={(motivoPerda === sugestao) ? "filled" : "outlined"} color={(motivoPerda === sugestao) ? "primary" : "default"} key={sugestao} onClick={() => setMotivoPerda(sugestao)} />
          ))}
        </div>
        <FormField label="Motivo (obrigatório)" wide>
          <TextField size="small" fullWidth
            required
            value={motivoPerda}
            onChange={(e) => setMotivoPerda(e.target.value)} />
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
    </>
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
          <Typography variant="body2" component="p" className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {o.titulo}
          </Typography>
          <Typography variant="body2" component="p" className="mt-0.5 truncate text-xs text-muted-foreground">{empresaNome}</Typography>
        </div>

        <div className="flex shrink-0 items-center gap-1" data-no-card-open>
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="small" type="button" onClick={(e) => e.stopPropagation()} aria-label="Opções"><MoreHorizontal className="h-3.5 w-3.5" /></IconButton>
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
        <Typography variant="body2" component="p" className="mt-2 truncate text-[11px] text-[#D92546]">{o.motivo_perda}</Typography>
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
                <Chip label={<>{CONFIG_ESTAGIOS[est].titulo}</>} size="small" variant={(ativo) ? "filled" : "outlined"} color={(ativo) ? "primary" : "default"} key={est} disabled={!podeEditar || ativo} onClick={() => onMoverEstagio(oportunidade, est)} />
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

              <Box component="form" onSubmit={salvarEdicao} className="grid gap-4 sm:grid-cols-2">
                <FormField label="Título" wide>
                  <TextField size="small" fullWidth
                    required
                    disabled={!podeEditar}
                    value={fEdit.titulo}
                    onChange={(e) => setFEdit({ ...fEdit, titulo: e.target.value })} />
                </FormField>

                <FormField label="Empresa">
                  <TextField size="small" fullWidth select
                    disabled={!podeEditar}
                    value={fEdit.empresa_id}
                    onChange={(e) =>
                      setFEdit({ ...fEdit, empresa_id: e.target.value, contato_id: "" })
                    }>
                    {[...empresas.values()].map((emp) => (
                      <MenuItem key={emp.id} value={String(emp.id)}>
                        {emp.nome_fantasia || emp.razao_social}
                      </MenuItem>
                    ))}
                  </TextField>
                </FormField>

                <FormField label="Contato">
                  <TextField size="small" fullWidth select
                    disabled={!podeEditar}
                    value={fEdit.contato_id}
                    onChange={(e) => setFEdit({ ...fEdit, contato_id: e.target.value })}>
                    <MenuItem value="">—</MenuItem>
                    {contatosEmpresa.map((c) => (
                      <MenuItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </MenuItem>
                    ))}
                  </TextField>
                </FormField>

                <FormField label="Valor estimado">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                    type="number"
                   
                   
                    disabled={!podeEditar}
                    value={fEdit.valor_estimado}
                    onChange={(e) => setFEdit({ ...fEdit, valor_estimado: e.target.value })} />
                </FormField>

                <FormField label="Previsão de fechamento">
                  <DateField disabled={!podeEditar} value={fEdit.data_prevista_fechamento} onChange={(v) =>
                      setFEdit({ ...fEdit, data_prevista_fechamento: v })
                    } />
                </FormField>

                <FormField label="Origem" wide>
                  <TextField size="small" fullWidth select
                    disabled={!podeEditar}
                    value={fEdit.origem}
                    onChange={(e) => setFEdit({ ...fEdit, origem: e.target.value })}>
                    <MenuItem value="">—</MenuItem>
                    <MenuItem value="site">Site</MenuItem>
                    <MenuItem value="telefone">Telefone</MenuItem>
                    <MenuItem value="indicacao">Indicação</MenuItem>
                    <MenuItem value="prospeccao">Prospecção</MenuItem>
                    <MenuItem value="ecommerce">E-commerce</MenuItem>
                    <MenuItem value="outro">Outro</MenuItem>
                  </TextField>
                </FormField>

                <FormField label="Descrição / Observações" wide>
                  <TextField size="small" fullWidth multiline minRows={3}
                    rows={3}
                    disabled={!podeEditar}
                    value={fEdit.descricao}
                    onChange={(e) => setFEdit({ ...fEdit, descricao: e.target.value })} />
                </FormField>

                {podeEditar && (
                  <div className="flex justify-end sm:col-span-2">
                    <Button variant="contained" type="submit" disabled={salvandoEdicao}>{salvandoEdicao ? "Salvando…" : "Salvar"}</Button>
                  </div>
                )}
              </Box>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4 space-y-4">
              {podeEditar && (
                <Box component="form"
                  onSubmit={registrarInteracao}
                  className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2"
                >
                  <FormField label="Tipo">
                    <TextField size="small" fullWidth select
                      value={fInteracao.tipo}
                      onChange={(e) => setFInteracao({ ...fInteracao, tipo: e.target.value })}>
                      <MenuItem value="ligacao">Ligação</MenuItem>
                      <MenuItem value="whatsapp">WhatsApp</MenuItem>
                      <MenuItem value="email">E-mail</MenuItem>
                      <MenuItem value="reuniao">Reunião</MenuItem>
                      <MenuItem value="visita">Visita</MenuItem>
                      <MenuItem value="nota_interna">Nota interna</MenuItem>
                      <MenuItem value="outro">Outro</MenuItem>
                    </TextField>
                  </FormField>
                  <FormField label="Assunto">
                    <TextField size="small" fullWidth
                      value={fInteracao.assunto}
                      onChange={(e) => setFInteracao({ ...fInteracao, assunto: e.target.value })} />
                  </FormField>
                  <FormField label="Descrição" wide>
                    <TextField size="small" fullWidth multiline minRows={3}
                      rows={2}
                      required={!fInteracao.assunto.trim()}
                      value={fInteracao.descricao}
                      onChange={(e) => setFInteracao({ ...fInteracao, descricao: e.target.value })} />
                  </FormField>
                  <FormField label="Próxima ação">
                    <TextField size="small" fullWidth
                      value={fInteracao.proxima_acao}
                      onChange={(e) =>
                        setFInteracao({ ...fInteracao, proxima_acao: e.target.value })
                      } />
                  </FormField>
                  <FormField label="Data da próxima ação">
                    <DateTimeField
                      required={Boolean(fInteracao.proxima_acao.trim())}
                      value={fInteracao.proxima_acao_em}
                      onChange={(v) =>
                        setFInteracao({ ...fInteracao, proxima_acao_em: v })
                      } />
                  </FormField>
                  <div className="flex justify-end sm:col-span-2">
                    <Button variant="contained" size="small" type="submit" disabled={salvandoInteracao}>{salvandoInteracao ? "Registrando…" : "Registrar"}</Button>
                  </div>
                </Box>
              )}

              {carregandoDados ? (
                <Typography variant="body2" component="p" className="py-6 text-center text-xs text-muted-foreground">Carregando…</Typography>
              ) : interacoes.length === 0 ? (
                <Typography variant="body2" component="p" className="py-6 text-center text-xs text-muted-foreground">Nenhuma interação.</Typography>
              ) : (
                <List disablePadding>
                  {interacoes.map((item) => (
                    <ListItem key={item.id}>
                      <div className="flex items-center justify-between">
                        <strong className="capitalize">
                          {item.assunto || String(item.tipo).replaceAll("_", " ")}
                        </strong>
                        <span className="text-muted-foreground">
                          {fmtDataHora(item.ocorrido_em || item.created_at)}
                        </span>
                      </div>
                      {item.descricao && (
                        <Typography variant="body2" component="p" className="mt-1 text-muted-foreground">{item.descricao}</Typography>
                      )}
                      {item.proxima_acao && (
                        <Typography variant="body2" component="p" className="mt-1 font-medium text-[#D9486E]">
                          Próxima ação: {item.proxima_acao}
                          {item.proxima_acao_em ? ` (${fmtDataHora(item.proxima_acao_em)})` : ""}
                        </Typography>
                      )}
                    </ListItem>
                  ))}
                </List>
              )}
            </TabsContent>

            <TabsContent value="orcamentos" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Orçamentos vinculados</span>
                {podeEditar && (
                  <Button variant="contained" size="small" type="button" onClick={() => setNovoOrcOpen((v) => !v)}>{novoOrcOpen ? "Fechar" : "+ Orçamento"}</Button>
                )}
              </div>

              {novoOrcOpen && (
                <Box component="form"
                  onSubmit={gerarOrcamento}
                  className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2"
                >
                  <FormField label="Produto inicial" wide>
                    <TextField size="small" fullWidth select
                      required
                      value={fOrc.produto_id}
                      onChange={(e) => selecionarProdutoOrc(e.target.value)}>
                      <MenuItem value="">—</MenuItem>
                      {produtos.map((p) => (
                        <MenuItem key={p.id} value={String(p.id)}>
                          {p.sku} · {p.nome} ({brl(p.preco_venda)})
                        </MenuItem>
                      ))}
                    </TextField>
                  </FormField>
                  <FormField label="Quantidade">
                    <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: "0.001" } }}
                      type="number"
                     
                     
                      required
                      value={fOrc.quantidade}
                      onChange={(e) => setFOrc({ ...fOrc, quantidade: e.target.value })} />
                  </FormField>
                  <FormField label="Preço unitário">
                    <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                      type="number"
                     
                     
                      required
                      value={fOrc.preco_unitario}
                      onChange={(e) => setFOrc({ ...fOrc, preco_unitario: e.target.value })} />
                  </FormField>
                  <FormField label="Validade">
                    <DateField value={fOrc.valido_ate} onChange={(v) => setFOrc({ ...fOrc, valido_ate: v })} />
                  </FormField>
                  <FormField label="Condição de pagamento">
                    <TextField size="small" fullWidth
                      value={fOrc.condicao_pagamento}
                      onChange={(e) => setFOrc({ ...fOrc, condicao_pagamento: e.target.value })} />
                  </FormField>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <Button variant="contained" size="small" type="submit" disabled={criandoOrc}>{criandoOrc ? "Criando…" : "Criar orçamento"}</Button>
                  </div>
                </Box>
              )}

              {orcamentos.length === 0 ? (
                <Typography variant="body2" component="p" className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum orçamento vinculado.
                </Typography>
              ) : (
                <List disablePadding>
                  {orcamentos.map((orc) => (
                    <ListItem key={orc.id}>
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
                    </ListItem>
                  ))}
                </List>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
