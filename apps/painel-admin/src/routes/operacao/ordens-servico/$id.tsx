import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { fieldClass } from "@/components/ui-kit/FormDialog";
import { brl, fmtData, statusLabel } from "@/lib/format";
import type { OrdemServico, Produto } from "@/lib/models";
import { catalogoService, crmService, osService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useRealtimeEvent } from "@/lib/use-realtime";

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
    <AppShell>
      {os ? (
        <>
          <PageHeader
            title={`OS #${os.id}`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={os.status} label={statusLabel(os.status)} />
                <StatusPill status={os.prioridade} label={os.prioridade} />
                {(TRANSICOES[os.status] ?? []).map((t) => (
                  <button
                    key={t.para}
                    onClick={() => void transicionar(os, t.para)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold hover:opacity-90 ${t.cor}`}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-4">
              <SectionCard>
                <h2 className="mb-3 text-sm font-semibold">Detalhes</h2>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Empresa</dt>
                    <dd className="mt-0.5 font-medium">{empresaNome(os.empresa_id)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Descrição</dt>
                    <dd className="mt-0.5">{os.descricao || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Prevista</dt>
                    <dd className="mt-0.5">{fmtData(os.prevista_em)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Mão de obra</dt>
                    <dd className="mt-0.5 tabular-nums">{brl(os.valor_mao_obra)}</dd>
                  </div>
                  {os.valor_total && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Valor total (c/ materiais)</dt>
                      <dd className="mt-0.5 font-bold tabular-nums">{brl(os.valor_total)}</dd>
                    </div>
                  )}
                </dl>
              </SectionCard>

              <SectionCard className="p-0 overflow-hidden">
                <div className="px-5 pt-4 pb-2 text-sm font-semibold">
                  Materiais consumidos (baixa de estoque)
                </div>
                <ul className="divide-y divide-border/60">
                  {(os.materiais ?? []).length === 0 && (
                    <li className="px-5 py-5 text-sm text-muted-foreground">Nenhum material.</li>
                  )}
                  {(os.materiais ?? []).map((m, i) => (
                    <li key={i} className="flex justify-between px-5 py-2.5 text-sm">
                      <span>{nomeProduto(m.produto_id)}</span>
                      <span className="tabular-nums">
                        {m.quantidade}
                        {m.total ? ` (${brl(m.total)})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>

              {os.historico && os.historico.length > 0 && (
                <SectionCard className="p-0 overflow-hidden">
                  <div className="px-5 pt-4 pb-2 text-sm font-semibold">Histórico de status</div>
                  <ul className="divide-y divide-border/60 text-xs">
                    {os.historico.map((h) => (
                      <li key={h.id} className="flex items-center justify-between px-5 py-2.5">
                        <span>
                          {h.status_anterior ? `${statusLabel(h.status_anterior)} → ` : ""}
                          <strong>{statusLabel(h.status_novo)}</strong>
                          {h.observacao ? ` · ${h.observacao}` : ""}
                        </span>
                        <span className="text-muted-foreground">{fmtData(h.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </div>

            {["aberta", "em_andamento", "aguardando_material"].includes(os.status) && (
              <SectionCard>
                <h2 className="mb-3 text-sm font-semibold">Consumir material</h2>
                <form onSubmit={consumir} className="grid gap-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Produto
                    <select
                      className={fieldClass}
                      required
                      value={fMat.produto_id}
                      onChange={(e) => setFMat({ ...fMat, produto_id: e.target.value })}
                    >
                      <option value="">—</option>
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} · {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Quantidade
                    <input
                      className={fieldClass}
                      type="number"
                      step="0.001"
                      required
                      value={fMat.quantidade}
                      onChange={(e) => setFMat({ ...fMat, quantidade: e.target.value })}
                    />
                  </label>
                  <button className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                    Consumir
                  </button>
                </form>
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
    </AppShell>
  );
}
