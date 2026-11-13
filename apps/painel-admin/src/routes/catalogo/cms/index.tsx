import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { FormField } from "@/components/ui-kit/FormDialog";
import { Metabox, PageHeader } from "@/components/ui-kit/primitives";
import { exigePerfil } from "@/lib/guards";
import {
  PRESETS_MIDIA,
  processarEEnviarComPreset,
  type ModoAutoAjuste,
} from "@/lib/midia";
import type { CardDuoCms, CardTrioCms, CmsLoja, MarcaCms, SeloCms, SlideBannerCms } from "@/lib/models";
import { catalogoService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const Route = createFileRoute("/catalogo/cms/")({
  beforeLoad: exigePerfil("admin", "estoque", "vendedor"),
  component: CmsLojaPage,
});

type Aba = "marcas" | "slides" | "trio" | "duo" | "selos";

function resolverUrlPreview(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  return `http://localhost:4210/${url.replace(/^\/+/, "")}`;
}

function CmsLojaPage() {
  const [aba, setAba] = useState<Aba>("marcas");
  const [cms, setCms] = useState<CmsLoja>({
    marcas: [],
    slides: [],
    trio_banners: [],
    duo_banners: [],
    selos: [],
  });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [modoAjuste, setModoAjuste] = useState<ModoAutoAjuste>("smart-banner");

  const [novaMarcaNome, setNovaMarcaNome] = useState("");
  const [novaMarcaLogo, setNovaMarcaLogo] = useState("");

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const dados = await catalogoService.obterCms();
      // JSONs antigos podem não ter `selos` — normaliza para nunca quebrar a UI.
      setCms({ ...dados, selos: dados.selos ?? [] });
    } catch {
      toast.error("Não foi possível carregar o CMS da loja.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(["cms.atualizado"], () => void carregar(true));

  const persistir = async (novoCms: CmsLoja, msg = "Conteúdo da loja atualizado em tempo real!") => {
    setCms(novoCms);
    setSalvando(true);
    try {
      const salvo = await catalogoService.salvarCms(novoCms);
      setCms(salvo);
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar CMS.");
    } finally {
      setSalvando(false);
    }
  };

  const uploadImagem = async (
    file: File | undefined,
    key: string,
    preset: keyof typeof PRESETS_MIDIA,
    onUrl: (url: string) => void,
    modoCustom?: ModoAutoAjuste,
  ) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const p = PRESETS_MIDIA[preset];
      const url = await processarEEnviarComPreset(file, preset, modoCustom);
      onUrl(url);
      toast.success(
        `Imagem auto-ajustada (${p.largura}×${p.altura}px) com sucesso! Clique em Salvar e Publicar.`,
      );
    } catch {
      toast.error("Não foi possível enviar a imagem.");
    } finally {
      setUploadingKey(null);
    }
  };

  // ── Ações de Marcas ────────────────────────────────────────────────────────
  const adicionarMarca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMarcaNome.trim()) return;
    const id = novaMarcaNome
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const nova: MarcaCms = {
      id: `${id}-${Date.now().toString(36)}`,
      nome: novaMarcaNome.trim(),
      logo: novaMarcaLogo.trim(),
      ativa: true,
    };
    const proximo = { ...cms, marcas: [nova, ...cms.marcas] };
    setNovaMarcaNome("");
    setNovaMarcaLogo("");
    await persistir(proximo, `Marca "${nova.nome}" cadastrada!`);
  };

  const atualizarMarca = (idx: number, patch: Partial<MarcaCms>) => {
    setCms((atual) => ({
      ...atual,
      marcas: atual.marcas.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));
  };

  const excluirMarca = async (idx: number) => {
    const alvo = cms.marcas[idx];
    if (!alvo) return;
    if (!window.confirm(`Deseja excluir a marca "${alvo.nome}"?`)) return;
    const proximo = { ...cms, marcas: cms.marcas.filter((_, i) => i !== idx) };
    await persistir(proximo, `Marca "${alvo.nome}" excluída.`);
  };

  // ── Ações de Slides (Banner Principal Topo) ────────────────────────────────
  const adicionarSlide = () => {
    const novo: SlideBannerCms = {
      id: `slide-${Date.now().toString(36)}`,
      badge: "DESTAQUE INDUSTRIAL",
      title: "Novo Banner Principal",
      subtitle: "Configure o subtítulo ou deixe em branco para exibir apenas a arte do banner.",
      price: "",
      button_text: "Ver Ofertas",
      button_link: "/busca",
      bg_image: "",
      image_mobile: "",
      product_image: "",
      classe: "slide-ferramentas",
      ativo: true,
    };
    setCms((atual) => ({ ...atual, slides: [...atual.slides, novo] }));
  };

  const atualizarSlide = (idx: number, patch: Partial<SlideBannerCms>) => {
    setCms((atual) => ({
      ...atual,
      slides: atual.slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const excluirSlide = async (idx: number) => {
    if (!window.confirm("Deseja remover este banner do topo?")) return;
    const proximo = { ...cms, slides: cms.slides.filter((_, i) => i !== idx) };
    await persistir(proximo, "Banner removido.");
  };

  // ── Ações do Trio de Banners ───────────────────────────────────────────────
  const adicionarTrio = () => {
    const novo: CardTrioCms = {
      id: `trio-${Date.now().toString(36)}`,
      badge: "OFERTA ESPECIAL",
      titulo: "Título do Banner Promocional",
      descricao: "Descrição curta da linha de produtos em promoção.",
      preco_destaque: "Condição exclusiva CNPJ",
      botao_texto: "Conferir",
      botao_link: "/busca",
      imagem_url: "",
      cor: "orange",
      ativo: true,
    };
    setCms((atual) => ({ ...atual, trio_banners: [...atual.trio_banners, novo] }));
  };

  const atualizarTrio = (idx: number, patch: Partial<CardTrioCms>) => {
    setCms((atual) => ({
      ...atual,
      trio_banners: atual.trio_banners.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const excluirTrio = async (idx: number) => {
    if (!window.confirm("Deseja remover este card promocional?")) return;
    const proximo = { ...cms, trio_banners: cms.trio_banners.filter((_, i) => i !== idx) };
    await persistir(proximo, "Card promocional removido.");
  };

  // ── Ações do Duo de Banners (50/50) ────────────────────────────────────────
  const adicionarDuo = () => {
    const novo: CardDuoCms = {
      id: `duo-${Date.now().toString(36)}`,
      tag: "LINHA INDUSTRIAL",
      titulo: "Novo Banner Largo",
      descricao: "Descrição da campanha ou linha de equipamentos.",
      destaque: "Pronta entrega para todo o Brasil",
      botao_texto: "Explorar Linha",
      botao_link: "/busca",
      imagem_url: "",
      estilo: "plasma",
      ativo: true,
    };
    setCms((atual) => ({ ...atual, duo_banners: [...atual.duo_banners, novo] }));
  };

  const atualizarDuo = (idx: number, patch: Partial<CardDuoCms>) => {
    setCms((atual) => ({
      ...atual,
      duo_banners: atual.duo_banners.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const excluirDuo = async (idx: number) => {
    if (!window.confirm("Deseja remover este banner largo?")) return;
    const proximo = { ...cms, duo_banners: cms.duo_banners.filter((_, i) => i !== idx) };
    await persistir(proximo, "Banner largo removido.");
  };

  // ── Ações dos Selos de Confiança (faixa abaixo do hero) ────────────────────
  const adicionarSelo = () => {
    const novo: SeloCms = {
      id: `selo-${Date.now().toString(36)}`,
      titulo: "Novo Selo de Confiança",
      descricao: "Descrição curta do benefício.",
      link: "/busca",
      icone_url: "",
      externo: false,
      ativo: true,
    };
    setCms((atual) => ({ ...atual, selos: [...atual.selos, novo] }));
  };

  const atualizarSelo = (idx: number, patch: Partial<SeloCms>) => {
    setCms((atual) => ({
      ...atual,
      selos: atual.selos.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const excluirSelo = async (idx: number) => {
    if (!window.confirm("Deseja remover este selo da faixa de confiança?")) return;
    const proximo = { ...cms, selos: cms.selos.filter((_, i) => i !== idx) };
    await persistir(proximo, "Selo removido.");
  };

  return (
    <>
      <PageHeader
        title="CMS da Loja · Banners & Marcas"
        subtitle="Gerencie as marcas parceiras e todos os banners da vitrine web com atualização em tempo real"
        action={
          <div className="flex items-center gap-2">
            <Button variant="contained" type="button" disabled={salvando} onClick={() => void persistir(cms)}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {salvando ? "Publicando…" : "Salvar e Publicar na Loja"}</Button>
            <IconButton size="small" type="button" onClick={() => void carregar()} aria-label="Recarregar"><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /></IconButton>
          </div>
        }
      />

      {/* Nav-tabs padrão WooCommerce + opção de auto-ajuste de upload */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          borderBottom: 1,
          borderColor: "divider",
          mb: 4,
        }}
      >
        <Tabs
          value={aba}
          onChange={(_, v: Aba) => setAba(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 44,
            "& .MuiTab-root": { minHeight: 44, textTransform: "none", fontWeight: 500, px: 2 },
          }}
        >
          <Tab value="marcas" label={`Marcas Parceiras (${cms.marcas.length})`} />
          <Tab value="slides" label={`Banner Principal Topo (${cms.slides.length})`} />
          <Tab value="trio" label={`Trio de Banners (${cms.trio_banners.length})`} />
          <Tab value="duo" label={`Duo de Banners 50/50 (${cms.duo_banners.length})`} />
          <Tab value="selos" label={`Selos de Confiança (${cms.selos.length})`} />
        </Tabs>

        <div className="flex items-center gap-2 pb-1">
          <Typography variant="caption" className="font-semibold text-muted-foreground">
            Auto-Ajuste no Upload:
          </Typography>
          <TextField size="small" select value={modoAjuste} onChange={(e) => setModoAjuste(e.target.value as ModoAutoAjuste)} sx={{ minWidth: 280 }}>
            <MenuItem value="smart-banner">Smart Fit (Encaixe Total sem cortar bordas)</MenuItem>
            <MenuItem value="cover">Smart Crop (Preencher 100% centralizado)</MenuItem>
            <MenuItem value="contain">Contain (Manter imagem inteira + borda suave)</MenuItem>
            <MenuItem value="proporcional">Proporção Original da Arte</MenuItem>
          </TextField>
        </div>
      </Box>

      {/* ABA 1: MARCAS PARCEIRAS — split form + listagem (padrão taxonomia WP) */}
      {aba === "marcas" && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Metabox title="Cadastrar Nova Marca">
            <Box component="form" onSubmit={(e) => void adicionarMarca(e)} className="space-y-5">
              <FormField label="Nome da Marca *">
                <TextField size="small" fullWidth
                  required
                  placeholder="Ex.: Vonder, Makita, ESAB…"
                  value={novaMarcaNome}
                  onChange={(e) => setNovaMarcaNome(e.target.value)} />
              </FormField>
              <FormField label="Logo da Marca (Upload ou URL)">
                <div className="flex gap-2">
                  <TextField size="small" fullWidth
                    placeholder="https://… ou envie ao lado"
                    value={novaMarcaLogo}
                    onChange={(e) => setNovaMarcaLogo(e.target.value)} />
                  <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    disabled={uploadingKey === "nova-marca"}
                    startIcon={uploadingKey === "nova-marca" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    Upload
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) =>
                        void uploadImagem(
                          e.target.files?.[0],
                          "nova-marca",
                          "marca",
                          setNovaMarcaLogo,
                        )
                      }
                    />
                  </Button>
                </div>
              </FormField>
              <Button variant="contained" size="small" type="submit" fullWidth startIcon={<Plus className="h-4 w-4" />}>
                Cadastrar Marca
              </Button>
            </Box>
          </Metabox>

          <Metabox
            title="Marcas Cadastradas"
            action={
              <Typography variant="caption" className="text-muted-foreground">
                exibidas em "Navegue por marcas" e no cadastro de Produtos
              </Typography>
            }
          >
            {cms.marcas.length === 0 && (
              <Typography variant="body2" className="py-8 text-center text-muted-foreground">
                Nenhuma marca cadastrada — use o formulário ao lado.
              </Typography>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cms.marcas.map((m, idx) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-3"
                >
                  <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white p-2">
                    {m.logo ? (
                      <img
                        src={resolverUrlPreview(m.logo)}
                        alt={m.nome}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] font-bold text-slate-500">{m.nome}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <TextField size="small" fullWidth
                      value={m.nome}
                      onChange={(e) => atualizarMarca(idx, { nome: e.target.value })} />
                    <div className="flex items-center gap-1">
                      <Button
                        component="label"
                        variant="outlined"
                        size="small"
                        startIcon={<ImagePlus className="h-3 w-3" />}
                        sx={{ fontSize: 11, px: 1, whiteSpace: "nowrap" }}
                      >
                        Trocar logo
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={(e) =>
                            void uploadImagem(
                              e.target.files?.[0],
                              `marca-${m.id}`,
                              "marca",
                              (url) => atualizarMarca(idx, { logo: url }),
                            )
                          }
                        />
                      </Button>
                      <FormControlLabel
                        control={<Checkbox size="small" checked={m.ativa} onChange={(e) => atualizarMarca(idx, { ativa: e.target.checked })} />}
                        label={<Typography variant="caption">Ativa</Typography>}
                        sx={{ mr: 0 }}
                      />
                      <IconButton size="small" color="error" type="button" onClick={() => void excluirMarca(idx)} aria-label={`Excluir ${m.nome}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Metabox>
        </div>
      )}

      {/* ABA 2: BANNER PRINCIPAL DO TOPO (HERO SLIDER) */}
      {aba === "slides" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Typography variant="caption" className="text-muted-foreground">
              Slides do banner principal (hero) no topo da vitrine.
            </Typography>
            <Button variant="contained" size="small" type="button" onClick={adicionarSlide} startIcon={<Plus className="h-4 w-4" />}>
              Adicionar Slide
            </Button>
          </div>

          {cms.slides.length === 0 && (
            <Metabox title="Banner Principal">
              <Typography variant="body2" className="py-8 text-center text-muted-foreground">
                Nenhum slide cadastrado.
              </Typography>
            </Metabox>
          )}

          {cms.slides.map((s, idx) => (
            <Metabox
              key={s.id}
              title={`Slide #${idx + 1}`}
              action={
                <div className="flex items-center gap-1">
                  <FormControlLabel
                    control={<Checkbox size="small" checked={s.ativo} onChange={(e) => atualizarSlide(idx, { ativo: e.target.checked })} />}
                    label={<Typography variant="caption">Slide ativo na vitrine</Typography>}
                    sx={{ mr: 0 }}
                  />
                  <IconButton size="small" color="error" type="button" onClick={() => void excluirSlide(idx)} aria-label={`Excluir slide ${idx + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
                <div className="space-y-3">
                  <div className="aspect-[16/7] w-full overflow-hidden rounded-xl border border-border bg-slate-900">
                    {s.bg_image ? (
                      <img
                        src={resolverUrlPreview(s.bg_image)}
                        alt={s.title || `Slide ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-slate-400">
                        Sem imagem de banner
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      component="label"
                      variant="outlined"
                      size="small"
                      disabled={uploadingKey === `slide-bg-${s.id}`}
                      startIcon={uploadingKey === `slide-bg-${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    >
                      Banner Desktop (2000×650)
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={(e) =>
                          void uploadImagem(
                            e.target.files?.[0],
                            `slide-bg-${s.id}`,
                            "banner-desktop",
                            (url) => atualizarSlide(idx, { bg_image: url }),
                            modoAjuste,
                          )
                        }
                      />
                    </Button>
                    <Button
                      component="label"
                      variant="outlined"
                      size="small"
                      startIcon={<ImagePlus className="h-3.5 w-3.5" />}
                    >
                      Banner Mobile (1080×1350)
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={(e) =>
                          void uploadImagem(
                            e.target.files?.[0],
                            `slide-mob-${s.id}`,
                            "banner-mobile",
                            (url) => atualizarSlide(idx, { image_mobile: url }),
                            modoAjuste,
                          )
                        }
                      />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="URL do Banner Desktop *">
                    <TextField size="small" fullWidth
                      value={s.bg_image}
                      onChange={(e) => atualizarSlide(idx, { bg_image: e.target.value })} />
                  </FormField>
                  <FormField label="URL do Banner Mobile (opcional)">
                    <TextField size="small" fullWidth
                      value={s.image_mobile}
                      onChange={(e) => atualizarSlide(idx, { image_mobile: e.target.value })} />
                  </FormField>
                  <FormField label="Link de Destino ao clicar" wide>
                    <TextField size="small" fullWidth
                      placeholder="/busca"
                      value={s.button_link}
                      onChange={(e) => atualizarSlide(idx, { button_link: e.target.value })} />
                  </FormField>
                </div>
              </div>
            </Metabox>
          ))}
        </div>
      )}

      {/* ABA 3: TRIO DE BANNERS PROMOCIONAIS */}
      {aba === "trio" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Typography variant="caption" className="text-muted-foreground">
              Três cards promocionais lado a lado abaixo do hero.
            </Typography>
            <Button variant="contained" size="small" type="button" onClick={adicionarTrio} startIcon={<Plus className="h-4 w-4" />}>
              Adicionar Card
            </Button>
          </div>

          {cms.trio_banners.length === 0 && (
            <Metabox title="Trio de Banners">
              <Typography variant="body2" className="py-8 text-center text-muted-foreground">
                Nenhum card promocional cadastrado.
              </Typography>
            </Metabox>
          )}

          {cms.trio_banners.map((c, idx) => (
            <Metabox
              key={c.id}
              title={`Card #${idx + 1} · ${c.titulo}`}
              action={
                <div className="flex items-center gap-1">
                  <FormControlLabel
                    control={<Checkbox size="small" checked={c.ativo} onChange={(e) => atualizarTrio(idx, { ativo: e.target.checked })} />}
                    label={<Typography variant="caption">Ativo</Typography>}
                    sx={{ mr: 0 }}
                  />
                  <IconButton size="small" color="error" type="button" onClick={() => void excluirTrio(idx)} aria-label={`Excluir card ${idx + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
                <div className="space-y-3">
                  <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-slate-900">
                    {c.imagem_url && (
                      <img
                        src={resolverUrlPreview(c.imagem_url)}
                        alt={c.titulo}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    startIcon={<ImagePlus className="h-3.5 w-3.5" />}
                  >
                    Auto-Ajustar Imagem (900×560)
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) =>
                        void uploadImagem(
                          e.target.files?.[0],
                          `trio-${c.id}`,
                          "banner-trio",
                          (url) => atualizarTrio(idx, { imagem_url: url }),
                          modoAjuste === "smart-banner" ? "cover" : modoAjuste,
                        )
                      }
                    />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="URL da Imagem do Banner *" wide>
                    <TextField size="small" fullWidth
                      value={c.imagem_url}
                      onChange={(e) => atualizarTrio(idx, { imagem_url: e.target.value })} />
                  </FormField>
                  <FormField label="Link de Destino ao clicar" wide>
                    <TextField size="small" fullWidth
                      placeholder="/busca"
                      value={c.botao_link}
                      onChange={(e) => atualizarTrio(idx, { botao_link: e.target.value })} />
                  </FormField>
                </div>
              </div>
            </Metabox>
          ))}
        </div>
      )}

      {/* ABA 4: DUO DE BANNERS LARGOS (50/50) */}
      {aba === "duo" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Typography variant="caption" className="text-muted-foreground">
              Dois banners largos lado a lado (50/50).
            </Typography>
            <Button variant="contained" size="small" type="button" onClick={adicionarDuo} startIcon={<Plus className="h-4 w-4" />}>
              Adicionar Banner Largo
            </Button>
          </div>

          {cms.duo_banners.length === 0 && (
            <Metabox title="Duo de Banners">
              <Typography variant="body2" className="py-8 text-center text-muted-foreground">
                Nenhum banner largo cadastrado.
              </Typography>
            </Metabox>
          )}

          {cms.duo_banners.map((c, idx) => (
            <Metabox
              key={c.id}
              title={`Banner Largo #${idx + 1}`}
              action={
                <div className="flex items-center gap-1">
                  <FormControlLabel
                    control={<Checkbox size="small" checked={c.ativo} onChange={(e) => atualizarDuo(idx, { ativo: e.target.checked })} />}
                    label={<Typography variant="caption">Ativo</Typography>}
                    sx={{ mr: 0 }}
                  />
                  <IconButton size="small" color="error" type="button" onClick={() => void excluirDuo(idx)} aria-label={`Excluir banner largo ${idx + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
                <div className="space-y-3">
                  <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-slate-900">
                    {c.imagem_url && (
                      <img
                        src={resolverUrlPreview(c.imagem_url)}
                        alt={`Banner Largo ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    startIcon={<ImagePlus className="h-3.5 w-3.5" />}
                  >
                    Auto-Ajustar Imagem (1200×620)
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) =>
                        void uploadImagem(
                          e.target.files?.[0],
                          `duo-${c.id}`,
                          "banner-duo",
                          (url) => atualizarDuo(idx, { imagem_url: url }),
                          modoAjuste === "smart-banner" ? "cover" : modoAjuste,
                        )
                      }
                    />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="URL da Imagem do Banner *" wide>
                    <TextField size="small" fullWidth
                      value={c.imagem_url}
                      onChange={(e) => atualizarDuo(idx, { imagem_url: e.target.value })} />
                  </FormField>
                  <FormField label="Link de Destino ao clicar" wide>
                    <TextField size="small" fullWidth
                      placeholder="/busca"
                      value={c.botao_link}
                      onChange={(e) => atualizarDuo(idx, { botao_link: e.target.value })} />
                  </FormField>
                </div>
              </div>
            </Metabox>
          ))}
        </div>
      )}

      {/* ABA 5: SELOS DE CONFIANÇA (faixa abaixo do hero) */}
      {aba === "selos" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Typography variant="caption" className="text-muted-foreground">
              Ícones de confiança na faixa abaixo do hero (frete, garantia, pagamento…).
            </Typography>
            <Button variant="contained" size="small" type="button" onClick={adicionarSelo} startIcon={<Plus className="h-4 w-4" />}>
              Adicionar Selo
            </Button>
          </div>

          {cms.selos.length === 0 && (
            <Metabox title="Selos de Confiança">
              <Typography variant="body2" className="py-8 text-center text-muted-foreground">
                Nenhum selo cadastrado.
              </Typography>
            </Metabox>
          )}

          {cms.selos.map((s, idx) => (
            <Metabox
              key={s.id}
              title={`Selo #${idx + 1} · ${s.titulo}`}
              action={
                <div className="flex items-center gap-1">
                  <FormControlLabel
                    control={<Checkbox size="small" checked={s.ativo} onChange={(e) => atualizarSelo(idx, { ativo: e.target.checked })} />}
                    label={<Typography variant="caption">Ativo</Typography>}
                    sx={{ mr: 0 }}
                  />
                  <IconButton size="small" color="error" type="button" onClick={() => void excluirSelo(idx)} aria-label={`Excluir selo ${idx + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[160px_1fr]">
                <div className="space-y-3">
                  <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl border border-border bg-white p-4">
                    {s.icone_url ? (
                      <img
                        src={resolverUrlPreview(s.icone_url)}
                        alt={s.titulo}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400">Sem ícone</span>
                    )}
                  </div>
                  <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    disabled={uploadingKey === `selo-${s.id}`}
                    startIcon={uploadingKey === `selo-${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  >
                    Ícone (128×128)
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) =>
                        void uploadImagem(
                          e.target.files?.[0],
                          `selo-${s.id}`,
                          "selo",
                          (url) => atualizarSelo(idx, { icone_url: url }),
                        )
                      }
                    />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Título *">
                    <TextField size="small" fullWidth
                      value={s.titulo}
                      onChange={(e) => atualizarSelo(idx, { titulo: e.target.value })} />
                  </FormField>
                  <FormField label="Descrição (opcional)">
                    <TextField size="small" fullWidth
                      value={s.descricao}
                      onChange={(e) => atualizarSelo(idx, { descricao: e.target.value })} />
                  </FormField>
                  <FormField label="URL do Ícone (upload ou assets/externa)" wide>
                    <TextField size="small" fullWidth
                      placeholder="/api/v1/midia/… ou assets/header/icons/icon-x.png"
                      value={s.icone_url}
                      onChange={(e) => atualizarSelo(idx, { icone_url: e.target.value })} />
                  </FormField>
                  <FormField label="Link de Destino ao clicar">
                    <TextField size="small" fullWidth
                      placeholder="/busca ou https://…"
                      value={s.link}
                      onChange={(e) => atualizarSelo(idx, { link: e.target.value })} />
                  </FormField>
                  <FormField label="Abertura do link">
                    <FormControlLabel
                      control={<Checkbox size="small" checked={s.externo} onChange={(e) => atualizarSelo(idx, { externo: e.target.checked })} />}
                      label={<Typography variant="body2">Abrir em nova aba (link externo)</Typography>}
                      className="flex h-10 items-center"
                      sx={{ m: 0 }}
                    />
                  </FormField>
                </div>
              </div>
            </Metabox>
          ))}
        </div>
      )}
    </>
  );
}
