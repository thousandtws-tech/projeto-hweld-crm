import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, fmtDataHora, statusLabel } from "@/lib/format";
import type { Contato, Empresa, Oportunidade, TabelaPreco } from "@/lib/models";
import { catalogoService, crmService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";

export const Route = createFileRoute("/crm/empresas/$id")({
  component: Empresa360Page,
});

type Linha = Record<string, unknown>;

const inputClass = fieldClass;

/** Empresa 360 — dados, contatos (+portal), endereços, oportunidades, timeline. */
function Empresa360Page() {
  const { id: ref } = Route.useParams();
  const navigate = useNavigate();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [enderecos, setEnderecos] = useState<Linha[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [interacoes, setInteracoes] = useState<Linha[]>([]);
  const [tabelas, setTabelas] = useState<TabelaPreco[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const empresaId = empresa?.id ?? 0;

  const carregar = useCallback(async () => {
    // Resolve pela referência da URL (public_id UUID ou id numérico legado) e
    // canonicaliza a URL para o public_id — o id sequencial nunca fica visível.
    crmService
      .empresa(ref)
      .then((e) => {
        setEmpresa(e);
        setErro(null);
        if (ref !== e.public_id) {
          void navigate({
            to: "/crm/empresas/$id",
            params: { id: e.public_id },
            replace: true,
          });
        }
      })
      .catch(() => setErro("Empresa não encontrada."));
    catalogoService
      .tabelas({ ativa: true })
      .then((p) => setTabelas(p.itens ?? []))
      .catch(() => setTabelas([]));
  }, [ref, navigate]);

  // Relacionados dependem do id numérico resolvido — só rodam após a empresa.
  useEffect(() => {
    if (!empresa) return;
    const id = empresa.id;
    crmService
      .contatos({ empresa_id: id })
      .then((p) => setContatos(p.itens ?? []))
      .catch(() => setContatos([]));
    crmService
      .enderecos(id)
      .then((p) => setEnderecos(p.itens ?? []))
      .catch(() => setEnderecos([]));
    crmService
      .oportunidades({ empresa_id: id })
      .then((p) => setOportunidades(p.itens ?? []))
      .catch(() => setOportunidades([]));
    crmService
      .timeline({ empresa_id: id })
      .then((p) => setInteracoes(p.itens ?? []))
      .catch(() => setInteracoes([]));
  }, [empresa]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // empresa.* cobre dados cadastrais, contatos, portal e endereços; scoped por id.
  useRealtimeEvent(
    (t) => t.startsWith("empresa."),
    (e) => {
      if (Number(e.dados["id"] ?? e.dados["empresa_id"]) === empresaId) void carregar();
    },
  );

  const nomeTabela = (tid: number | null) => tabelas.find((t) => t.id === tid)?.nome ?? "Padrão";

  if (!empresa) {
    return (
      <>
        <SectionCard>
          <div className="py-10 text-center text-sm text-muted-foreground">
            {erro ?? "Carregando…"}
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={empresa.nome_fantasia || empresa.razao_social}
        subtitle={`${empresa.razao_social} · CNPJ ${empresa.cnpj || "—"}`}
        action={
          <div className="flex items-center gap-3">
            <StatusPill status={empresa.status} label={statusLabel(empresa.status)} />
            <EditarEmpresaButton empresa={empresa} tabelas={tabelas} onSaved={setEmpresa} />
          </div>
        }
      />

      <Tabs defaultValue="dados">
        <TabsList className="rounded-2xl bg-secondary/60 p-1">
          <TabsTrigger value="dados" className="rounded-xl">
            Dados
          </TabsTrigger>
          <TabsTrigger value="contatos" className="rounded-xl">
            Contatos ({contatos.length})
          </TabsTrigger>
          <TabsTrigger value="enderecos" className="rounded-xl">
            Endereços ({enderecos.length})
          </TabsTrigger>
          <TabsTrigger value="oportunidades" className="rounded-xl">
            Oportunidades ({oportunidades.length})
          </TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-xl">
            Timeline ({interacoes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <SectionCard>
            <dl className="grid grid-cols-2 gap-5 md:grid-cols-3">
              {[
                ["Segmento", empresa.segmento],
                ["Telefone", empresa.telefone],
                ["E-mail", empresa.email],
                ["Site", empresa.site],
                ["IE", empresa.inscricao_estadual],
                ["Tabela de preço", nomeTabela(empresa.tabela_preco_id)],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-1 text-sm font-medium">{(v as string) || "—"}</dd>
                </div>
              ))}
              <div className="col-span-2 md:col-span-3">
                <dt className="text-xs text-muted-foreground">Observações</dt>
                <dd className="mt-1 text-sm font-medium">{empresa.observacoes || "—"}</dd>
              </div>
            </dl>
          </SectionCard>
        </TabsContent>

        <TabsContent value="contatos">
          <ContatosTab empresaId={empresaId} contatos={contatos} onChange={carregar} />
        </TabsContent>

        <TabsContent value="enderecos">
          <EnderecosTab empresaId={empresaId} enderecos={enderecos} onChange={carregar} />
        </TabsContent>

        <TabsContent value="oportunidades">
          <SectionCard className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Estágio</th>
                  <th className="px-4 py-3 font-semibold">Valor est.</th>
                  <th className="px-4 py-3 font-semibold">Previsão</th>
                </tr>
              </thead>
              <tbody>
                {oportunidades.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Sem oportunidades.
                    </td>
                  </tr>
                )}
                {oportunidades.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{o.titulo}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={o.estagio} label={statusLabel(o.estagio)} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{brl(o.valor_estimado)}</td>
                    <td className="px-4 py-3">{o.data_prevista_fechamento || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineTab empresaId={empresaId} interacoes={interacoes} onChange={carregar} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ---- Edição da empresa ---- */

function EditarEmpresaButton({
  empresa,
  tabelas,
  onSaved,
}: {
  empresa: Empresa;
  tabelas: TabelaPreco[];
  onSaved: (e: Empresa) => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    razao_social: empresa.razao_social,
    nome_fantasia: empresa.nome_fantasia ?? "",
    cnpj: empresa.cnpj ?? "",
    status: empresa.status,
    tabela_preco_id: empresa.tabela_preco_id,
  });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const atualizada = await crmService.atualizarEmpresa(empresa.id, f);
      onSaved(atualizada);
      setOpen(false);
      toast.success("Empresa atualizada.");
    } catch {
      toast.error("Falha ao salvar.");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
      >
        Editar
      </button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Editar empresa"
        description={empresa.razao_social}
        submitLabel="Salvar"
        onSubmit={salvar}
      >
        <FormField label="Razão social" wide>
          <input
            className={inputClass}
            required
            value={f.razao_social}
            onChange={(e) => setF({ ...f, razao_social: e.target.value })}
          />
        </FormField>
        <FormField label="Nome fantasia">
          <input
            className={inputClass}
            value={f.nome_fantasia}
            onChange={(e) => setF({ ...f, nome_fantasia: e.target.value })}
          />
        </FormField>
        <FormField label="CNPJ">
          <input
            className={inputClass}
            value={f.cnpj}
            onChange={(e) => setF({ ...f, cnpj: e.target.value })}
          />
        </FormField>
        <FormField label="Status">
          <select
            className={inputClass}
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
          >
            <option value="prospecto">Prospecto</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </FormField>
        <FormField label="Tabela de preço">
          <select
            className={inputClass}
            value={f.tabela_preco_id ?? ""}
            onChange={(e) =>
              setF({ ...f, tabela_preco_id: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">Padrão</option>
            {tabelas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </FormField>
      </FormDialog>
    </>
  );
}

/* ---- Contatos (+ portal) ---- */

function ContatosTab({
  empresaId,
  contatos,
  onChange,
}: {
  empresaId: number;
  contatos: Contato[];
  onChange: () => void;
}) {
  const [novoOpen, setNovoOpen] = useState(false);
  const [portalAlvo, setPortalAlvo] = useState<Contato | null>(null);
  const [senhaPortal, setSenhaPortal] = useState("");
  const [f, setF] = useState({ nome: "", cargo: "", email: "", telefone: "", is_principal: false });

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await crmService.criarContato({ ...f, empresa_id: empresaId, acesso_portal: false });
      setNovoOpen(false);
      setF({ nome: "", cargo: "", email: "", telefone: "", is_principal: false });
      onChange();
      toast.success("Contato criado.");
    } catch {
      toast.error("Falha ao criar contato.");
    }
  };

  const ativarPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalAlvo) return;
    try {
      await crmService.ativarPortal(portalAlvo.id, senhaPortal);
      setPortalAlvo(null);
      setSenhaPortal("");
      onChange();
      toast.success("Portal ativado.");
    } catch {
      toast.error("Falha ao ativar portal.");
    }
  };

  const revogar = async (c: Contato) => {
    try {
      await crmService.desativarPortal(c.id);
      onChange();
    } catch {
      toast.error("Falha ao revogar acesso.");
    }
  };

  return (
    <SectionCard className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="text-sm font-semibold">Contatos</span>
        <button
          onClick={() => setNovoOpen(true)}
          className="rounded-full bg-lime px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          + Contato
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {["Nome", "Cargo", "E-mail", "Telefone", "Principal", "Portal", ""].map((h) => (
              <th key={h} className="px-4 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contatos.map((c) => (
            <tr key={c.id} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-2.5 font-medium">{c.nome}</td>
              <td className="px-4 py-2.5">{c.cargo || "—"}</td>
              <td className="px-4 py-2.5">{c.email || "—"}</td>
              <td className="px-4 py-2.5">{c.telefone || c.whatsapp || "—"}</td>
              <td className="px-4 py-2.5">{c.is_principal ? "Sim" : ""}</td>
              <td className="px-4 py-2.5">
                <StatusPill
                  status={c.acesso_portal ? "ativo" : "inativo"}
                  label={c.acesso_portal ? "Ativo" : "Inativo"}
                />
              </td>
              <td className="px-4 py-2.5 text-right">
                {!c.acesso_portal ? (
                  <button
                    onClick={() => setPortalAlvo(c)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
                  >
                    Ativar portal
                  </button>
                ) : (
                  <button
                    onClick={() => void revogar(c)}
                    className="rounded-full border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    Revogar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <FormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        title="Novo contato"
        description="Contato vinculado a esta empresa"
        submitLabel="Salvar"
        onSubmit={criar}
      >
        <FormField label="Nome">
          <input
            className={inputClass}
            required
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })}
          />
        </FormField>
        <FormField label="Cargo">
          <input
            className={inputClass}
            value={f.cargo}
            onChange={(e) => setF({ ...f, cargo: e.target.value })}
          />
        </FormField>
        <FormField label="E-mail">
          <input
            className={inputClass}
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </FormField>
        <FormField label="Telefone">
          <input
            className={inputClass}
            value={f.telefone}
            onChange={(e) => setF({ ...f, telefone: e.target.value })}
          />
        </FormField>
        <FormField label="" wide>
          <label className="mt-1 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={f.is_principal}
              onChange={(e) => setF({ ...f, is_principal: e.target.checked })}
            />
            Contato principal
          </label>
        </FormField>
      </FormDialog>

      <FormDialog
        open={portalAlvo !== null}
        onOpenChange={(o) => !o && setPortalAlvo(null)}
        title="Ativar acesso ao portal"
        description={`Defina a senha inicial de ${portalAlvo?.nome ?? ""}. Ela poderá ser trocada no primeiro acesso.`}
        submitLabel="Ativar"
        onSubmit={ativarPortal}
      >
        <FormField label="Senha inicial" wide>
          <input
            className={inputClass}
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={senhaPortal}
            onChange={(e) => setSenhaPortal(e.target.value)}
          />
        </FormField>
      </FormDialog>
    </SectionCard>
  );
}

/* ---- Endereços ---- */

function EnderecosTab({
  empresaId,
  enderecos,
  onChange,
}: {
  empresaId: number;
  enderecos: Linha[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    tipo: "fiscal",
    logradouro: "",
    numero: "",
    bairro: "",
    cep: "",
    cidade: "",
    uf: "",
    principal: false,
  });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await crmService.criarEndereco({ ...f, empresa_id: empresaId });
      setOpen(false);
      onChange();
      toast.success("Endereço criado.");
    } catch {
      toast.error("Falha ao salvar endereço.");
    }
  };

  return (
    <SectionCard className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="text-sm font-semibold">Endereços</span>
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-lime px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          + Endereço
        </button>
      </div>
      <ul className="divide-y divide-border/60">
        {enderecos.length === 0 && (
          <li className="px-5 py-6 text-sm text-muted-foreground">Nenhum endereço.</li>
        )}
        {enderecos.map((end) => (
          <li
            key={String(end["id"])}
            className="flex items-center justify-between px-5 py-3 text-sm"
          >
            <span>
              {String(end["logradouro"] ?? "")}, {String(end["numero"] ?? "")} —{" "}
              {String(end["cidade"] ?? "")}/{String(end["uf"] ?? "")} · CEP{" "}
              {String(end["cep"] ?? "")}
            </span>
            <StatusPill status="draft" label={String(end["tipo"] ?? "")} />
          </li>
        ))}
      </ul>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Novo endereço"
        description="Endereço fiscal, de entrega ou correspondência"
        submitLabel="Salvar"
        onSubmit={salvar}
      >
        <FormField label="Tipo">
          <select
            className={inputClass}
            value={f.tipo}
            onChange={(e) => setF({ ...f, tipo: e.target.value })}
          >
            <option value="fiscal">Fiscal</option>
            <option value="entrega">Entrega</option>
            <option value="correspondencia">Correspondência</option>
          </select>
        </FormField>
        <FormField label="Logradouro" wide>
          <input
            className={inputClass}
            value={f.logradouro}
            onChange={(e) => setF({ ...f, logradouro: e.target.value })}
          />
        </FormField>
        <FormField label="Número">
          <input
            className={inputClass}
            value={f.numero}
            onChange={(e) => setF({ ...f, numero: e.target.value })}
          />
        </FormField>
        <FormField label="Bairro">
          <input
            className={inputClass}
            value={f.bairro}
            onChange={(e) => setF({ ...f, bairro: e.target.value })}
          />
        </FormField>
        <FormField label="CEP">
          <input
            className={inputClass}
            required
            value={f.cep}
            onChange={(e) => setF({ ...f, cep: e.target.value })}
          />
        </FormField>
        <FormField label="Cidade">
          <input
            className={inputClass}
            required
            value={f.cidade}
            onChange={(e) => setF({ ...f, cidade: e.target.value })}
          />
        </FormField>
        <FormField label="UF">
          <input
            className={inputClass}
            required
            maxLength={2}
            value={f.uf}
            onChange={(e) => setF({ ...f, uf: e.target.value })}
          />
        </FormField>
        <FormField label="" wide>
          <label className="mt-1 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={f.principal}
              onChange={(e) => setF({ ...f, principal: e.target.checked })}
            />
            Endereço principal
          </label>
        </FormField>
      </FormDialog>
    </SectionCard>
  );
}

/* ---- Timeline ---- */

function TimelineTab({
  empresaId,
  interacoes,
  onChange,
}: {
  empresaId: number;
  interacoes: Linha[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ tipo: "nota_interna", assunto: "", descricao: "" });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await crmService.registrarInteracao({ ...f, empresa_id: empresaId });
      setOpen(false);
      onChange();
      toast.success("Interação registrada.");
    } catch {
      toast.error("Falha ao registrar.");
    }
  };

  return (
    <SectionCard className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="text-sm font-semibold">Interações</span>
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-lime px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          + Registrar
        </button>
      </div>
      <ul className="divide-y divide-border/60">
        {interacoes.length === 0 && (
          <li className="px-5 py-6 text-sm text-muted-foreground">Nenhuma interação.</li>
        )}
        {interacoes.map((i) => (
          <li key={String(i["id"])} className="px-5 py-3">
            <div className="flex items-center justify-between">
              <strong className="text-sm">{String(i["assunto"] || i["tipo"] || "")}</strong>
              <small className="text-xs text-muted-foreground">
                {fmtDataHora(String(i["ocorrido_em"] || i["created_at"] || ""))}
              </small>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{String(i["descricao"] ?? "")}</div>
          </li>
        ))}
      </ul>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Registrar interação"
        description="Histórico de contato com a empresa"
        submitLabel="Registrar"
        onSubmit={salvar}
      >
        <FormField label="Tipo">
          <select
            className={inputClass}
            value={f.tipo}
            onChange={(e) => setF({ ...f, tipo: e.target.value })}
          >
            <option value="ligacao">Ligação</option>
            <option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="reuniao">Reunião</option>
            <option value="visita">Visita</option>
            <option value="nota_interna">Nota interna</option>
            <option value="outro">Outro</option>
          </select>
        </FormField>
        <FormField label="Assunto">
          <input
            className={inputClass}
            value={f.assunto}
            onChange={(e) => setF({ ...f, assunto: e.target.value })}
          />
        </FormField>
        <FormField label="Descrição" wide>
          <textarea
            className={inputClass}
            rows={3}
            value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })}
          />
        </FormField>
      </FormDialog>
    </SectionCard>
  );
}
