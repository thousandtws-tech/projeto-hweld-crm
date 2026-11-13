import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { exigePerfil } from "@/lib/guards";
import { processarEEnviarComPreset } from "@/lib/midia";
import type { Categoria } from "@/lib/models";
import { catalogoService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";

export const Route = createFileRoute("/catalogo/categorias/")({
  beforeLoad: exigePerfil("admin", "estoque"),
  component: CategoriasPage,
});

/** Árvore de categorias com upload de imagem da categoria, subcategorias e ordenação. */
function CategoriasPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [todas, setTodas] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [enviandoImg, setEnviandoImg] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);

  const [f, setF] = useState({
    nome: "",
    slug: "",
    descricao: "",
    imagem_url: "",
    categoria_pai_id: "" as number | "",
    ordem: 0,
    ativa: true,
  });

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const lista = await catalogoService.categorias();
      setTodas(lista ?? []);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(["catalogo.categorias"], () => void carregar(true));

  const idsExistentes = new Set(todas.map((c) => c.id));
  const raizes = todas
    .filter((c) => !c.categoria_pai_id || !idsExistentes.has(c.categoria_pai_id))
    .sort((a, b) => a.ordem - b.ordem);
  const filhos = (id: number) =>
    todas.filter((c) => c.categoria_pai_id === id).sort((a, b) => a.ordem - b.ordem);

  const excluir = async (c: Categoria) => {
    if (excluindoId !== null) return;
    if (!window.confirm(`Deseja realmente excluir a categoria "${c.nome}"?`)) return;
    setExcluindoId(c.id);
    try {
      await catalogoService.excluirCategoria(c.id);
      if (editando?.id === c.id) setOpen(false);
      void carregar(true);
      toast.success(`Categoria "${c.nome}" excluída.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir categoria.");
    } finally {
      setExcluindoId(null);
    }
  };

  const abrir = (c?: Categoria, paiId?: number) => {
    setEditando(c ?? null);
    setF({
      nome: c?.nome ?? "",
      slug: c?.slug ?? "",
      descricao: c?.descricao ?? "",
      imagem_url: c?.imagem_url ?? "",
      categoria_pai_id: c ? (c.categoria_pai_id ?? "") : (paiId ?? ""),
      ordem: c?.ordem ?? 0,
      ativa: c?.ativa ?? true,
    });
    setOpen(true);
  };

  const aoSelecionarArquivo = async (file: File | null | undefined) => {
    if (!file) return;
    setEnviandoImg(true);
    try {
      const url = await processarEEnviarComPreset(file, "categoria");
      setF((p) => ({ ...p, imagem_url: url }));
      toast.success("Imagem da categoria auto-ajustada (800×480px) e carregada!");
    } catch {
      toast.error("Não foi possível processar a imagem.");
    } finally {
      setEnviandoImg(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.nome.trim() || salvando) return;
    setSalvando(true);
    const body = {
      nome: f.nome.trim(),
      slug: f.slug.trim() || null,
      descricao: f.descricao.trim() || null,
      imagem_url: f.imagem_url.trim() || null,
      categoria_pai_id: f.categoria_pai_id === "" ? null : Number(f.categoria_pai_id),
      ordem: Number(f.ordem) || 0,
      ativa: f.ativa,
    };
    try {
      if (editando) await catalogoService.atualizarCategoria(editando.id, body);
      else await catalogoService.criarCategoria(body);
      setOpen(false);
      void carregar();
      toast.success("Categoria salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar categoria.");
    } finally {
      setSalvando(false);
    }
  };

  const renderNo = (c: Categoria, nivel: number): React.ReactNode => {
    const subcategorias = filhos(c.id);
    return (
      <ListItem key={c.id}>
        <div
          className="flex items-center justify-between gap-3 border-b border-border/60 py-3 text-sm transition-colors hover:bg-secondary/30 px-3 rounded-xl"
          style={{ marginLeft: nivel * 24 }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {c.imagem_url ? (
              <img
                src={c.imagem_url}
                alt={c.nome}
                className="h-10 w-10 shrink-0 rounded-xl border border-border bg-secondary object-cover"
              />
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-dashed border-border bg-secondary/40 text-[10px] font-bold text-muted-foreground">
                {c.nome.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={c.ativa ? "font-semibold text-foreground" : "text-muted-foreground"}
                >
                  {c.nome}
                </span>
                <span className="text-xs text-muted-foreground">/{c.slug}</span>
                {!c.ativa && <StatusPill status="inativo" label="Inativa" />}
              </div>
              {c.descricao && (
                <Typography variant="body2" component="p" className="truncate text-xs text-muted-foreground">{c.descricao}</Typography>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outlined" size="small" type="button" onClick={() => abrir(undefined, c.id)}>+ Subcategoria</Button>
            <Button variant="outlined" size="small" type="button" onClick={() => abrir(c)}>Editar</Button>
            <Button variant="contained" color="error" size="small" type="button" disabled={excluindoId === c.id} onClick={() => void excluir(c)}>{excluindoId === c.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Excluir</Button>
          </div>
        </div>
        {subcategorias.length > 0 && <List disablePadding>{subcategorias.map((f) => renderNo(f, nivel + 1))}</List>}
      </ListItem>
    );
  };

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle="Estrutura hierárquica de departamentos, subcategorias e imagens da vitrine B2B"
        action={
          <div className="flex items-center gap-2">
            <Button variant="contained" type="button" onClick={() => abrir()}><Plus className="h-4 w-4" /> Nova categoria</Button>
            <IconButton size="small" type="button" onClick={() => void carregar()} aria-label="Atualizar"><RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} /></IconButton>
          </div>
        }
      />

      <SectionCard>
        {raizes.length === 0 ? (
          <Typography variant="body2" component="p" className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma categoria cadastrada.
          </Typography>
        ) : (
          <List disablePadding>{raizes.map((c) => renderNo(c, 0))}</List>
        )}
      </SectionCard>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editando ? `Editar ${editando.nome}` : "Nova categoria"}
        description="Defina nome, hierarquia e a imagem exibida na vitrine da loja"
        submitLabel={salvando ? "Salvando…" : "Salvar categoria"}
        onSubmit={salvar}
      >
        {/* Upload visual da imagem da categoria */}
        <div className="sm:col-span-2">
          <span className="block text-xs font-medium text-muted-foreground">
            Imagem da categoria
          </span>
          <div className="mt-1.5 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/25 p-3">
            {f.imagem_url ? (
              <div className="relative h-16 w-16 shrink-0">
                <img
                  src={f.imagem_url}
                  alt={f.nome || "Categoria"}
                  className="h-16 w-16 rounded-xl border border-border object-cover bg-card"
                />
                <IconButton size="small" type="button" onClick={() => setF({ ...f, imagem_url: "" })} aria-label="Remover imagem"><X className="h-3 w-3" /></IconButton>
              </div>
            ) : (
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground">
                <ImagePlus className="h-5 w-5" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void aoSelecionarArquivo(e.target.files?.[0])}
                />
                <Button variant="outlined" size="small" type="button" disabled={enviandoImg} onClick={() => fileInputRef.current?.click()}>{enviandoImg ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  {enviandoImg ? "Enviando…" : "Enviar arquivo do computador"}</Button>
              </div>
              <TextField size="small" fullWidth
                placeholder="Ou cole a URL da imagem (https://...)"
                value={f.imagem_url}
                onChange={(e) => setF({ ...f, imagem_url: e.target.value })} />
            </div>
          </div>
        </div>

        <FormField label="Nome *" wide>
          <TextField size="small" fullWidth
            required
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </FormField>

        <FormField label="Slug">
          <TextField size="small" fullWidth
            placeholder="Gerado automaticamente"
            value={f.slug}
            onChange={(e) => setF({ ...f, slug: e.target.value })} />
        </FormField>

        <FormField label="Categoria pai">
          <TextField size="small" fullWidth select
            value={f.categoria_pai_id}
            onChange={(e) =>
              setF({ ...f, categoria_pai_id: e.target.value === "" ? "" : Number(e.target.value) })
            } slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">Raiz (departamento principal)</MenuItem>
            {todas
              .filter((c) => !editando || c.id !== editando.id)
              .map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.nome}
                </MenuItem>
              ))}
          </TextField>
        </FormField>

        <FormField label="Descrição" wide>
          <TextField size="small" fullWidth
            placeholder="Resumo da linha de produtos desta categoria…"
            value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </FormField>

        <FormField label="Ordem de exibição">
          <TextField size="small" fullWidth
            type="number"
            value={f.ordem}
            onChange={(e) => setF({ ...f, ordem: Number(e.target.value) })} />
        </FormField>

        <FormField label="">
          <Typography component="label" className="mt-6 flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={f.ativa} onChange={(e) => setF({ ...f, ativa: e.target.checked })} />
            Categoria ativa na loja
          </Typography>
        </FormField>
      </FormDialog>
    </>
  );
}
