import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { brl, fmtData, statusLabel } from "@/lib/format";
import type { OrdemServico, Produto } from "@/lib/models";
import { catalogoService, crmService, osService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useRealtimeEvent } from "@/lib/use-realtime";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/operacao/ordens-servico/$id")({
  beforeLoad: exigePerfil("admin", "tecnico"),
  component: OsDetalhePage,
});

const TRANSICOES: Record<string, { para: string; rotulo: string; cor: string }[]> = {
  aberta: [
    { para: "em_andamento", rotulo: "Iniciar", cor: "bg-lime text-primary-foreground" },
    {
      para: "aguardando_material",
      rotulo: "Aguardar material",
      cor: "bg-secondary text-foreground",
    },
    { para: "cancelada", rotulo: "Cancelar", cor: "border border-destructive/30 text-destructive" },
  ],
  em_andamento: [
    {
      para: "aguardando_material",
      rotulo: "Aguardar material",
      cor: "bg-secondary text-foreground",
    },
    { para: "concluida", rotulo: "Concluir", cor: "bg-lime text-primary-foreground" },
    { para: "cancelada", rotulo: "Cancelar", cor: "border border-destructive/30 text-destructive" },
  ],
  aguardando_material: [
    { para: "em_andamento", rotulo: "Retomar", cor: "bg-lime text-primary-foreground" },
    { para: "cancelada", rotulo: "Cancelar", cor: "border border-destructive/30 text-destructive" },
  ],
};

/** OS detalhe — transições + consumo de material (baixa de estoque atômica). */
function OsDetalhePage() {
  const { id: ref } = Route.useParams();
  const navigate = useNavigate();

  const [os, setOs] = useState<OrdemServico | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [empresas, setEmpresas] = useState<Map<number, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [fMat, setFMat] = useState({ produto_id: "", quantidade: "1" });

  const carregarOs = useCallback(() => {
    osService
      .buscar(ref)
      .then((o) => {
        setOs(o);
        // Canonicalização: id numérico na URL vira public_id (UUID mascarado).
        if (ref !== o.public_id) {
          void navigate({
            to: "/operacao/ordens-servico/$id",
            params: { id: o.public_id },
            replace: true,
          });
        }
      })
      .catch(() => setErro("OS não encontrada."));
  }, [ref, navigate]);

  useEffect(() => {
    catalogoService.produtos({ por_pagina: 100 }).then((p) => setProdutos(p.itens));
    crmService
      .empresas({ por_pagina: 100 })
      .then((p) =>
        setEmpresas(new Map(p.itens.map((e) => [e.id, e.nome_fantasia || e.razao_social]))),
      );
    carregarOs();
  }, [carregarOs]);

  // Transição/consumo feitos por outro técnico revalidam a OS aberta.
  useRealtimeEvent(
    (t) => t.startsWith("os."),
    (e) => {
      if (Number(e.dados["id"]) === os?.id) carregarOs();
    },
  );

  const empresaNome = (eid: number) => empresas.get(eid) ?? `#${eid}`;
  const nomeProduto = (pid: number) => produtos.find((p) => p.id === pid)?.nome ?? `#${pid}`;

  const transicionar = async (o: OrdemServico, status: string) => {
    try {
      const novo = await osService.transicionar(o.id, status);
      setOs(novo);
      toast.success(`OS → ${statusLabel(status)}`);
    } catch {
      toast.error("Transição recusada.");
    }
  };

  const consumir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!os || !fMat.produto_id) return;
    try {
      const novo = await osService.consumirMaterial(
        os.id,
        Number(fMat.produto_id),
        String(fMat.quantidade),
      );
      setOs(novo);
      toast.success("Material consumido.");
    } catch {
      toast.error("Falha ao consumir material.");
    }
  };

  return (
    <>
      {os ? (
        <>
          <PageHeader
            title={`OS #${os.id}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={os.status} label={statusLabel(os.status)} />
                <StatusPill status={os.prioridade} label={os.prioridade} />
                {(TRANSICOES[os.status] ?? []).map((t) => (
                  <Button variant="text" size="small" key={t.para} onClick={() => void transicionar(os, t.para)}>{t.rotulo}</Button>
                ))}
              </div>
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-4">
              <SectionCard>
                <Typography variant="h6" component="h2" className="mb-3 text-sm font-semibold">Detalhes</Typography>
                <Box component="dl" className="space-y-3 text-sm">
                  <div>
                    <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-xs text-muted-foreground">Empresa</Typography>
                    <Typography component="dd" variant="body2" className="mt-0.5 font-medium">{empresaNome(os.empresa_id)}</Typography>
                  </div>
                  <div>
                    <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-xs text-muted-foreground">Descrição</Typography>
                    <Typography component="dd" variant="body2" className="mt-0.5">{os.descricao || "—"}</Typography>
                  </div>
                  <div>
                    <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-xs text-muted-foreground">Prevista</Typography>
                    <Typography component="dd" variant="body2" className="mt-0.5">{fmtData(os.prevista_em)}</Typography>
                  </div>
                  <div>
                    <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-xs text-muted-foreground">Mão de obra</Typography>
                    <Typography component="dd" variant="body2" className="mt-0.5 tabular-nums">{brl(os.valor_mao_obra)}</Typography>
                  </div>
                  {os.valor_total && (
                    <div>
                      <Typography component="dt" variant="caption" color="text.secondary" display="block" className="text-xs text-muted-foreground">Valor total (c/ materiais)</Typography>
                      <Typography component="dd" variant="body2" className="mt-0.5 font-bold tabular-nums">{brl(os.valor_total)}</Typography>
                    </div>
                  )}
                </Box>
              </SectionCard>

              <SectionCard className="p-0 overflow-hidden">
                <div className="px-5 pt-4 pb-2 text-sm font-semibold">
                  Materiais consumidos (baixa de estoque)
                </div>
                <List disablePadding>
                  {(os.materiais ?? []).length === 0 && (
                    <ListItem>Nenhum material.</ListItem>
                  )}
                  {(os.materiais ?? []).map((m, i) => (
                    <ListItem key={i}>
                      <span>{nomeProduto(m.produto_id)}</span>
                      <span className="tabular-nums">
                        {m.quantidade}
                        {m.total ? ` (${brl(m.total)})` : ""}
                      </span>
                    </ListItem>
                  ))}
                </List>
              </SectionCard>

              {os.historico && os.historico.length > 0 && (
                <SectionCard className="p-0 overflow-hidden">
                  <div className="px-5 pt-4 pb-2 text-sm font-semibold">Histórico de status</div>
                  <List disablePadding>
                    {os.historico.map((h) => (
                      <ListItem key={h.id}>
                        <span>
                          {h.status_anterior ? `${statusLabel(h.status_anterior)} → ` : ""}
                          <strong>{statusLabel(h.status_novo)}</strong>
                          {h.observacao ? ` · ${h.observacao}` : ""}
                        </span>
                        <span className="text-muted-foreground">{fmtData(h.created_at)}</span>
                      </ListItem>
                    ))}
                  </List>
                </SectionCard>
              )}
            </div>

            {["aberta", "em_andamento", "aguardando_material"].includes(os.status) && (
              <SectionCard>
                <Typography variant="h6" component="h2" className="mb-3 text-sm font-semibold">Consumir material</Typography>
                <Box component="form" onSubmit={consumir} className="grid gap-3">
                  <Typography component="label" className="text-xs font-medium text-muted-foreground">
                    Produto
                    <TextField size="small" fullWidth select
                      required
                      value={fMat.produto_id}
                      onChange={(e) => setFMat({ ...fMat, produto_id: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                      <MenuItem value="">—</MenuItem>
                      {produtos.map((p) => (
                        <MenuItem key={p.id} value={String(p.id)}>
                          {p.sku} · {p.nome}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Typography>
                  <Typography component="label" className="text-xs font-medium text-muted-foreground">
                    Quantidade
                    <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001" } }}
                      type="number"
                     
                      required
                      value={fMat.quantidade}
                      onChange={(e) => setFMat({ ...fMat, quantidade: e.target.value })} />
                  </Typography>
                  <Button variant="contained" >Consumir</Button>
                </Box>
              </SectionCard>
            )}
          </div>
        </>
      ) : (
        <SectionCard>
          <div className="py-10 text-center text-sm text-muted-foreground">
            {erro ?? "Carregando…"}
          </div>
        </SectionCard>
      )}
    </>
  );
}
