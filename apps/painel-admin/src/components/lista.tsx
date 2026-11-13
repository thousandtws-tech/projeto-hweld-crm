import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { brl, fmtData, qty, statusLabel } from "@/lib/format";
import { useResourceList } from "@/lib/use-resource-list";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";

export interface Coluna {
  campo: string;
  rotulo: string;
  tipo?: "texto" | "dinheiro" | "qtd" | "status" | "bool" | "data" | "numero";
  /** rota para detalhe: `link: '/vendas/pedidos'` gera `/vendas/pedidos/{row.id}` */
  link?: string;
}

export interface ListaCfg {
  titulo: string;
  recurso: string;
  colunas: Coluna[];
  /** campo de busca enviado como `?busca=` */
  busca?: boolean;
  /** filtro extra fixo: {campo, opcoes:[{valor,rotulo}]} — ex.: status */
  filtro?: { campo: string; rotulo: string; opcoes: { valor: string; rotulo: string }[] };
  novaRota?: string;
  detalhePrefixo?: string;
  /** tipos de evento realtime que disparam reload (ex.: ['pedido.criado']). */
  eventos?: string[];
  /** habilita botão de exclusão por linha (`DELETE /{recurso}/{id}`). */
  excluir?: {
    rotulo?: string;
    campoNome?: string;
    fn?: (id: number | string, linha: Record<string, unknown>) => Promise<void>;
  };
}

type Linha = Record<string, unknown>;

const POR_PAGINA = 20;

function idDe(linha: Linha): number | string {
  // Entidades com identificador público opaco (public_id) usam-no na URL em vez
  // do id sequencial — URLs mascaradas, não enumeráveis.
  return (linha["public_id"] as string | undefined) ?? (linha["id"] as number | string) ?? "";
}

function Celula({ linha, c }: { linha: Linha; c: Coluna }) {
  const v = linha[c.campo];
  let conteudo: React.ReactNode;
  switch (c.tipo) {
    case "dinheiro":
      conteudo = <span className="tabular-nums">{brl(v as string)}</span>;
      break;
    case "qtd":
      conteudo = <span className="tabular-nums">{qty(v as string)}</span>;
      break;
    case "status":
      conteudo = <StatusPill status={String(v ?? "")} label={statusLabel(v as string)} />;
      break;
    case "bool":
      conteudo = v ? "Sim" : "Não";
      break;
    case "data":
      conteudo = fmtData(v as string);
      break;
    case "numero":
      conteudo = v == null ? "—" : String(v);
      break;
    default:
      if (v === null || v === undefined) conteudo = "—";
      else if (typeof v === "object") conteudo = JSON.stringify(v).slice(0, 60);
      else conteudo = String(v).slice(0, 80);
  }
  if (c.link) {
    return (
      <Link
        to={`${c.link}/${idDe(linha)}` as "/"}
        className="font-medium text-foreground hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {conteudo}
      </Link>
    );
  }
  return <>{conteudo}</>;
}

/**
 * Listagem server-side config-driven — estados: loading, vazio, erro com retry, paginação.
 * Eventos realtime reconciliam via REST silenciosamente (sem skeleton).
 * Delega a camada de dados ao `useResourceList` compartilhado.
 */
export function ListaPage({ cfg }: { cfg: ListaCfg }) {
  const navigate = useNavigate();
  const [filtroValor, setFiltroValor] = useState("");
  const [excluindoId, setExcluindoId] = useState<number | string | null>(null);

  const l = useResourceList<Linha>({
    recurso: cfg.recurso,
    porPagina: POR_PAGINA,
    busca: Boolean(cfg.busca),
    filtros: cfg.filtro && filtroValor ? { [cfg.filtro.campo]: filtroValor } : {},
    eventos: cfg.eventos ?? [],
  });
  const {
    pagina,
    carregando,
    erro,
    paginaNum,
    setPaginaNum,
    busca,
    setBusca: onBusca,
    recarregar,
  } = l;

  const aoExcluir = async (e: React.MouseEvent, linha: Linha) => {
    e.stopPropagation();
    if (!cfg.excluir || excluindoId !== null) return;
    const id = (linha["id"] as number | string | undefined) ?? idDe(linha);
    const nome = String(linha[cfg.excluir.campoNome ?? "nome"] ?? linha["sku"] ?? `#${id}`);
    if (!window.confirm(`Deseja realmente excluir "${nome}"?`)) return;
    setExcluindoId(id);
    try {
      if (cfg.excluir.fn) {
        await cfg.excluir.fn(id, linha);
      } else {
        await api.del(cfg.recurso, id);
      }
      toast.success(`"${nome}" excluído.`);
      recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir registro.");
    } finally {
      setExcluindoId(null);
    }
  };

  const detalhe = cfg.detalhePrefixo;

  return (
    <>
      <PageHeader
        title={cfg.titulo}
        action={
          <div className="flex items-center gap-2">
            {cfg.busca && (
              <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => onBusca(e.target.value)}
                  placeholder="Buscar…"
                  aria-label="Buscar"
                  className="w-36 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            {cfg.filtro && (
              <select
                aria-label={cfg.filtro.rotulo}
                value={filtroValor}
                onChange={(e) => {
                  setFiltroValor(e.target.value);
                  setPaginaNum(1);
                }}
                className="rounded-2xl bg-secondary/60 px-3 py-2 text-sm outline-none"
              >
                <option value="">{cfg.filtro.rotulo}: todos</option>
                {cfg.filtro.opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            )}
            {cfg.novaRota && (
              <Link
                to={cfg.novaRota as "/"}
                className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Novo
              </Link>
            )}
          </div>
        }
      />

      {erro && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{erro}</span>
          <button
            onClick={recarregar}
            className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 px-3 py-1 text-xs font-semibold hover:bg-destructive/10"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${carregando ? "opacity-55" : ""}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                {cfg.colunas.map((c) => (
                  <th key={c.campo} className="px-4 py-3 font-semibold">
                    {c.rotulo}
                  </th>
                ))}
                {cfg.excluir && <th className="px-4 py-3 text-right font-semibold">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {carregando && !pagina ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-border/60">
                    {cfg.colunas.map((c) => (
                      <td key={c.campo} className="px-4 py-3.5">
                        <span className="block h-4 w-2/3 animate-pulse rounded bg-secondary" />
                      </td>
                    ))}
                    {cfg.excluir && (
                      <td className="px-4 py-3.5 text-right">
                        <span className="ml-auto block h-4 w-16 animate-pulse rounded bg-secondary" />
                      </td>
                    )}
                  </tr>
                ))
              ) : pagina && pagina.itens.length === 0 ? (
                <tr>
                  <td
                    colSpan={cfg.colunas.length + (cfg.excluir ? 1 : 0)}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    Nenhum registro.
                  </td>
                </tr>
              ) : (
                pagina?.itens.map((linha) => {
                  const id = (linha["id"] as number | string | undefined) ?? idDe(linha);
                  const excluindo = excluindoId === id;
                  return (
                    <tr
                      key={idDe(linha)}
                      onClick={() => detalhe && navigate({ to: `${detalhe}/${idDe(linha)}` as "/" })}
                      className={`border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40 ${detalhe ? "cursor-pointer" : ""}`}
                    >
                      {cfg.colunas.map((c) => (
                        <td key={c.campo} className="px-4 py-3">
                          <Celula linha={linha} c={c} />
                        </td>
                      ))}
                      {cfg.excluir && (
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={excluindo}
                            onClick={(e) => void aoExcluir(e, linha)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#D92546]/30 bg-card px-2.5 py-1 text-xs font-medium text-[#D92546] hover:bg-[#D92546]/10 disabled:opacity-50"
                          >
                            {excluindo ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            {cfg.excluir.rotulo ?? "Excluir"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagina && pagina.total_paginas > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{pagina.total} registro(s)</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: pagina.total_paginas }, (_, i) => i + 1)
                .slice(
                  Math.max(0, Math.min(paginaNum - 3, pagina.total_paginas - 5)),
                  Math.max(5, Math.min(paginaNum + 2, pagina.total_paginas)),
                )
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setPaginaNum(p)}
                    className={`h-8 min-w-8 rounded-xl px-2 text-xs font-semibold ${
                      p === paginaNum
                        ? "bg-lime text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {p}
                  </button>
                ))}
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}
