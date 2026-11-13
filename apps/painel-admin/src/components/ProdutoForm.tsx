import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  ImagePlus,
  Loader2,
  Package,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { Metabox, PageHeader } from "@/components/ui-kit/primitives";
import { FormField } from "@/components/ui-kit/FormDialog";
import { processarEEnviarImagem } from "@/lib/midia";
import type { Categoria, Produto, ProdutoImagem } from "@/lib/models";
import { catalogoService, estoqueService } from "@/lib/services";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const vazio = {
  sku: "",
  nome: "",
  slug: "",
  categoria_id: "" as number | "",
  marca: "",
  unidade_medida: "",
  ncm: "",
  origem_mercadoria: "",
  peso_kg: "",
  altura_cm: "",
  largura_cm: "",
  comprimento_cm: "",
  preco_venda: "",
  preco_custo: "",
  estoque_minimo: "",
  ativo: true,
  destaque: false,
  controla_estoque: true,
  descricao_curta: "",
  descricao_tecnica: "",
};

type Form = typeof vazio;

interface ItemGaleria {
  id?: number; // definido quando já salvo no banco
  tempKey: string;
  url: string;
  alt_text: string;
  ordem: number;
  is_principal: boolean;
}

/**
 * Formulário completo de produto (fiscal + dimensões + flags + Galeria de E-commerce
 * com Imagem Principal e Sub-imagens em miniatura, funcionando tanto na criação quanto na edição).
 */
export function ProdutoForm({ produtoRef }: { produtoRef?: string }) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Id numérico interno, resolvido após carregar pela referência (public_id/id).
  const [produtoId, setProdutoId] = useState<number | undefined>(undefined);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [marcasCms, setMarcasCms] = useState<string[]>([]);
  const [f, setF] = useState<Form>(vazio);
  const [fInicial, setFInicial] = useState<Form | null>(null);
  const [estoqueDisponivel, setEstoqueDisponivel] = useState<string>("100");
  const [saldoOriginal, setSaldoOriginal] = useState<number>(100);
  const [salvando, setSalvando] = useState(false);

  // Galeria de Imagens (capa principal + sub-imagens)
  const [galeria, setGaleria] = useState<ItemGaleria[]>([]);
  const [indicePreview, setIndicePreview] = useState(0);
  const [enviandoArquivos, setEnviandoArquivos] = useState(false);
  const [arrastandoSobre, setArrastandoSobre] = useState(false);
  const [urlExterna, setUrlExterna] = useState("");
  // Aba ativa do painel "Dados do produto" (padrão WooCommerce).
  const [aba, setAba] = useState(0);

  const edicao = produtoRef !== undefined;

  const mapearParaGaleria = (lista: ProdutoImagem[]): ItemGaleria[] => {
    const ordenadas = [...lista].sort(
      (a, b) => Number(b.is_principal) - Number(a.is_principal) || a.ordem - b.ordem || a.id - b.id,
    );
    return ordenadas.map((img, i) => ({
      id: img.id,
      tempKey: `db-${img.id}`,
      url: img.url,
      alt_text: img.alt_text ?? "",
      ordem: i,
      is_principal: img.is_principal || i === 0,
    }));
  };

  const carregarImagens = useCallback(() => {
    if (!produtoId) return;
    catalogoService
      .imagens(produtoId)
      .then((imgs) => {
        setGaleria(mapearParaGaleria(imgs));
        setIndicePreview(0);
      })
      .catch((err) => {
        setGaleria([]);
        toast.error(
          err instanceof Error
            ? `Falha ao carregar as fotos: ${err.message}`
            : "Falha ao carregar as fotos do produto.",
        );
      });
  }, [produtoId]);

  useEffect(() => {
    catalogoService.categorias().then(setCategorias);
    catalogoService
      .obterCms()
      .then((c) => setMarcasCms(c.marcas.filter((m) => m.ativa).map((m) => m.nome)))
      .catch(() => {});
    if (produtoRef) {
      catalogoService.produto(produtoRef).then((p: Produto) => {
        setProdutoId(p.id);
        estoqueService
          .saldo(p.id)
          .then((s) => {
            const disp = Number(s.quantidade_disponivel ?? 0);
            setSaldoOriginal(disp);
            setEstoqueDisponivel(String(disp));
          })
          .catch(() => {
            setSaldoOriginal(0);
            setEstoqueDisponivel("0");
          });
        // Canonicalização: URL com id numérico vira public_id (UUID mascarado).
        if (produtoRef !== p.public_id) {
          void navigate({
            to: "/catalogo/produtos/$id",
            params: { id: p.public_id },
            replace: true,
          });
        }
        const carregado = {
          ...vazio,
          ...p,
          categoria_id: p.categoria_id,
          marca: p.marca ?? "",
          unidade_medida: p.unidade_medida ?? "",
          preco_custo: p.preco_custo ?? "",
          estoque_minimo: p.estoque_minimo ?? "",
          descricao_curta: p.descricao_curta ?? "",
          descricao_tecnica: p.descricao_tecnica ?? "",
          ncm: p.ncm ?? "",
          origem_mercadoria: p.origem_mercadoria ?? "",
          peso_kg: p.peso_kg ?? "",
          altura_cm: p.altura_cm ?? "",
          largura_cm: p.largura_cm ?? "",
          comprimento_cm: p.comprimento_cm ?? "",
        };
        setF(carregado);
        // Snapshot para PATCH-diff: só os campos alterados trafegam no salvar.
        setFInicial(carregado);
      });
    }
  }, [produtoRef, navigate]);

  // Imagens usam o id numérico resolvido — carregam quando o produto chega.
  useEffect(() => {
    if (produtoId) carregarImagens();
  }, [produtoId, carregarImagens]);

  const set =
    (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));
  const setFlag =
    (k: "ativo" | "destaque" | "controla_estoque") => (e: React.ChangeEvent<HTMLInputElement>) =>
      setF((p) => ({ ...p, [k]: e.target.checked }));

  /** Adiciona uma URL (vinda de upload de arquivo ou digitada) à galeria. */
  const registrarNaGaleria = async (url: string, altSugerido = "") => {
    const ehPrimeira = galeria.length === 0;
    if (edicao && produtoId) {
      const criada = await catalogoService.adicionarImagem(produtoId, {
        url,
        alt_text: altSugerido || f.nome || null,
        ordem: galeria.length,
        is_principal: ehPrimeira,
      });
      setGaleria((prev) => [
        ...prev,
        {
          id: criada.id,
          tempKey: `db-${criada.id}`,
          url: criada.url,
          alt_text: criada.alt_text ?? "",
          ordem: prev.length,
          is_principal: criada.is_principal,
        },
      ]);
    } else {
      setGaleria((prev) => [
        ...prev,
        {
          tempKey: `tmp-${Date.now()}-${Math.random()}`,
          url,
          alt_text: altSugerido || f.nome,
          ordem: prev.length,
          is_principal: prev.length === 0,
        },
      ]);
    }
  };

  /** Processa múltiplos arquivos de imagem selecionados ou soltos via Drag & Drop. */
  const processarArquivos = async (files: FileList | File[]) => {
    const lista = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (lista.length === 0) return;

    setEnviandoArquivos(true);
    try {
      for (const file of lista) {
        const url = await processarEEnviarImagem(file, 1400, 0.86);
        const nomeSemExt = file.name.replace(/\.[^/.]+$/, "");
        await registrarNaGaleria(url, f.nome || nomeSemExt);
      }
      toast.success(
        lista.length === 1
          ? "Imagem adicionada à galeria."
          : `${lista.length} imagens adicionadas à galeria.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar imagens.");
    } finally {
      setEnviandoArquivos(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const adicionarPorUrl = async () => {
    const u = urlExterna.trim();
    if (!u) return;
    setEnviandoArquivos(true);
    try {
      await registrarNaGaleria(u, f.nome);
      setUrlExterna("");
      toast.success("Imagem vinculada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "URL de imagem inválida.");
    } finally {
      setEnviandoArquivos(false);
    }
  };

  const definirComoPrincipal = async (idx: number) => {
    const alvo = galeria[idx];
    if (!alvo || alvo.is_principal) return;

    if (edicao && produtoId && alvo.id) {
      try {
        await catalogoService.atualizarImagem(produtoId, alvo.id, {
          alt_text: alvo.alt_text || null,
          ordem: 0,
          is_principal: true,
        });
      } catch {
        toast.error("Não foi possível definir como capa principal.");
        return;
      }
    }

    setGaleria((prev) => {
      const escolhida = { ...prev[idx], is_principal: true };
      const restantes = prev
        .filter((_, i) => i !== idx)
        .map((item) => ({ ...item, is_principal: false }));
      return [escolhida, ...restantes].map((item, i) => ({ ...item, ordem: i }));
    });
    setIndicePreview(0);
    toast.success("Definida como foto de capa principal.");
  };

  const moverMiniatura = async (idx: number, direcao: -1 | 1) => {
    const destino = idx + direcao;
    if (destino < 0 || destino >= galeria.length) return;

    const nova = [...galeria];
    const [movida] = nova.splice(idx, 1);
    nova.splice(destino, 0, movida);
    const reordenada = nova.map((item, i) => ({
      ...item,
      ordem: i,
      is_principal: i === 0,
    }));

    setGaleria(reordenada);
    setIndicePreview(destino);

    if (edicao && produtoId) {
      await Promise.allSettled(
        reordenada
          .filter((img) => img.id !== undefined)
          .map((img) =>
            catalogoService.atualizarImagem(produtoId, img.id!, {
              alt_text: img.alt_text || null,
              ordem: img.ordem,
              is_principal: img.is_principal,
            }),
          ),
      );
    }
  };

  const removerDaGaleria = async (idx: number) => {
    const alvo = galeria[idx];
    if (!alvo) return;

    if (edicao && produtoId && alvo.id) {
      try {
        await catalogoService.removerImagem(produtoId, alvo.id);
      } catch {
        toast.error("Falha ao remover imagem.");
        return;
      }
    }

    setGaleria((prev) => {
      const filtrada = prev.filter((_, i) => i !== idx);
      if (filtrada.length > 0 && !filtrada.some((i) => i.is_principal)) {
        filtrada[0] = { ...filtrada[0], is_principal: true };
      }
      return filtrada.map((item, i) => ({ ...item, ordem: i }));
    });
    setIndicePreview((atual) => Math.max(0, Math.min(atual, galeria.length - 2)));
  };

  const optStr = (v: string) => (v.trim().length > 0 ? v.trim() : null);

  // Normalização única — usada para o payload e para o diff do PATCH.
  const montarBody = (v: Form) => ({
    sku: v.sku.trim(),
    nome: v.nome.trim(),
    slug: optStr(v.slug),
    categoria_id: Number(v.categoria_id),
    marca: optStr(v.marca),
    unidade_medida: optStr(v.unidade_medida),
    descricao_curta: optStr(v.descricao_curta),
    descricao_tecnica: optStr(v.descricao_tecnica),
    ncm: optStr(v.ncm),
    origem_mercadoria: optStr(v.origem_mercadoria),
    peso_kg: optStr(v.peso_kg),
    altura_cm: optStr(v.altura_cm),
    largura_cm: optStr(v.largura_cm),
    comprimento_cm: optStr(v.comprimento_cm),
    preco_custo: optStr(v.preco_custo),
    preco_venda: String(v.preco_venda),
    estoque_minimo: optStr(v.estoque_minimo),
    controla_estoque: v.controla_estoque,
    ativo: v.ativo,
    destaque: v.destaque,
  });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.sku.trim() || !f.nome.trim() || !f.categoria_id || !f.preco_venda) return;
    setSalvando(true);
    try {
      const body = montarBody(f);

      let idAlvo = produtoId;
      let baseEstoque = saldoOriginal;
      if (edicao && produtoId) {
        // PATCH-diff: envia apenas os campos realmente alterados —
        // payload menor, audit trail mais limpo e sem UPDATE desnecessário.
        const antes = fInicial ? montarBody(fInicial) : null;
        const patch = antes
          ? Object.fromEntries(
              (Object.entries(body) as [keyof typeof body, unknown][]).filter(
                ([k, v]) => v !== antes[k],
              ),
            )
          : body;
        if (Object.keys(patch).length > 0) {
          await catalogoService.atualizarProduto(produtoId, patch);
        }
      } else {
        const criado = await catalogoService.criarProduto(body);
        idAlvo = criado.id;
        baseEstoque = 100; // saldo inicial padrão gravado no INSERT
        // Salva todas as imagens que já foram adicionadas durante a criação do produto
        let falhasImagens = 0;
        for (let i = 0; i < galeria.length; i++) {
          const img = galeria[i];
          try {
            await catalogoService.adicionarImagem(criado.id, {
              url: img.url,
              alt_text: img.alt_text.trim() || criado.nome,
              ordem: i,
              is_principal: i === 0 || img.is_principal,
            });
          } catch {
            falhasImagens += 1;
          }
        }
        if (falhasImagens > 0) {
          toast.warning(
            `${falhasImagens} foto(s) não foram gravadas no servidor. Edite o produto e envie novamente.`,
          );
        }
      }

      if (idAlvo && estoqueDisponivel.trim() !== "") {
        const desejado = Number(estoqueDisponivel);
        const delta = desejado - baseEstoque;
        if (Number.isFinite(desejado) && Math.abs(delta) >= 0.001) {
          try {
            await estoqueService.lancar({
              produto_id: idAlvo,
              tipo: delta > 0 ? "entrada" : "ajuste",
              quantidade: delta.toFixed(3),
              motivo: "Saldo definido no cadastro do produto",
            });
          } catch {
            toast.warning("Produto salvo, mas não foi possível ajustar o saldo de estoque.");
          }
        }
      }
      toast.success("Produto salvo com sucesso.");
      navigate({ to: "/catalogo/produtos" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar produto.");
    } finally {
      setSalvando(false);
    }
  };

  const arquivar = async () => {
    if (!produtoId) return;
    if (!window.confirm(`Deseja realmente excluir o produto "${f.nome || f.sku}"?`)) return;
    try {
      await catalogoService.arquivarProduto(produtoId);
      toast.success("Produto excluído.");
      navigate({ to: "/catalogo/produtos" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir produto.");
    }
  };

  const valido = f.sku.trim() && f.nome.trim() && f.categoria_id !== "" && f.preco_venda !== "";
  const imagemEmDestaque = galeria[indicePreview] ?? galeria[0] ?? null;

  return (
    <>
      <PageHeader
        title={edicao ? `Editar produto · ${f.sku || `#${produtoId}`}` : "Novo produto"}
        subtitle="Dados, preços, estoque, entrega, fiscal e imagens do produto"
      />

      <Box
        component="form"
        onSubmit={salvar}
        className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        {/* ============ Coluna principal (conteúdo) ============ */}
        <div className="min-w-0 space-y-4">
          {/* Identificação — título + slug + resumo (padrão Woo) */}
          <Metabox title="Identificação" contentClassName="p-4 sm:p-5 space-y-5">
            <FormField label="Nome do produto *">
              <TextField
                required
                fullWidth
                size="small"
                placeholder="Ex.: Eletrodo E6013 2,5mm — caixa 5kg"
                value={f.nome}
                onChange={set("nome")}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="SKU *">
                <TextField required size="small" fullWidth value={f.sku} onChange={set("sku")} />
              </FormField>
              <FormField label="Slug">
                <TextField
                  size="small"
                  fullWidth
                  placeholder="gerado-automaticamente"
                  value={f.slug}
                  onChange={set("slug")}
                />
              </FormField>
            </div>
            <FormField label="Descrição curta (resumo da vitrine)">
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={f.descricao_curta}
                onChange={set("descricao_curta")}
              />
            </FormField>
          </Metabox>

          {/* Dados do produto — painel com abas (padrão WooCommerce) */}
          <Card
            variant="outlined"
            sx={{ borderRadius: 3, boxShadow: "var(--shadow-card)", overflow: "hidden" }}
          >
            <Box
              sx={{
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: "rgba(0,0,0,0.015)",
                px: { xs: 2, sm: 2.5 },
                py: 1.25,
              }}
            >
              <Typography variant="subtitle2" fontWeight={600} color="text.primary">
                Dados do produto
              </Typography>
            </Box>
            <div className="flex min-h-[300px] items-stretch">
              <Tabs
                orientation="vertical"
                value={aba}
                onChange={(_, v) => setAba(v)}
                sx={{
                  minWidth: { xs: 132, sm: 156 },
                  flexShrink: 0,
                  borderRight: 1,
                  borderColor: "divider",
                  py: 1,
                  "& .MuiTab-root": {
                    minHeight: 44,
                    py: 1.25,
                    px: 2,
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: 13,
                    justifyContent: "flex-start",
                    color: "text.secondary",
                    "&.Mui-selected": { color: "primary.main", bgcolor: "rgba(38,72,140,0.06)" },
                  },
                  "& .MuiTabs-indicator": { left: 0, right: "auto", width: 3, borderRadius: 2 },
                }}
              >
                <Tab icon={<SlidersHorizontal className="h-4 w-4" />} iconPosition="start" label="Geral" />
                <Tab icon={<Tag className="h-4 w-4" />} iconPosition="start" label="Preços" />
                <Tab icon={<Package className="h-4 w-4" />} iconPosition="start" label="Estoque" />
                <Tab icon={<Truck className="h-4 w-4" />} iconPosition="start" label="Entrega" />
                <Tab icon={<FileText className="h-4 w-4" />} iconPosition="start" label="Fiscal" />
              </Tabs>

              <div className="min-w-0 flex-1 p-4 sm:p-6">
              {aba === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Marca">
                    <Autocomplete
                      freeSolo
                      options={marcasCms}
                      value={f.marca}
                      onChange={(_, v) => setF((p) => ({ ...p, marca: v ?? "" }))}
                      onInputChange={(_, v) => setF((p) => ({ ...p, marca: v }))}
                      renderInput={(params) => (
                        <TextField {...params} size="small" placeholder="Selecione ou digite…" />
                      )}
                    />
                  </FormField>
                  <FormField label="Unidade (kg, cx, un…)">
                    <TextField
                      size="small"
                      fullWidth
                      slotProps={{ htmlInput: { maxLength: 6 } }}
                      value={f.unidade_medida}
                      onChange={set("unidade_medida")}
                    />
                  </FormField>
                  <FormField label="Especificação técnica detalhada" wide>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={4}
                      value={f.descricao_tecnica}
                      onChange={set("descricao_tecnica")}
                    />
                  </FormField>
                </div>
              )}

              {aba === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Preço de venda (R$) *">
                    <TextField
                      required
                      type="number"
                      size="small"
                      fullWidth
                      slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                      value={f.preco_venda}
                      onChange={set("preco_venda")}
                    />
                  </FormField>
                  <FormField label="Preço de custo (R$)">
                    <TextField
                      type="number"
                      size="small"
                      fullWidth
                      slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                      value={f.preco_custo}
                      onChange={set("preco_custo")}
                    />
                  </FormField>
                  {(() => {
                    const venda = Number(f.preco_venda);
                    const custo = Number(f.preco_custo);
                    if (!Number.isFinite(venda) || venda <= 0 || !Number.isFinite(custo) || custo <= 0) {
                      return null;
                    }
                    const margem = ((venda - custo) / venda) * 100;
                    return (
                      <Typography variant="caption" className="text-muted-foreground sm:col-span-2">
                        Margem estimada sobre a venda: {margem.toFixed(1)}%
                      </Typography>
                    );
                  })()}
                </div>
              )}

              {aba === 2 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormControlLabel
                    className="sm:col-span-2"
                    control={<Switch checked={f.controla_estoque} onChange={setFlag("controla_estoque")} />}
                    label="Controlar saldo de estoque"
                  />
                  <FormField label="Estoque disponível (saldo)">
                    <TextField
                      type="number"
                      size="small"
                      fullWidth
                      disabled={!f.controla_estoque}
                      slotProps={{ htmlInput: { step: "0.001", min: "0" } }}
                      value={estoqueDisponivel}
                      onChange={(e) => setEstoqueDisponivel(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Estoque mínimo (alerta)">
                    <TextField
                      type="number"
                      size="small"
                      fullWidth
                      disabled={!f.controla_estoque}
                      slotProps={{ htmlInput: { step: "0.001", min: "0" } }}
                      value={f.estoque_minimo}
                      onChange={set("estoque_minimo")}
                    />
                  </FormField>
                </div>
              )}

              {aba === 3 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField label="Peso (kg)">
                    <TextField type="number" size="small" fullWidth slotProps={{ htmlInput: { step: "0.001" } }} value={f.peso_kg} onChange={set("peso_kg")} />
                  </FormField>
                  <FormField label="Altura (cm)">
                    <TextField type="number" size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }} value={f.altura_cm} onChange={set("altura_cm")} />
                  </FormField>
                  <FormField label="Largura (cm)">
                    <TextField type="number" size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }} value={f.largura_cm} onChange={set("largura_cm")} />
                  </FormField>
                  <FormField label="Comprimento (cm)">
                    <TextField type="number" size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }} value={f.comprimento_cm} onChange={set("comprimento_cm")} />
                  </FormField>
                </div>
              )}

              {aba === 4 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="NCM (8 dígitos)">
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="83112000"
                      slotProps={{ htmlInput: { maxLength: 8 } }}
                      value={f.ncm}
                      onChange={set("ncm")}
                    />
                  </FormField>
                  <FormField label="Origem da mercadoria">
                    <TextField
                      size="small"
                      fullWidth
                      select
                      value={f.origem_mercadoria}
                      onChange={set("origem_mercadoria")}
                      slotProps={{ select: { displayEmpty: true } }}
                    >
                      <MenuItem value="">0 — Nacional</MenuItem>
                      <MenuItem value="0">0 — Nacional</MenuItem>
                      <MenuItem value="1">1 — Importada</MenuItem>
                      <MenuItem value="2">2 — Estrangeira (mercado interno)</MenuItem>
                    </TextField>
                  </FormField>
                </div>
              )}
              </div>
            </div>
          </Card>
        </div>

        {/* ============ Sidebar direita (publicar, organização, imagem) ============ */}
        <div className="space-y-4">
          {/* Publicar */}
          <Metabox title="Publicar" contentClassName="p-4 sm:p-5 space-y-4">
            <div className="flex flex-col items-start">
              <FormControlLabel
                control={<Switch checked={f.ativo} onChange={setFlag("ativo")} />}
                label="Ativo no catálogo"
              />
              <FormControlLabel
                control={<Checkbox checked={f.destaque} onChange={setFlag("destaque")} />}
                label="Destaque na home"
              />
            </div>
            <Divider />
            <Stack spacing={1}>
              <Button variant="contained" type="submit" fullWidth disabled={!valido || salvando || enviandoArquivos}>
                {salvando ? "Salvando…" : edicao ? "Atualizar produto" : "Publicar produto"}
              </Button>
              <Button variant="outlined" fullWidth component={Link} to="/catalogo/produtos">
                Cancelar
              </Button>
              {edicao && (
                <Button
                  variant="text"
                  color="error"
                  fullWidth
                  type="button"
                  onClick={() => void arquivar()}
                  startIcon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Excluir produto
                </Button>
              )}
            </Stack>
          </Metabox>

          {/* Organização */}
          <Metabox title="Organização">
            <FormField label="Categoria *">
              <TextField
                required
                size="small"
                fullWidth
                select
                value={f.categoria_id === "" ? "" : String(f.categoria_id)}
                onChange={set("categoria_id")}
                slotProps={{ select: { displayEmpty: true } }}
              >
                <MenuItem value="">Selecione…</MenuItem>
                {categorias.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    {c.nome}
                  </MenuItem>
                ))}
              </TextField>
            </FormField>
          </Metabox>

          {/* Imagem do produto — galeria com capa */}
          <Metabox
            title="Imagem do produto"
            action={
              <Typography variant="caption" className="tabular-nums text-muted-foreground">
                {galeria.length} foto(s)
              </Typography>
            }
            contentClassName="p-4 sm:p-5 space-y-3"
          >
            <Typography variant="caption" className="text-muted-foreground">
              1ª foto = capa · demais = galeria
            </Typography>

            {/* Palco da imagem selecionada / dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastandoSobre(true);
              }}
              onDragLeave={() => setArrastandoSobre(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastandoSobre(false);
                if (e.dataTransfer.files?.length) {
                  void processarArquivos(e.dataTransfer.files);
                }
              }}
              className={`relative aspect-[4/3] w-full overflow-hidden rounded-xl border transition lg:aspect-square ${
                arrastandoSobre
                  ? "border-2 border-dashed border-primary bg-primary/5"
                  : imagemEmDestaque
                    ? "border-border bg-secondary/20"
                    : "border-2 border-dashed border-border bg-secondary/20"
              }`}
            >
              {imagemEmDestaque ? (
                <>
                  <img
                    src={imagemEmDestaque.url}
                    alt={imagemEmDestaque.alt_text || f.nome || "Produto"}
                    className="h-full w-full object-contain p-2"
                  />
                  <div className="absolute left-2.5 top-2.5">
                    {imagemEmDestaque.is_principal ? (
                      <Chip
                        size="small"
                        color="primary"
                        icon={<Star className="h-3 w-3" />}
                        label="Capa principal"
                      />
                    ) : (
                      <Button
                        variant="contained"
                        size="small"
                        type="button"
                        onClick={() => void definirComoPrincipal(indicePreview)}
                        startIcon={<Star className="h-3 w-3" />}
                      >
                        Definir capa
                      </Button>
                    )}
                  </div>
                  <IconButton
                    size="small"
                    type="button"
                    onClick={() => void removerDaGaleria(indicePreview)}
                    title="Remover esta imagem"
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      bgcolor: "background.paper",
                      border: 1,
                      borderColor: "divider",
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </>
              ) : (
                <ButtonBase
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-card">
                    <Upload className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    Clique para enviar ou arraste as fotos
                  </span>
                  <span className="text-[11px]">PNG, JPG, WebP — múltiplos arquivos</span>
                </ButtonBase>
              )}
            </div>

            {/* Tira de miniaturas */}
            {galeria.length > 0 && (
              <div className="grid grid-cols-5 gap-2">
                {galeria.map((img, idx) => {
                  const selecionada = idx === indicePreview;
                  return (
                    <div key={img.tempKey} className="group relative aspect-square">
                      <ButtonBase
                        type="button"
                        onClick={() => setIndicePreview(idx)}
                        className={`h-full w-full overflow-hidden rounded-lg border transition ${
                          selecionada
                            ? "border-primary ring-2 ring-primary/25"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <img
                          src={img.url}
                          alt={img.alt_text || `Foto ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </ButtonBase>
                      {img.is_principal && (
                        <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-primary/90 py-0.5 text-center text-[8px] font-bold uppercase text-primary-foreground">
                          Capa
                        </span>
                      )}
                      {galeria.length > 1 && selecionada && (
                        <div className="absolute -bottom-1.5 inset-x-0 z-10 flex justify-center gap-1">
                          {idx > 0 && (
                            <IconButton
                              size="small"
                              type="button"
                              onClick={() => void moverMiniatura(idx, -1)}
                              title="Mover para esquerda"
                              sx={{ width: 18, height: 18, bgcolor: "background.paper", border: 1, borderColor: "divider" }}
                            >
                              <ArrowLeft className="h-2.5 w-2.5" />
                            </IconButton>
                          )}
                          {idx < galeria.length - 1 && (
                            <IconButton
                              size="small"
                              type="button"
                              onClick={() => void moverMiniatura(idx, 1)}
                              title="Mover para direita"
                              sx={{ width: 18, height: 18, bgcolor: "background.paper", border: 1, borderColor: "divider" }}
                            >
                              <ArrowRight className="h-2.5 w-2.5" />
                            </IconButton>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <ButtonBase
                  type="button"
                  disabled={enviandoArquivos}
                  onClick={() => fileInputRef.current?.click()}
                  title="Adicionar mais fotos"
                  className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-muted-foreground transition hover:bg-secondary/50"
                >
                  {enviandoArquivos ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-4 w-4" />
                      <span className="text-[9px] font-medium">+ Foto</span>
                    </>
                  )}
                </ButtonBase>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && void processarArquivos(e.target.files)}
            />

            {/* URL externa */}
            <div className="flex gap-2">
              <TextField
                size="small"
                fullWidth
                placeholder="Ou cole uma URL de imagem (https://…)"
                value={urlExterna}
                onChange={(e) => setUrlExterna(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void adicionarPorUrl();
                  }
                }}
              />
              <Button
                variant="outlined"
                size="small"
                type="button"
                disabled={!urlExterna.trim() || enviandoArquivos}
                onClick={() => void adicionarPorUrl()}
              >
                Adicionar
              </Button>
            </div>
          </Metabox>
        </div>
      </Box>
    </>
  );
}
