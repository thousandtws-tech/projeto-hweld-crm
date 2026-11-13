import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, MapPin, Plus, Search, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { Metabox, PageHeader } from "@/components/ui-kit/primitives";
import { FormField } from "@/components/ui-kit/FormDialog";
import { ApiError } from "@/lib/api";
import {
  apenasDigitos,
  cepMask,
  cnpjMask,
  telefoneMask,
  validarCnpjModulo11,
} from "@/lib/algoritmos";
import { consultarCnpjReceita, ErroConsultaCnpj, type DadosCnpjReceita } from "@/lib/brasilapi";
import type { TabelaPreco } from "@/lib/models";
import { catalogoService, crmService } from "@/lib/services";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/crm/empresas/nova")({
  component: EmpresaNovaPage,
});

/** Converte `""` em `null` para respeitar `validar_opcional` do backend Rust. */
const optStr = (v: string): string | null => {
  const t = v.trim();
  return t.length > 0 ? t : null;
};

function EmpresaNovaPage() {
  const navigate = useNavigate();
  const ultimoCnpjConsultadoRef = useRef<string>("");

  const [tabelas, setTabelas] = useState<TabelaPreco[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [dadosReceita, setDadosReceita] = useState<DadosCnpjReceita | null>(null);

  const [f, setF] = useState({
    cnpj: "",
    razao_social: "",
    nome_fantasia: "",
    inscricao_estadual: "",
    segmento: "",
    status: "prospecto",
    tabela_preco_id: "",
    email: "",
    telefone: "",
    site: "",
    observacoes: "",
  });

  // Seções opcionais para cadastrar Empresa + Endereço Fiscal + Contato Principal de uma só vez
  const [incluirEndereco, setIncluirEndereco] = useState(false);
  const [fEnd, setFEnd] = useState({
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  });

  const [incluirContato, setIncluirContato] = useState(false);
  const [fContato, setFContato] = useState({
    nome: "",
    cargo: "",
    email: "",
    telefone: "",
  });

  useEffect(() => {
    catalogoService
      .tabelas({ ativa: true, por_pagina: 100 })
      .then((p) => setTabelas(p.itens ?? []))
      .catch(() => {});
  }, []);

  const cnpjDigitos = useMemo(() => apenasDigitos(f.cnpj), [f.cnpj]);
  const cnpjCompleto = cnpjDigitos.length === 14;
  const cnpjValido = useMemo(
    () => !cnpjCompleto || validarCnpjModulo11(cnpjDigitos),
    [cnpjCompleto, cnpjDigitos],
  );

  /** Consulta CNPJ na Receita (BrasilAPI direto do navegador) e hidrata dados + endereço fiscal. */
  const consultarCnpj = useCallback(
    async (digitosAlvo?: string) => {
      const digitos = digitosAlvo ?? apenasDigitos(f.cnpj);
      if (digitos.length !== 14 || !validarCnpjModulo11(digitos) || consultando) return;
      ultimoCnpjConsultadoRef.current = digitos;
      setConsultando(true);
      try {
        const d = await consultarCnpjReceita(digitos);
        setDadosReceita(d);
        setF((p) => ({
          ...p,
          cnpj: cnpjMask(d.cnpj || digitos),
          razao_social: p.razao_social || d.razao_social || "",
          nome_fantasia: p.nome_fantasia || d.nome_fantasia || "",
          email: p.email || (d.email ? d.email.toLowerCase() : ""),
          telefone: p.telefone || (d.telefone ? telefoneMask(d.telefone) : ""),
          segmento: p.segmento || d.segmento_sugerido || "",
        }));

        // Se a Receita devolveu endereço, já preenche e habilita o endereço fiscal automaticamente
        if (d.cidade && d.uf && d.cep) {
          setIncluirEndereco(true);
          setFEnd((prev) => ({
            cep: prev.cep || cepMask(d.cep ?? ""),
            logradouro: prev.logradouro || d.logradouro || "",
            numero: prev.numero || d.numero || "",
            complemento: prev.complemento || d.complemento || "",
            bairro: prev.bairro || d.bairro || "",
            cidade: prev.cidade || d.cidade || "",
            uf: prev.uf || (d.uf ?? "").toUpperCase(),
          }));
        }

        if (d.situacao_cadastral && d.situacao_cadastral.toUpperCase() !== "ATIVA") {
          toast.warning(`CNPJ com situação "${d.situacao_cadastral}" na Receita Federal.`);
        } else {
          toast.success("Dados preenchidos via Receita Federal.");
        }
      } catch (e) {
        toast.error(
          e instanceof ErroConsultaCnpj && e.status === 404
            ? "CNPJ não encontrado na base da Receita."
            : "Não foi possível consultar o CNPJ no momento.",
        );
      } finally {
        setConsultando(false);
      }
    },
    [f.cnpj, consultando],
  );

  // Auto-lookup assim que o usuário termina de digitar ou colar 14 dígitos válidos
  useEffect(() => {
    if (
      cnpjDigitos.length === 14 &&
      validarCnpjModulo11(cnpjDigitos) &&
      ultimoCnpjConsultadoRef.current !== cnpjDigitos
    ) {
      void consultarCnpj(cnpjDigitos);
    }
  }, [cnpjDigitos, consultarCnpj]);

  const enderecoValido =
    !incluirEndereco ||
    (apenasDigitos(fEnd.cep).length === 8 &&
      fEnd.cidade.trim().length > 0 &&
      fEnd.uf.trim().length === 2);

  const contatoValido = !incluirContato || fContato.nome.trim().length > 0;

  const podeSalvar =
    f.razao_social.trim().length > 0 &&
    (cnpjDigitos.length === 0 || (cnpjCompleto && cnpjValido)) &&
    enderecoValido &&
    contatoValido &&
    !salvando;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      // 1. Cria a empresa enviando `null` nos campos opcionais vazios (contrato exato do backend Rust)
      const empresa = await crmService.criarEmpresa({
        razao_social: f.razao_social.trim(),
        nome_fantasia: optStr(f.nome_fantasia),
        cnpj: cnpjDigitos.length === 14 ? cnpjDigitos : null,
        inscricao_estadual: optStr(f.inscricao_estadual),
        segmento: optStr(f.segmento),
        telefone: optStr(f.telefone),
        email: optStr(f.email),
        site: optStr(f.site),
        status: f.status,
        tabela_preco_id: f.tabela_preco_id ? Number(f.tabela_preco_id) : null,
        observacoes: optStr(f.observacoes),
      });

      // 2. Cria endereço fiscal principal e contato principal em paralelo (quando preenchidos)
      const tarefasComplementares: Promise<unknown>[] = [];

      if (incluirEndereco && enderecoValido) {
        tarefasComplementares.push(
          crmService.criarEndereco({
            empresa_id: empresa.id,
            tipo: "fiscal",
            cep: apenasDigitos(fEnd.cep),
            logradouro: optStr(fEnd.logradouro),
            numero: optStr(fEnd.numero),
            complemento: optStr(fEnd.complemento),
            bairro: optStr(fEnd.bairro),
            cidade: fEnd.cidade.trim(),
            uf: fEnd.uf.trim().toUpperCase(),
            pais: "Brasil",
            principal: true,
          }),
        );
      }

      if (incluirContato && fContato.nome.trim()) {
        tarefasComplementares.push(
          crmService.criarContato({
            empresa_id: empresa.id,
            nome: fContato.nome.trim(),
            cargo: optStr(fContato.cargo),
            email: optStr(fContato.email),
            telefone: optStr(fContato.telefone),
            whatsapp: null,
            is_principal: true,
            acesso_portal: false,
            observacoes: null,
          }),
        );
      }

      if (tarefasComplementares.length > 0) {
        await Promise.allSettled(tarefasComplementares);
      }

      toast.success("Empresa cadastrada com sucesso.");
      navigate({ to: `/crm/empresas/${empresa.id}` as "/" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Já existe uma empresa cadastrada com este CNPJ.");
      } else if (err instanceof ApiError && err.status === 422) {
        toast.error("Dados inválidos. Verifique CNPJ, e-mail ou campos preenchidos.");
      } else {
        toast.error("Falha ao criar empresa.");
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Nova empresa"
        subtitle="Digite o CNPJ para preenchimento automático via Receita Federal ou preencha manualmente"
      />

      <Box
        component="form"
        onSubmit={salvar}
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        {/* Coluna principal */}
        <div className="min-w-0 space-y-5">
        {/* Bloco 1: Identificação e Consulta CNPJ */}
        <Metabox
          title="Dados cadastrais"
          action={
            dadosReceita?.situacao_cadastral ? (
              <span className="text-xs text-muted-foreground">
                Receita:{dadosReceita.nome_fantasia ? ` ${dadosReceita.nome_fantasia} ·` : ""}{" "}
                <strong
                  className={
                    dadosReceita.situacao_cadastral.toUpperCase() === "ATIVA"
                      ? "text-primary"
                      : "text-[#D92546]"
                  }
                >
                  {dadosReceita.situacao_cadastral}
                </strong>
                {dadosReceita.porte ? ` · ${dadosReceita.porte}` : ""}
                {dadosReceita.cnae_fiscal_descricao
                  ? ` · ${dadosReceita.cnae_fiscal_descricao}`
                  : ""}
              </span>
            ) : undefined
          }
        >
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-6">
            <FormField label="CNPJ" colSpan={3}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { inputMode: "numeric" } }}
                    value={f.cnpj}
                    onChange={(e) => setF((p) => ({ ...p, cnpj: cnpjMask(e.target.value) }))}
                    placeholder="00.000.000/0000-00" />
                  {cnpjCompleto && cnpjValido && !consultando && (
                    <Check className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
                  )}
                </div>
                <Button variant="outlined" size="small" type="button" onClick={() => void consultarCnpj()} disabled={!cnpjCompleto || !cnpjValido || consultando} title="Consultar na Receita Federal">{consultando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  {consultando ? "Consultando" : "Consultar"}</Button>
              </div>
              {cnpjCompleto && !cnpjValido && (
                <span className="mt-1 block text-[11px] text-[#D92546]">
                  Dígitos verificadores do CNPJ inválidos.
                </span>
              )}
            </FormField>

            <FormField label="Inscrição Estadual (IE)" colSpan={3}>
              <TextField size="small" fullWidth
                value={f.inscricao_estadual}
                onChange={(e) => setF((p) => ({ ...p, inscricao_estadual: e.target.value }))}
                placeholder="Isento ou número" />
            </FormField>

            <FormField label="Razão social *" colSpan={6}>
              <TextField size="small" fullWidth
                required
                value={f.razao_social}
                onChange={(e) => setF((p) => ({ ...p, razao_social: e.target.value }))}
                placeholder="Nome empresarial oficial" />
            </FormField>

            <FormField label="Nome fantasia" colSpan={3}>
              <TextField size="small" fullWidth
                value={f.nome_fantasia}
                onChange={(e) => setF((p) => ({ ...p, nome_fantasia: e.target.value }))}
                placeholder="Como a empresa é conhecida" />
            </FormField>

            <FormField label="Segmento" colSpan={3}>
              <TextField size="small" fullWidth
                value={f.segmento}
                onChange={(e) => setF((p) => ({ ...p, segmento: e.target.value }))}
                placeholder="Ex.: Metalurgia, Indústria" />
            </FormField>

            <FormField label="E-mail corporativo" colSpan={2}>
              <TextField size="small" fullWidth
                type="email"
                value={f.email}
                onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))}
                placeholder="contato@empresa.com.br" />
            </FormField>

            <FormField label="Telefone" colSpan={2}>
              <TextField size="small" fullWidth slotProps={{ htmlInput: { inputMode: "tel" } }}
                value={f.telefone}
                onChange={(e) => setF((p) => ({ ...p, telefone: telefoneMask(e.target.value) }))}
                placeholder="(00) 00000-0000" />
            </FormField>

            <FormField label="Site" colSpan={2}>
              <TextField size="small" fullWidth
                value={f.site}
                onChange={(e) => setF((p) => ({ ...p, site: e.target.value }))}
                placeholder="https://..." />
            </FormField>

            <FormField label="Observações internas" colSpan={6}>
              <TextField size="small" fullWidth multiline minRows={3}
                value={f.observacoes}
                onChange={(e) => setF((p) => ({ ...p, observacoes: e.target.value }))}
                placeholder="Notas sobre perfil de compra, condições comerciais ou referências…" />
            </FormField>
          </div>
        </Metabox>

        {/* Bloco 2: Endereço Fiscal Principal (preenchido automaticamente pela Receita ou sob demanda) */}
        <Metabox
          title="Endereço fiscal principal"
          action={
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={incluirEndereco}
                  onChange={(e) => setIncluirEndereco(e.target.checked)}
                />
              }
              label={<Typography variant="caption" fontWeight={500}>Cadastrar endereço agora</Typography>}
            />
          }
        >
          {!incluirEndereco ? (
            <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-5 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <div className="text-xs leading-relaxed">
                <p className="font-medium text-foreground">Nenhum endereço fiscal neste cadastro</p>
                <p>Preenchido automaticamente ao consultar o CNPJ — ou marque "Cadastrar endereço agora". Necessário para pedidos e notas.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-6">
              <FormField label="CEP *" colSpan={2}>
                <TextField size="small" fullWidth slotProps={{ htmlInput: { inputMode: "numeric" } }}
                  required={incluirEndereco}
                  value={fEnd.cep}
                  onChange={(e) => setFEnd((p) => ({ ...p, cep: cepMask(e.target.value) }))}
                  placeholder="00000-000" />
              </FormField>
              <FormField label="Logradouro" colSpan={4}>
                <TextField size="small" fullWidth
                  value={fEnd.logradouro}
                  onChange={(e) => setFEnd((p) => ({ ...p, logradouro: e.target.value }))} />
              </FormField>
              <FormField label="Número" colSpan={2}>
                <TextField size="small" fullWidth
                  value={fEnd.numero}
                  onChange={(e) => setFEnd((p) => ({ ...p, numero: e.target.value }))} />
              </FormField>
              <FormField label="Complemento" colSpan={2}>
                <TextField size="small" fullWidth
                  value={fEnd.complemento}
                  onChange={(e) => setFEnd((p) => ({ ...p, complemento: e.target.value }))} />
              </FormField>
              <FormField label="Bairro" colSpan={2}>
                <TextField size="small" fullWidth
                  value={fEnd.bairro}
                  onChange={(e) => setFEnd((p) => ({ ...p, bairro: e.target.value }))} />
              </FormField>
              <FormField label="Cidade *" colSpan={4}>
                <TextField size="small" fullWidth
                  required={incluirEndereco}
                  value={fEnd.cidade}
                  onChange={(e) => setFEnd((p) => ({ ...p, cidade: e.target.value }))} />
              </FormField>
              <FormField label="UF *" colSpan={2}>
                <TextField size="small" fullWidth slotProps={{ htmlInput: { maxLength: 2 } }}
                  required={incluirEndereco}
                  value={fEnd.uf}
                  onChange={(e) => setFEnd((p) => ({ ...p, uf: e.target.value.toUpperCase() }))}
                  placeholder="SP" />
              </FormField>
            </div>
          )}
        </Metabox>

        {/* Bloco 3: Contato Principal (opcional para já deixar pronto para orçamentos e pedidos) */}
        <Metabox
          title="Contato principal"
          action={
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={incluirContato}
                  onChange={(e) => setIncluirContato(e.target.checked)}
                />
              }
              label={<Typography variant="caption" fontWeight={500}>Cadastrar contato agora</Typography>}
            />
          }
        >
          {!incluirContato ? (
            <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-4 py-5 text-muted-foreground">
              <UserRound className="h-4 w-4 shrink-0" />
              <div className="text-xs leading-relaxed">
                <p className="font-medium text-foreground">Nenhum contato neste cadastro</p>
                <p>Comprador ou responsável comercial na empresa — marque "Cadastrar contato agora" para já deixar pronto para orçamentos e acesso ao portal.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-6">
              <FormField label="Nome *" colSpan={3}>
                <TextField size="small" fullWidth
                  required={incluirContato}
                  value={fContato.nome}
                  onChange={(e) => setFContato((p) => ({ ...p, nome: e.target.value }))} />
              </FormField>
              <FormField label="Cargo" colSpan={3}>
                <TextField size="small" fullWidth
                  value={fContato.cargo}
                  onChange={(e) => setFContato((p) => ({ ...p, cargo: e.target.value }))}
                  placeholder="Ex.: Compras, Engenharia" />
              </FormField>
              <FormField label="Telefone / WhatsApp" colSpan={2}>
                <TextField size="small" fullWidth
                  value={fContato.telefone}
                  onChange={(e) =>
                    setFContato((p) => ({ ...p, telefone: telefoneMask(e.target.value) }))
                  }
                  placeholder="(00) 00000-0000" />
              </FormField>
              <FormField label="E-mail do contato" colSpan={4}>
                <TextField size="small" fullWidth
                  type="email"
                  value={fContato.email}
                  onChange={(e) => setFContato((p) => ({ ...p, email: e.target.value }))} />
              </FormField>
            </div>
          )}
        </Metabox>
        </div>

        {/* Sidebar — publicação/classificação, padrão WooCommerce */}
        <div className="space-y-5 lg:sticky lg:top-6">
          <Metabox title="Cadastro">
            <div className="space-y-5">
              <Typography variant="caption" component="p" className="leading-relaxed text-muted-foreground">
                Somente a <strong className="font-medium text-foreground">Razão social</strong> é
                obrigatória — os demais dados podem ser completados depois na ficha da empresa.
              </Typography>

              <FormField label="Status inicial">
                <TextField size="small" fullWidth select
                  value={f.status}
                  onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))} slotProps={{ select: { displayEmpty: true } }}>
                  <MenuItem value="prospecto">Prospecto</MenuItem>
                  <MenuItem value="ativo">Ativo</MenuItem>
                </TextField>
              </FormField>

              <FormField label="Tabela de preço">
                <TextField size="small" fullWidth select
                  value={f.tabela_preco_id}
                  onChange={(e) => setF((p) => ({ ...p, tabela_preco_id: e.target.value }))} slotProps={{ select: { displayEmpty: true } }}>
                  <MenuItem value="">Padrão do catálogo</MenuItem>
                  {tabelas.map((t) => (
                    <MenuItem key={t.id} value={String(t.id)}>
                      {t.nome}
                    </MenuItem>
                  ))}
                </TextField>
              </FormField>

              <Divider />

              <div className="flex flex-col gap-2">
                <Button variant="contained" type="submit" fullWidth disabled={!podeSalvar}
                  startIcon={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
                  {salvando ? "Criando empresa…" : "Criar empresa"}
                </Button>
                <Button variant="outlined" fullWidth component={Link} to="/crm/empresas">
                  Cancelar
                </Button>
              </div>
            </div>
          </Metabox>
        </div>
      </Box>
    </>
  );
}
