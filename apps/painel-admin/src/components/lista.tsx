import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

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
 * Delega a camada de dados ao `useResourceList` compartilhado. UI 100% MUI.
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
  const colSpan = cfg.colunas.length + (cfg.excluir ? 1 : 0);

  return (
    <>
      <PageHeader
        title={cfg.titulo}
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            {cfg.busca && (
              <TextField
                size="small"
                type="search"
                value={busca}
                onChange={(e) => onBusca(e.target.value)}
                placeholder="Buscar…"
                aria-label="Buscar"
                autoComplete="off"
                name="busca-lista"
                sx={{ width: 180, "& .MuiOutlinedInput-root": { bgcolor: "action.hover" } }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={16} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}
            {cfg.filtro && (
              <TextField
                select
                size="small"
                aria-label={cfg.filtro.rotulo}
                value={filtroValor}
                onChange={(e) => {
                  setFiltroValor(e.target.value);
                  setPaginaNum(1);
                }}
                sx={{ minWidth: 160, "& .MuiOutlinedInput-root": { bgcolor: "action.hover" } }} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">{cfg.filtro.rotulo}: todos</MenuItem>
                {cfg.filtro.opcoes.map((o) => (
                  <MenuItem key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {cfg.novaRota && (
              <Button
                component={Link}
                to={cfg.novaRota as "/"}
                variant="contained"
                startIcon={<Plus size={16} />}
              >
                Novo
              </Button>
            )}
          </Stack>
        }
      />

      {erro && (
        <Alert
          severity="error"
          sx={{ borderRadius: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<RefreshCw size={14} />}
              onClick={recarregar}
            >
              Tentar novamente
            </Button>
          }
        >
          {erro}
        </Alert>
      )}

      <SectionCard className="overflow-hidden p-0">
        <TableContainer>
          <Table size="small" sx={{ opacity: carregando ? 0.55 : 1 }}>
            <TableHead>
              <TableRow>
                {cfg.colunas.map((c) => (
                  <TableCell key={c.campo}>{c.rotulo}</TableCell>
                ))}
                {cfg.excluir && <TableCell align="right">Ações</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {carregando && !pagina ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    {cfg.colunas.map((c) => (
                      <TableCell key={c.campo}>
                        <Skeleton width="66%" />
                      </TableCell>
                    ))}
                    {cfg.excluir && (
                      <TableCell align="right">
                        <Skeleton width={64} sx={{ ml: "auto" }} />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : pagina && pagina.itens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} align="center" sx={{ py: 5 }}>
                    <Typography color="text.secondary" variant="body2">
                      Nenhum registro.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pagina?.itens.map((linha) => {
                  const id = (linha["id"] as number | string | undefined) ?? idDe(linha);
                  const excluindo = excluindoId === id;
                  return (
                    <TableRow
                      key={idDe(linha)}
                      hover
                      onClick={() => detalhe && navigate({ to: `${detalhe}/${idDe(linha)}` as "/" })}
                      sx={detalhe ? { cursor: "pointer" } : undefined}
                    >
                      {cfg.colunas.map((c) => (
                        <TableCell key={c.campo}>
                          <Celula linha={linha} c={c} />
                        </TableCell>
                      ))}
                      {cfg.excluir && (
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={excluindo}
                            onClick={(e) => void aoExcluir(e, linha)}
                            startIcon={
                              excluindo ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )
                            }
                          >
                            {cfg.excluir?.rotulo ?? "Excluir"}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {pagina && pagina.total_paginas > 1 && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 1.5 }}
          >
            <Typography variant="caption" color="text.secondary">
              {pagina.total} registro(s)
            </Typography>
            <Pagination
              count={pagina.total_paginas}
              page={paginaNum}
              onChange={(_, p) => setPaginaNum(p)}
              color="primary"
              size="small"
              shape="rounded"
            />
          </Stack>
        )}
      </SectionCard>
    </>
  );
}
