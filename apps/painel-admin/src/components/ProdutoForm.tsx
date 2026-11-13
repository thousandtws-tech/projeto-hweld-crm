import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { processarEEnviarImagem } from "@/lib/midia";
import type { Categoria, Produto, ProdutoImagem } from "@/lib/models";
import { catalogoService, estoqueService } from "@/lib/services";
import TextField from "@mui/material/TextField";

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
        subtitle="Dados técnicos, precificação e galeria de imagens (capa principal + sub-imagens)"
        action={
          edicao && (
            <button
              type="button"
              onClick={() => void arquivar()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D92546]/30 px-4 py-1.5 text-xs font-semibold text-[#D92546] hover:bg-[#D92546]/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir produto
            </button>
          )
        }
      />

      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          {/* Coluna Esquerda: Galeria de E-commerce (Foto Principal + Sub-imagens) */}
          <SectionCard className="h-fit space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold">Fotos do produto</h2>
                <p className="text-xs text-muted-foreground">
                  1ª foto = capa principal · demais = sub-imagens
                </p>
              </div>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {galeria.length} foto(s)
              </span>
            </div>

            {/* Palco da Imagem Selecionada / Dropzone */}
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
              className={`relative aspect-square w-full overflow-hidden rounded-2xl border transition ${
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
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    {imagemEmDestaque.is_principal ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground shadow-xs">
                        <Star className="h-3 w-3 fill-current" /> Capa principal
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void definirComoPrincipal(indicePreview)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-xs hover:bg-primary hover:text-primary-foreground"
                      >
                        <Star className="h-3 w-3" /> Definir como capa
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void removerDaGaleria(indicePreview)}
                    title="Remover esta imagem"
                    className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-[#D92546] text-white shadow-xs transition hover:opacity-90"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground hover:text-foreground"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-card">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-semibold text-foreground">
                    Clique para enviar ou arraste as fotos aqui
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Suporta múltiplos arquivos (PNG, JPG, WebP)
                  </span>
                </button>
              )}
            </div>

            {/* Tira de Sub-imagens (Miniaturas em Grade estilo E-commerce) */}
            <div className="grid grid-cols-5 gap-2">
              {galeria.map((img, idx) => {
                const selecionada = idx === indicePreview;
                return (
                  <div key={img.tempKey} className="group relative aspect-square">
                    <button
                      type="button"
                      onClick={() => setIndicePreview(idx)}
                      className={`relative h-full w-full overflow-hidden rounded-xl border bg-secondary/20 transition ${
                        selecionada
                          ? "border-2 border-primary ring-2 ring-primary/20"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={img.alt_text || `Foto ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {img.is_principal && (
                        <span className="absolute bottom-0 inset-x-0 bg-primary/90 py-0.5 text-center text-[9px] font-bold uppercase text-primary-foreground">
                          Capa
                        </span>
                      )}
                    </button>

                    {/* Setas de reordenação no hover */}
                    {galeria.length > 1 && selecionada && (
                      <div className="absolute -bottom-1.5 inset-x-0 flex justify-center gap-1">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => void moverMiniatura(idx, -1)}
                            title="Mover para esquerda"
                            className="grid h-4 w-4 place-items-center rounded-full border border-border bg-card text-foreground shadow-2xs"
                          >
                            <ArrowLeft className="h-2.5 w-2.5" />
                          </button>
                        )}
                        {idx < galeria.length - 1 && (
                          <button
                            type="button"
                            onClick={() => void moverMiniatura(idx, 1)}
                            title="Mover para direita"
                            className="grid h-4 w-4 place-items-center rounded-full border border-border bg-card text-foreground shadow-2xs"
                          >
                            <ArrowRight className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Slot "+" para adicionar mais sub-imagens */}
              <button
                type="button"
                disabled={enviandoArquivos}
                onClick={() => fileInputRef.current?.click()}
                title="Adicionar mais fotos"
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-secondary/20 text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-50"
              >
                {enviandoArquivos ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-[10px] font-medium">+ Foto</span>
                  </>
                )}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && void processarArquivos(e.target.files)}
            />

            {/* Opção secundária para colar URL externa */}
            <div className="flex gap-1.5 pt-1">
              <TextField size="small" fullWidth
                placeholder="Ou cole uma URL de imagem (https://...)"
                value={urlExterna}
                onChange={(e) => setUrlExterna(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void adicionarPorUrl();
                  }
                }} />
              <button
                type="button"
                disabled={!urlExterna.trim() || enviandoArquivos}
                onClick={() => void adicionarPorUrl()}
                className="shrink-0 rounded-2xl border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          </SectionCard>

          {/* Coluna Direita: Dados do Produto */}
          <div className="space-y-4">
            <SectionCard>
              <h2 className="mb-4 text-sm font-semibold">Identificação</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="SKU *">
                  <TextField size="small" fullWidth required value={f.sku} onChange={set("sku")} />
                </FormField>
                <FormField label="Nome do produto *" wide>
                  <TextField size="small" fullWidth required value={f.nome} onChange={set("nome")} />
                </FormField>
                <FormField label="Categoria *">
                  <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
                    required
                    value={f.categoria_id}
                    onChange={set("categoria_id")}>
                    <option value="">Selecione…</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </TextField>
                </FormField>
                <FormField label="Marca">
                  <>
                    <TextField size="small" fullWidth slotProps={{ htmlInput: { list: "lista-marcas-cms" } }}
                     
                      placeholder="Selecione ou digite…"
                      value={f.marca}
                      onChange={set("marca")} />
                    <datalist id="lista-marcas-cms">
                      {marcasCms.map((nomeMarca) => (
                        <option key={nomeMarca} value={nomeMarca} />
                      ))}
                    </datalist>
                  </>
                </FormField>
                <FormField label="Unidade (kg, cx, un…)">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { maxLength: 6 } }}
                   
                    value={f.unidade_medida}
                    onChange={set("unidade_medida")} />
                </FormField>
              </div>
            </SectionCard>

            <SectionCard>
              <h2 className="mb-4 text-sm font-semibold">Comercial & Estoque</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Preço de venda (R$) *">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                    required
                    type="number"
                   
                   
                    value={f.preco_venda}
                    onChange={set("preco_venda")} />
                </FormField>
                <FormField label="Preço de custo (R$)">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
                    type="number"
                   
                   
                    value={f.preco_custo}
                    onChange={set("preco_custo")} />
                </FormField>
                <FormField label="Estoque disponível (saldo)">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: "0" } }}
                    type="number"
                   
                   
                    value={estoqueDisponivel}
                    onChange={(e) => setEstoqueDisponivel(e.target.value)} />
                </FormField>
                <FormField label="Estoque mínimo">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001", min: "0" } }}
                    type="number"
                   
                   
                    value={f.estoque_minimo}
                    onChange={set("estoque_minimo")} />
                </FormField>

                <div className="flex flex-wrap items-center gap-5 pt-1 sm:col-span-2 lg:col-span-4">
                  {(
                    [
                      ["ativo", "Ativo no catálogo"],
                      ["destaque", "Produto em destaque na home"],
                      ["controla_estoque", "Controlar saldo de estoque"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={f[k]} onChange={setFlag(k)} />
                      {label}
                    </label>
                  ))}
                </div>

                <FormField label="Descrição curta (resumo da vitrine)" wide>
                  <TextField size="small" fullWidth
                    value={f.descricao_curta}
                    onChange={set("descricao_curta")} />
                </FormField>

                <FormField label="Especificação técnica detalhada" wide>
                  <TextField size="small" fullWidth multiline minRows={3}
                    rows={3}
                    value={f.descricao_tecnica}
                    onChange={set("descricao_tecnica")} />
                </FormField>
              </div>
            </SectionCard>

            <SectionCard>
              <h2 className="mb-4 text-sm font-semibold">Fiscal & Dimensões</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="NCM (8 dígitos)">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { maxLength: 8 } }}
                   
                    placeholder="83112000"
                    value={f.ncm}
                    onChange={set("ncm")} />
                </FormField>
                <FormField label="Origem mercadoria">
                  <TextField size="small" fullWidth select slotProps={{ select: { native: true } }}
                    value={f.origem_mercadoria}
                    onChange={set("origem_mercadoria")}>
                    <option value="">0 — Nacional</option>
                    <option value="0">0 — Nacional</option>
                    <option value="1">1 — Importada</option>
                    <option value="2">2 — Estrangeira (mercado interno)</option>
                  </TextField>
                </FormField>
                <FormField label="Peso (kg)">
                  <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.001" } }}
                    type="number"
                   
                    value={f.peso_kg}
                    onChange={set("peso_kg")} />
                </FormField>
                <FormField label="Dimensões A×L×C (cm)">
                  <div className="flex gap-1">
                    <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                      type="number"
                     
                      placeholder="A"
                      value={f.altura_cm}
                      onChange={set("altura_cm")} />
                    <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                      type="number"
                     
                      placeholder="L"
                      value={f.largura_cm}
                      onChange={set("largura_cm")} />
                    <TextField size="small" fullWidth slotProps={{ htmlInput: { step: "0.01" } }}
                      type="number"
                     
                      placeholder="C"
                      value={f.comprimento_cm}
                      onChange={set("comprimento_cm")} />
                  </div>
                </FormField>
              </div>
            </SectionCard>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!valido || salvando || enviandoArquivos}
                className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {salvando ? "Salvando…" : "Salvar produto"}
              </button>
              <Link
                to="/catalogo/produtos"
                className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                Cancelar
              </Link>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
