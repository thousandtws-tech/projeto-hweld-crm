import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { exigePerfil } from "@/lib/guards";
import { processarEEnviarComPreset } from "@/lib/midia";
import type { Categoria } from "@/lib/models";
import { catalogoService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
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
      if (editando?.id === c.id) cancelarEdicao();
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
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setF({ nome: "", slug: "", descricao: "", imagem_url: "", categoria_pai_id: "", ordem: 0, ativa: true });
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
      cancelarEdicao();
      void carregar();
      toast.success("Categoria salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar categoria.");
    } finally {
      setSalvando(false);
    }
  };

  // Árvore achatada em linhas (padrão WooCommerce: tabela com indentação "—").
  const linhas: { c: Categoria; nivel: number }[] = [];
  const empilhar = (c: Categoria, nivel: number) => {
    linhas.push({ c, nivel });
    filhos(c.id).forEach((sub) => empilhar(sub, nivel + 1));
  };
  raizes.forEach((c) => empilhar(c, 0));

  return (
    <>
      <PageHeader
        title="Categorias de produto"
        subtitle="Departamentos e subcategorias exibidos na vitrine B2B"
        action={
          <IconButton size="small" type="button" onClick={() => void carregar()} aria-label="Atualizar">
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
          </IconButton>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Coluna esquerda — formulário (padrão WooCommerce) */}
        <SectionCard>
          <Typography variant="subtitle2" className="text-sm font-bold">
            {editando ? `Editar: ${editando.nome}` : "Adicionar nova categoria"}
          </Typography>
          {editando && (
            <Typography variant="caption" className="mt-0.5 block text-muted-foreground">
              ID #{editando.id} ·{" "}
              <Button variant="text" size="small" type="button" onClick={cancelarEdicao} sx={{ p: 0, minWidth: 0, fontSize: "inherit", textTransform: "none" }}>
                cancelar edição
              </Button>
            </Typography>
          )}

          <Box component="form" onSubmit={salvar} className="mt-3 space-y-3">
            <TextField
              label="Nome"
              required
              size="small"
              fullWidth
              value={f.nome}
              onChange={(e) => setF({ ...f, nome: e.target.value })}
            />
            <TextField
              label="Slug"
              size="small"
              fullWidth
              placeholder="gerado-automaticamente"
              helperText="Vazio = gerado a partir do nome"
              value={f.slug}
              onChange={(e) => setF({ ...f, slug: e.target.value })}
            />
            <TextField
              label="Categoria pai"
              size="small"
              fullWidth
              select
              value={f.categoria_pai_id === "" ? "" : String(f.categoria_pai_id)}
              onChange={(e) =>
                setF({ ...f, categoria_pai_id: e.target.value === "" ? "" : Number(e.target.value) })
              }
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">Nenhuma (departamento raiz)</MenuItem>
              {linhas
                .filter(({ c }) => !editando || c.id !== editando.id)
                .map(({ c, nivel }) => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    {"— ".repeat(nivel)}{c.nome}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label="Descrição"
              size="small"
              fullWidth
              multiline
              minRows={2}
              placeholder="Resumo da linha de produtos desta categoria…"
              value={f.descricao}
              onChange={(e) => setF({ ...f, descricao: e.target.value })}
            />
            <TextField
              label="Ordem de exibição"
              size="small"
              fullWidth
              type="number"
              value={f.ordem}
              onChange={(e) => setF({ ...f, ordem: Number(e.target.value) })}
            />

            {/* Imagem da categoria */}
            <div>
              <Typography variant="caption" className="font-medium text-muted-foreground">
                Imagem da categoria
              </Typography>
              <div className="mt-1 flex items-center gap-3">
                {f.imagem_url ? (
                  <div className="relative h-16 w-16 shrink-0">
                    <img
                      src={f.imagem_url}
                      alt={f.nome || "Categoria"}
                      className="h-16 w-16 rounded-xl border border-border object-cover bg-card"
                    />
                    <IconButton
                      size="small"
                      type="button"
                      onClick={() => setF({ ...f, imagem_url: "" })}
                      aria-label="Remover imagem"
                      sx={{ position: "absolute", top: -6, right: -6, bgcolor: "background.paper", border: 1, borderColor: "divider", width: 20, height: 20 }}
                    >
                      <X className="h-3 w-3" />
                    </IconButton>
                  </div>
                ) : (
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-dashed border-border bg-secondary/40 text-muted-foreground">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void aoSelecionarArquivo(e.target.files?.[0])}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    type="button"
                    disabled={enviandoImg}
                    onClick={() => fileInputRef.current?.click()}
                    startIcon={enviandoImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  >
                    {enviandoImg ? "Enviando…" : "Enviar imagem"}
                  </Button>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Ou cole a URL (https://…)"
                    value={f.imagem_url}
                    onChange={(e) => setF({ ...f, imagem_url: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <FormControlLabel
              control={<Checkbox checked={f.ativa} onChange={(e) => setF({ ...f, ativa: e.target.checked })} />}
              label="Categoria ativa na loja"
            />

            <Button
              variant="contained"
              type="submit"
              fullWidth
              disabled={!f.nome.trim() || salvando || enviandoImg}
            >
              {salvando ? "Salvando…" : editando ? "Atualizar categoria" : "Adicionar nova categoria"}
            </Button>
          </Box>
        </SectionCard>

        {/* Coluna direita — listagem hierárquica */}
        <SectionCard className="overflow-hidden p-0!">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Typography variant="subtitle2" className="text-sm font-bold">Categorias</Typography>
            <Typography variant="caption" className="text-muted-foreground">{linhas.length} cadastrada(s)</Typography>
          </div>
          <div className="overflow-x-auto">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 56 }}>Imagem</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Slug</TableCell>
                  <TableCell>Descrição</TableCell>
                  <TableCell sx={{ width: 70 }} align="center">Ordem</TableCell>
                  <TableCell sx={{ width: 90 }}>Status</TableCell>
                  <TableCell sx={{ width: 150 }} align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {linhas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Typography variant="body2" className="text-muted-foreground">
                        {carregando ? "Carregando…" : "Nenhuma categoria cadastrada."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {linhas.map(({ c, nivel }) => (
                  <TableRow key={c.id} hover selected={editando?.id === c.id}>
                    <TableCell>
                      {c.imagem_url ? (
                        <img
                          src={c.imagem_url}
                          alt={c.nome}
                          className="h-9 w-9 rounded-lg border border-border bg-secondary object-cover"
                        />
                      ) : (
                        <div className="grid h-9 w-9 place-items-center rounded-lg border border-dashed border-border bg-secondary/40 text-[10px] font-bold text-muted-foreground">
                          {c.nome.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        className={c.ativa ? "font-semibold" : "text-muted-foreground"}
                        sx={{ pl: nivel * 2.5 }}
                      >
                        {nivel > 0 && <span className="mr-1 text-muted-foreground">—</span>}
                        {c.nome}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" className="text-muted-foreground">/{c.slug}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography variant="body2" noWrap className="text-muted-foreground">
                        {c.descricao || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" className="tabular-nums">{c.ordem}</Typography>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={c.ativa ? "ativo" : "inativo"} label={c.ativa ? "Ativa" : "Inativa"} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button variant="text" size="small" type="button" onClick={() => abrir(undefined, c.id)} startIcon={<Plus className="h-3 w-3" />}>
                        Sub
                      </Button>
                      <Button variant="text" size="small" type="button" onClick={() => abrir(c)}>
                        Editar
                      </Button>
                      <IconButton
                        size="small"
                        type="button"
                        color="error"
                        disabled={excluindoId === c.id}
                        onClick={() => void excluir(c)}
                        aria-label={`Excluir ${c.nome}`}
                      >
                        {excluindoId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
