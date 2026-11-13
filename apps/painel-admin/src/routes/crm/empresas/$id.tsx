import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { Metabox, PageHeader, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField } from "@/components/ui-kit/FormDialog";
import { brl, fmtDataHora, statusLabel } from "@/lib/format";
import type { Contato, Empresa, Oportunidade, TabelaPreco } from "@/lib/models";
import { catalogoService, crmService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";

export const Route = createFileRoute("/crm/empresas/$id")({
  component: Empresa360Page,
});

type Linha = Record<string, unknown>;

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
  const [aba, setAba] = useState("dados");

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
        <Metabox title="Empresa">
          <div className="py-10 text-center text-sm text-muted-foreground">
            {erro ?? "Carregando…"}
          </div>
        </Metabox>
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

      <Tabs
        value={aba}
        onChange={(_, v: string) => setAba(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          minHeight: 40,
          "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 500 },
        }}
      >
        <Tab value="dados" label="Dados" />
        <Tab value="contatos" label={`Contatos (${contatos.length})`} />
        <Tab value="enderecos" label={`Endereços (${enderecos.length})`} />
        <Tab value="oportunidades" label={`Oportunidades (${oportunidades.length})`} />
        <Tab value="timeline" label={`Timeline (${interacoes.length})`} />
      </Tabs>

      {aba === "dados" && (
          <Metabox title="Dados cadastrais" contentClassName="p-0">
            <Table size="small">
              <TableBody>
                {([
                  ["CNPJ", empresa.cnpj],
                  ["Razão social", empresa.razao_social],
                  ["Nome fantasia", empresa.nome_fantasia],
                  ["Segmento", empresa.segmento],
                  ["Telefone", empresa.telefone],
                  ["E-mail", empresa.email],
                  ["Site", empresa.site],
                  ["Inscrição estadual", empresa.inscricao_estadual],
                  ["Tabela de preço", nomeTabela(empresa.tabela_preco_id)],
                  ["Observações", empresa.observacoes],
                ] as [string, string | null | undefined][]).map(([k, v]) => (
                  <TableRow
                    key={k}
                    sx={{ "&:nth-of-type(odd)": { bgcolor: "action.hover" } }}
                  >
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{ width: { xs: 140, md: 260 }, color: "text.secondary", fontWeight: 500, whiteSpace: "nowrap" }}
                    >
                      {k}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>
                      {k === "E-mail" && v ? (
                        <a href={`mailto:${v}`} className="text-primary hover:underline">{v}</a>
                      ) : k === "Site" && v ? (
                        <a href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{v}</a>
                      ) : (
                        v || "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Metabox>
      )}

      {aba === "contatos" && (
          <ContatosTab empresaId={empresaId} contatos={contatos} onChange={carregar} />
      )}

      {aba === "enderecos" && (
          <EnderecosTab empresaId={empresaId} enderecos={enderecos} onChange={carregar} />
      )}

      {aba === "oportunidades" && (
          <Metabox
            title="Oportunidades"
            action={
              <Typography variant="caption" color="text.secondary">
                {oportunidades.length} registro(s)
              </Typography>
            }
            contentClassName="p-0"
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Título</TableCell>
                  <TableCell>Estágio</TableCell>
                  <TableCell>Valor est.</TableCell>
                  <TableCell>Previsão</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {oportunidades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 6, color: "text.secondary" }}>
                      Sem oportunidades.
                    </TableCell>
                  </TableRow>
                )}
                {oportunidades.map((o) => (
                  <TableRow key={o.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{o.titulo}</TableCell>
                    <TableCell>
                      <StatusPill status={o.estagio} label={statusLabel(o.estagio)} />
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {brl(o.valor_estimado)}
                    </TableCell>
                    <TableCell>{o.data_prevista_fechamento || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Metabox>
      )}

      {aba === "timeline" && (
          <TimelineTab empresaId={empresaId} interacoes={interacoes} onChange={carregar} />
      )}
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
      <Button variant="outlined" onClick={() => setOpen(true)}>
        Editar
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Editar empresa"
        description={empresa.razao_social}
        submitLabel="Salvar"
        onSubmit={salvar}
      >
        <FormField label="Razão social" wide>
          <TextField size="small" fullWidth required value={f.razao_social} onChange={(e) => setF({ ...f, razao_social: e.target.value })} />
        </FormField>
        <FormField label="Nome fantasia">
          <TextField size="small" fullWidth value={f.nome_fantasia} onChange={(e) => setF({ ...f, nome_fantasia: e.target.value })} />
        </FormField>
        <FormField label="CNPJ">
          <TextField size="small" fullWidth value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} />
        </FormField>
        <FormField label="Status">
          <TextField size="small" fullWidth select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="prospecto">Prospecto</MenuItem>
            <MenuItem value="ativo">Ativo</MenuItem>
            <MenuItem value="inativo">Inativo</MenuItem>
          </TextField>
        </FormField>
        <FormField label="Tabela de preço">
          <TextField size="small" fullWidth select value={f.tabela_preco_id ?? ""} onChange={(e) =>
              setF({ ...f, tabela_preco_id: e.target.value ? Number(e.target.value) : null })
            } slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">Padrão</MenuItem>
            {tabelas.map((t) => (
              <MenuItem key={t.id} value={String(t.id)}>
                {t.nome}
              </MenuItem>
            ))}
          </TextField>
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
    <Metabox
      title="Contatos"
      action={
        <Button variant="contained" size="small" onClick={() => setNovoOpen(true)}>
          + Contato
        </Button>
      }
      contentClassName="p-0"
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            {["Nome", "Cargo", "E-mail", "Telefone", "Principal", "Portal", ""].map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {contatos.map((c) => (
            <TableRow key={c.id} hover>
              <TableCell sx={{ fontWeight: 500 }}>{c.nome}</TableCell>
              <TableCell>{c.cargo || "—"}</TableCell>
              <TableCell>{c.email || "—"}</TableCell>
              <TableCell>{c.telefone || c.whatsapp || "—"}</TableCell>
              <TableCell>{c.is_principal ? "Sim" : ""}</TableCell>
              <TableCell>
                <StatusPill
                  status={c.acesso_portal ? "ativo" : "inativo"}
                  label={c.acesso_portal ? "Ativo" : "Inativo"}
                />
              </TableCell>
              <TableCell align="right">
                {!c.acesso_portal ? (
                  <Button variant="outlined" size="small" onClick={() => setPortalAlvo(c)}>
                    Ativar portal
                  </Button>
                ) : (
                  <Button variant="outlined" size="small" color="error" onClick={() => void revogar(c)}>
                    Revogar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <FormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        title="Novo contato"
        description="Contato vinculado a esta empresa"
        submitLabel="Salvar"
        onSubmit={criar}
      >
        <FormField label="Nome">
          <TextField size="small" fullWidth required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </FormField>
        <FormField label="Cargo">
          <TextField size="small" fullWidth value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} />
        </FormField>
        <FormField label="E-mail">
          <TextField size="small" fullWidth type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </FormField>
        <FormField label="Telefone">
          <TextField size="small" fullWidth value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
        </FormField>
        <FormField label="" wide>
          <FormControlLabel
            control={
              <Checkbox
                checked={f.is_principal}
                onChange={(e) => setF({ ...f, is_principal: e.target.checked })}
              />
            }
            label="Contato principal"
          />
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
          <TextField size="small" fullWidth type="password" required autoComplete="new-password" value={senhaPortal} onChange={(e) => setSenhaPortal(e.target.value)} slotProps={{ htmlInput: { minLength: 6 } }} />
        </FormField>
      </FormDialog>
    </Metabox>
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
    <Metabox
      title="Endereços"
      action={
        <Button variant="contained" size="small" onClick={() => setOpen(true)}>
          + Endereço
        </Button>
      }
      contentClassName="p-0"
    >
      <List disablePadding>
        {enderecos.length === 0 && (
          <ListItem>
            <ListItemText secondary="Nenhum endereço." />
          </ListItem>
        )}
        {enderecos.map((end) => (
          <ListItem
            key={String(end["id"])}
            divider
            secondaryAction={<StatusPill status="draft" label={String(end["tipo"] ?? "")} />}
          >
            <ListItemText
              primary={`${String(end["logradouro"] ?? "")}, ${String(end["numero"] ?? "")} — ${String(end["cidade"] ?? "")}/${String(end["uf"] ?? "")} · CEP ${String(end["cep"] ?? "")}`}
            />
          </ListItem>
        ))}
      </List>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Novo endereço"
        description="Endereço fiscal, de entrega ou correspondência"
        submitLabel="Salvar"
        onSubmit={salvar}
      >
        <FormField label="Tipo">
          <TextField size="small" fullWidth select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="fiscal">Fiscal</MenuItem>
            <MenuItem value="entrega">Entrega</MenuItem>
            <MenuItem value="correspondencia">Correspondência</MenuItem>
          </TextField>
        </FormField>
        <FormField label="Logradouro" wide>
          <TextField size="small" fullWidth value={f.logradouro} onChange={(e) => setF({ ...f, logradouro: e.target.value })} />
        </FormField>
        <FormField label="Número">
          <TextField size="small" fullWidth value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
        </FormField>
        <FormField label="Bairro">
          <TextField size="small" fullWidth value={f.bairro} onChange={(e) => setF({ ...f, bairro: e.target.value })} />
        </FormField>
        <FormField label="CEP">
          <TextField size="small" fullWidth required value={f.cep} onChange={(e) => setF({ ...f, cep: e.target.value })} />
        </FormField>
        <FormField label="Cidade">
          <TextField size="small" fullWidth required value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} />
        </FormField>
        <FormField label="UF">
          <TextField size="small" fullWidth required value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })} slotProps={{ htmlInput: { maxLength: 2 } }} />
        </FormField>
        <FormField label="" wide>
          <FormControlLabel
            control={
              <Checkbox
                checked={f.principal}
                onChange={(e) => setF({ ...f, principal: e.target.checked })}
              />
            }
            label="Endereço principal"
          />
        </FormField>
      </FormDialog>
    </Metabox>
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
    <Metabox
      title="Timeline"
      action={
        <Button variant="contained" size="small" onClick={() => setOpen(true)}>
          + Registrar
        </Button>
      }
      contentClassName="p-0"
    >
      <List disablePadding>
        {interacoes.length === 0 && (
          <ListItem>
            <ListItemText secondary="Nenhuma interação." />
          </ListItem>
        )}
        {interacoes.map((i) => (
          <ListItem key={String(i["id"])} divider>
            <ListItemText
              primary={String(i["assunto"] || i["tipo"] || "")}
              secondary={
                <>
                  <Typography component="span" variant="caption" color="text.secondary" display="block">
                    {fmtDataHora(String(i["ocorrido_em"] || i["created_at"] || ""))}
                  </Typography>
                  {String(i["descricao"] ?? "")}
                </>
              }
            />
          </ListItem>
        ))}
      </List>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Registrar interação"
        description="Histórico de contato com a empresa"
        submitLabel="Registrar"
        onSubmit={salvar}
      >
        <FormField label="Tipo">
          <TextField size="small" fullWidth select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="ligacao">Ligação</MenuItem>
            <MenuItem value="email">E-mail</MenuItem>
            <MenuItem value="whatsapp">WhatsApp</MenuItem>
            <MenuItem value="reuniao">Reunião</MenuItem>
            <MenuItem value="visita">Visita</MenuItem>
            <MenuItem value="nota_interna">Nota interna</MenuItem>
            <MenuItem value="outro">Outro</MenuItem>
          </TextField>
        </FormField>
        <FormField label="Assunto">
          <TextField size="small" fullWidth value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} />
        </FormField>
        <FormField label="Descrição" wide>
          <TextField size="small" fullWidth multiline minRows={3} rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </FormField>
      </FormDialog>
    </Metabox>
  );
}
