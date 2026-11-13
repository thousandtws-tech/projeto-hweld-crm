import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { brl, fmtData, statusLabel } from "@/lib/format";
import { exigePerfil } from "@/lib/guards";
import type { Contato, OrdemServico, Pedido, PrioridadeOs, StatusOs } from "@/lib/models";
import { crmService, osService, pedidosService } from "@/lib/services";
import { useEmpresasMap } from "@/lib/use-empresas";
import { useResourceList } from "@/lib/use-resource-list";
import { useAuth } from "@/store/auth-store";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { DateField } from "@/components/ui-kit/DateField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import InputBase from "@mui/material/InputBase";

export const Route = createFileRoute("/operacao/ordens-servico/")({
  beforeLoad: exigePerfil("admin", "tecnico"),
  component: OrdensServicoIndexPage,
});

const STATUS_OS: StatusOs[] = [
  "aberta",
  "em_andamento",
  "aguardando_material",
  "concluida",
  "cancelada",
];

const ACAO_RAPIDA_OS: Partial<Record<StatusOs, { para: StatusOs; rotulo: string }>> = {
  aberta: { para: "em_andamento", rotulo: "Iniciar" },
  aguardando_material: { para: "em_andamento", rotulo: "Retomar" },
  em_andamento: { para: "concluida", rotulo: "Concluir" },
};

const optStr = (v: string): string | null => {
  const t = v.trim();
  return t.length > 0 ? t : null;
};

function OrdensServicoIndexPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const empresas = useEmpresasMap();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>("");

  const l = useResourceList<OrdemServico>({
    recurso: "ordens-servico",
    filtros: {
      status: filtroStatus || undefined,
      prioridade: filtroPrioridade || undefined,
    },
    eventos: ["os.criada", "os.status_alterada"],
  });
  const carregando = l.carregando;
  const carregar = l.recarregar;
  const busca = l.busca;
  const setBusca = l.setBusca;

  const [novoOpen, setNovoOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fNovo, setFNovo] = useState({
    empresa_id: "",
    contato_id: "",
    pedido_id: "",
    prioridade: "normal" as PrioridadeOs,
    prevista_em: "",
    valor_mao_obra: "",
    descricao: "",
    observacoes: "",
  });

  useEffect(() => {
    if (!novoOpen) return;
    crmService
      .contatos({ por_pagina: 100 })
      .then((p) => setContatos(p.itens ?? []))
      .catch(() => toast.error("Falha ao carregar contatos."));
    pedidosService
      .listar({ por_pagina: 100 })
      .then((p) => setPedidos(p.itens ?? []))
      .catch(() => toast.error("Falha ao carregar pedidos para vincular."));
  }, [novoOpen]);

  const empresaNome = (id: number) => {
    const e = empresas.get(id);
    return e ? e.nome_fantasia || e.razao_social : `Empresa #${id}`;
  };

  // Status/prioridade/busca já são filtros server-side — a lista renderiza
  // `l.itens` direto; resumo reflete a página carregada.
  const ordensFiltradas = l.itens;

  const resumo = useMemo(() => {
    const ordens = l.itens;
    const emFila = ordens.filter(
      (o) =>
        o.status === "aberta" || o.status === "em_andamento" || o.status === "aguardando_material",
    ).length;
    const urgentes = ordens.filter(
      (o) =>
        o.status !== "concluida" &&
        o.status !== "cancelada" &&
        (o.prioridade === "urgente" || o.prioridade === "alta"),
    ).length;
    const concluidas = ordens.filter((o) => o.status === "concluida").length;
    return { emFila, urgentes, concluidas };
  }, [l.itens]);

  const abrirModalNovo = () => {
    setFNovo({
      empresa_id: "",
      contato_id: "",
      pedido_id: "",
      prioridade: "normal",
      prevista_em: "",
      valor_mao_obra: "",
      descricao: "",
      observacoes: "",
    });
    setNovoOpen(true);
  };

  const criarOs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fNovo.empresa_id || salvando) return;
    setSalvando(true);
    try {
      const criada = await osService.criar({
        empresa_id: Number(fNovo.empresa_id),
        contato_id: fNovo.contato_id ? Number(fNovo.contato_id) : null,
        pedido_id: fNovo.pedido_id ? Number(fNovo.pedido_id) : null,
        responsavel_id: user?.id ?? null,
        prioridade: fNovo.prioridade,
        prevista_em: fNovo.prevista_em || null,
        valor_mao_obra: optStr(fNovo.valor_mao_obra),
        descricao: optStr(fNovo.descricao),
        observacoes: optStr(fNovo.observacoes),
      });
      setNovoOpen(false);
      toast.success(`Ordem de serviço #${criada.numero || criada.id} aberta.`);
      navigate({ to: `/operacao/ordens-servico/${criada.id}` as "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar ordem de serviço.");
    } finally {
      setSalvando(false);
    }
  };

  const transicionarRapido = async (o: OrdemServico, para: StatusOs) => {
    try {
      await osService.transicionar(o.id, para);
      l.recarregar();
      toast.success(`OS #${o.numero || o.id} → ${statusLabel(para)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transição recusada.");
    }
  };

  const contatosDaEmpresa = useMemo(
    () => contatos.filter((c) => c.empresa_id === Number(fNovo.empresa_id)),
    [contatos, fNovo.empresa_id],
  );

  const pedidosDaEmpresa = useMemo(
    () =>
      pedidos.filter((p) => p.empresa_id === Number(fNovo.empresa_id) && p.status !== "cancelado"),
    [pedidos, fNovo.empresa_id],
  );

  return (
    <>
      <PageHeader
        title="Ordens de serviço"
        subtitle={`Em atendimento: ${resumo.emFila} · Prioridade alta/urgente: ${resumo.urgentes} · Concluídas: ${resumo.concluidas}`}
        action={
          <Button variant="contained" type="button" onClick={abrirModalNovo}><Plus className="h-4 w-4" /> Nova OS</Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex min-w-52 flex-1 sm:max-w-xs items-center gap-2 rounded-2xl border border-border bg-card px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <InputBase type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº, empresa ou descrição…" inputProps={{ "aria-label": "Buscar", autoComplete: "off", name: "busca-os" }} className="min-w-0 flex-1 text-xs sm:text-sm" />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Chip label={<>Todas ({l.pagina?.total ?? l.itens.length})</>} size="small" variant={(filtroStatus === "") ? "filled" : "outlined"} color={(filtroStatus === "") ? "primary" : "default"} onClick={() => setFiltroStatus("")} />
            {STATUS_OS.map((st) => {
              const count = l.itens.filter((o) => o.status === st).length;
              if (count === 0 && filtroStatus !== st) return null;
              return (
                <Chip label={<>{statusLabel(st)} ({count})</>} size="small" variant={(filtroStatus === st) ? "filled" : "outlined"} color={(filtroStatus === st) ? "primary" : "default"} key={st} onClick={() => setFiltroStatus(filtroStatus === st ? "" : st)} />
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TextField size="small" select aria-label="Prioridade" value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">Prioridade: todas</MenuItem>
            <MenuItem value="urgente">Urgente</MenuItem>
            <MenuItem value="alta">Alta</MenuItem>
            <MenuItem value="normal">Normal</MenuItem>
            <MenuItem value="baixa">Baixa</MenuItem>
          </TextField>

          <IconButton size="small" type="button" onClick={() => void carregar()} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></IconButton>
        </div>
      </div>

      <SectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table size="small" className={`w-full text-sm ${carregando ? "opacity-60" : ""}`}>
            <TableHead>
              <TableRow >
                <TableCell >OS</TableCell>
                <TableCell >Empresa</TableCell>
                <TableCell >Serviço / Escopo</TableCell>
                <TableCell >Prioridade</TableCell>
                <TableCell >Status</TableCell>
                <TableCell >Previsão</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {ordensFiltradas.length === 0 ? (
                <TableRow >
                  <TableCell align="center" colSpan={8}>
                    Nenhuma ordem de serviço encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                ordensFiltradas.map((o) => {
                  const acao = ACAO_RAPIDA_OS[o.status as StatusOs];
                  return (
                    <TableRow key={o.id} onClick={() => navigate({ to: `/operacao/ordens-servico/${o.id}` as "/" })} sx={{ cursor: "pointer" }} hover>
                      <TableCell >
                        #{o.numero || o.id}
                        {o.pedido_id && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            Pedido #{o.pedido_id}
                          </span>
                        )}
                      </TableCell>
                      <TableCell >{empresaNome(o.empresa_id)}</TableCell>
                      <TableCell >
                        {o.descricao || "—"}
                      </TableCell>
                      <TableCell >
                        <StatusPill status={o.prioridade} label={o.prioridade} />
                      </TableCell>
                      <TableCell >
                        <StatusPill status={o.status} label={statusLabel(o.status)} />
                      </TableCell>
                      <TableCell >
                        {fmtData(o.prevista_em)}
                      </TableCell>
                      <TableCell align="right">
                        {brl(o.valor_total ?? o.valor_mao_obra)}
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        {acao && (
                          <Button variant="outlined" size="small" type="button" onClick={() => void transicionarRapido(o, acao.para)}>{acao.rotulo}
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

        {l.pagina && l.pagina.total_paginas > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{l.pagina.total} registro(s)</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: l.pagina.total_paginas }, (_, i) => i + 1)
                .slice(
                  Math.max(0, Math.min(l.paginaNum - 3, l.pagina.total_paginas - 5)),
                  Math.max(5, Math.min(l.paginaNum + 2, l.pagina.total_paginas)),
                )
                .map((p) => (
                  <Chip label={<>{p}</>} size="small" variant={(p === l.paginaNum) ? "filled" : "outlined"} color={(p === l.paginaNum) ? "primary" : "default"} key={p} onClick={() => l.setPaginaNum(p)} />
                ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Modal: Nova Ordem de Serviço */}
      <FormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        title="Nova ordem de serviço"
        description="Abertura de atendimento técnico, manutenção ou instalação vinculada ao cliente"
        submitLabel={salvando ? "Abrindo…" : "Abrir OS"}
        onSubmit={criarOs}
      >
        <FormField label="Empresa (Cliente) *">
          <TextField size="small" fullWidth select
            required
            value={fNovo.empresa_id}
            onChange={(e) =>
              setFNovo({ ...fNovo, empresa_id: e.target.value, contato_id: "", pedido_id: "" })
            } slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">Selecione…</MenuItem>
            {[...empresas.values()].map((emp) => (
              <MenuItem key={emp.id} value={String(emp.id)}>
                {emp.nome_fantasia || emp.razao_social}
              </MenuItem>
            ))}
          </TextField>
        </FormField>

        <FormField label="Contato na empresa">
          <TextField size="small" fullWidth select
            value={fNovo.contato_id}
            onChange={(e) => setFNovo({ ...fNovo, contato_id: e.target.value })}
            disabled={!fNovo.empresa_id} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">— Opcional —</MenuItem>
            {contatosDaEmpresa.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nome}
              </MenuItem>
            ))}
          </TextField>
        </FormField>

        <FormField label="Pedido vinculado">
          <TextField size="small" fullWidth select
            value={fNovo.pedido_id}
            onChange={(e) => setFNovo({ ...fNovo, pedido_id: e.target.value })}
            disabled={!fNovo.empresa_id} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">— Opcional —</MenuItem>
            {pedidosDaEmpresa.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.numero} ({brl(p.total)})
              </MenuItem>
            ))}
          </TextField>
        </FormField>

        <FormField label="Prioridade">
          <TextField size="small" fullWidth select
            value={fNovo.prioridade}
            onChange={(e) => setFNovo({ ...fNovo, prioridade: e.target.value as PrioridadeOs })} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="baixa">Baixa</MenuItem>
            <MenuItem value="normal">Normal</MenuItem>
            <MenuItem value="alta">Alta</MenuItem>
            <MenuItem value="urgente">Urgente</MenuItem>
          </TextField>
        </FormField>

        <FormField label="Previsão de conclusão">
          <DateField value={fNovo.prevista_em} onChange={(v) => setFNovo({ ...fNovo, prevista_em: v })} />
        </FormField>

        <FormField label="Valor de mão de obra (R$)">
          <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
            type="number"
           
           
            placeholder="0,00"
            value={fNovo.valor_mao_obra}
            onChange={(e) => setFNovo({ ...fNovo, valor_mao_obra: e.target.value })} />
        </FormField>

        <FormField label="Descrição do serviço / equipamento *" wide>
          <TextField size="small" fullWidth multiline minRows={3}
            rows={3}
            required
            placeholder="Descreva o equipamento, defeito relatado ou serviço solicitado…"
            value={fNovo.descricao}
            onChange={(e) => setFNovo({ ...fNovo, descricao: e.target.value })} />
        </FormField>

        <FormField label="Observações técnicas" wide>
          <TextField size="small" fullWidth
            value={fNovo.observacoes}
            onChange={(e) => setFNovo({ ...fNovo, observacoes: e.target.value })} />
        </FormField>
      </FormDialog>
    </>
  );
}
