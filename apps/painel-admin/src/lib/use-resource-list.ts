import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, ApiError, type Filtros } from "@/lib/api";
import type { Pagina } from "@/lib/models";
import { useRealtimeEvent } from "@/lib/use-realtime";

/**
 * Listagem server-side compartilhada — substitui o padrão legado de buscar
 * `por_pagina: 100` + filtrar/paginar no cliente.
 *
 * O que o hook resolve:
 *  - paginação no servidor (`pagina`/`por_pagina` na query, `total_paginas`
 *    de volta);
 *  - busca com debounce embutido → `?busca=` (ILIKE no backend);
 *  - filtros extras (`status`, `origem`, `prioridade`...) como params —
 *    mudança reseta para a página 1;
 *  - cache por (recurso, página, busca, filtros): voltar de página reutiliza
 *    dados instantaneamente; `keepPreviousData` evita layout shift;
 *  - reconciliação realtime: eventos que casam com `eventos` invalidam o
 *    recurso — refetch silencioso, sem skeleton.
 *
 * Uso típico:
 *   const l = useResourceList<Pedido>({
 *     recurso: "pedidos",
 *     filtros: { status: filtroStatus || undefined, origem: filtroOrigem || undefined },
 *     eventos: ["pedido.criado", "pedido.status_alterado"],
 *   });
 *   l.itens, l.pagina, l.paginaNum, l.setPaginaNum, l.busca, l.setBusca,
 *   l.carregando, l.erro, l.recarregar()
 */
export interface UseResourceListOpts {
  recurso: string;
  /** Params extras enviados ao backend; `undefined`/`""` são omitidos. */
  filtros?: Filtros;
  /** Tipos realtime que disparam reconcile — mesmo contrato do useRealtimeEvent. */
  eventos?: string[] | ((tipo: string) => boolean);
  porPagina?: number;
  staleTimeMs?: number;
  /** Desliga o campo de busca (default: ligado — a página decide se renderiza). */
  busca?: boolean;
}

export interface ResourceList<T> {
  /** Itens da página atual (vazio enquanto a 1ª página carrega). */
  itens: T[];
  /** Envelope `{itens,total,pagina,por_pagina,total_paginas}` — null antes do 1º load. */
  pagina: Pagina<T> | null;
  /** Estado de fetch (inclui refetch silencioso — combine com esmaecer a tabela). */
  carregando: boolean;
  /** Mensagem amigável de erro ou null. */
  erro: string | null;
  /** Erro original (para checagem fina de status/código). */
  erroRaw: unknown;
  paginaNum: number;
  setPaginaNum: (n: number) => void;
  busca: string;
  setBusca: (v: string) => void;
  /** Busca já debounced que efetivamente vai na query — útil p/ depuração. */
  buscaAtiva: string;
  /** Invalida e refaz o fetch da página atual. */
  recarregar: () => void;
}

const DEBOUNCE_MS = 350;

export function useResourceList<T>(opts: UseResourceListOpts): ResourceList<T> {
  const queryClient = useQueryClient();
  const porPagina = opts.porPagina ?? 20;

  const [paginaNum, setPaginaNum] = useState(1);
  const [busca, setBuscaState] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");

  // Serializamos os filtros para a queryKey — objetos novos a cada render
  // não podem ser dependência direta.
  const filtrosKey = JSON.stringify(opts.filtros ?? {});

  // Filtro novo volta à página 1.
  const filtrosKeyRef = useRef(filtrosKey);
  useEffect(() => {
    if (filtrosKeyRef.current !== filtrosKey) {
      filtrosKeyRef.current = filtrosKey;
      setPaginaNum(1);
    }
  }, [filtrosKey]);

  const query = useQuery({
    queryKey: ["lista", opts.recurso, paginaNum, buscaAtiva, filtrosKey],
    queryFn: () => {
      const f: Filtros = {
        pagina: paginaNum,
        por_pagina: porPagina,
        ...(JSON.parse(filtrosKey) as Filtros),
      };
      if (buscaAtiva && opts.busca !== false) f.busca = buscaAtiva;
      return api.lista<T>(opts.recurso, f);
    },
    placeholderData: keepPreviousData,
    staleTime: opts.staleTimeMs ?? 15_000,
  });

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setBusca = (v: string) => {
    setBuscaState(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      setBuscaAtiva(v);
      setPaginaNum(1);
    }, DEBOUNCE_MS);
  };

  const recarregar = () =>
    void queryClient.invalidateQueries({ queryKey: ["lista", opts.recurso] });

  useRealtimeEvent(opts.eventos ?? [], recarregar);

  const erro =
    query.error == null
      ? null
      : query.error instanceof ApiError && query.error.status === 403
        ? "Sem permissão para este recurso."
        : "Falha ao carregar. O backend está no ar?";

  return {
    itens: query.data?.itens ?? [],
    pagina: query.data ?? null,
    carregando: query.isFetching,
    erro,
    erroRaw: query.error,
    paginaNum,
    setPaginaNum,
    busca,
    setBusca,
    buscaAtiva,
    recarregar,
  };
}
