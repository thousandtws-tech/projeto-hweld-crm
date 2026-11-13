import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";

import { FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
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
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
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

      {/* Barra de Auto-Ajuste de Dimensões (Padrão Grandes CMS) + Navegação por Abas */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["marcas", `Marcas Parceiras (${cms.marcas.length})`],
              ["slides", `Banner Principal Topo (${cms.slides.length})`],
              ["trio", `Trio de Banners (${cms.trio_banners.length})`],
              ["duo", `Duo de Banners 50/50 (${cms.duo_banners.length})`],
              ["selos", `Selos de Confiança (${cms.selos.length})`],
            ] as const
          ).map(([id, rotulo]) => (
            <Chip label={<>{rotulo}</>} size="small" variant={(aba === id) ? "filled" : "outlined"} color={(aba === id) ? "primary" : "default"} key={id} onClick={() => setAba(id)} />
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">Auto-Ajuste no Upload:</span>
          <TextField size="small" select value={modoAjuste} onChange={(e) => setModoAjuste(e.target.value as ModoAutoAjuste)}>
            <MenuItem value="smart-banner">Smart Fit (Encaixe Total sem cortar bordas)</MenuItem>
            <MenuItem value="cover">Smart Crop (Preencher 100% centralizado)</MenuItem>
            <MenuItem value="contain">Contain (Manter imagem inteira + borda suave)</MenuItem>
            <MenuItem value="proporcional">Proporção Original da Arte</MenuItem>
          </TextField>
        </div>
      </div>

      {/* ABA 1: MARCAS PARCEIRAS */}
      {aba === "marcas" && (
        <div className="space-y-4">
          <SectionCard>
            <Typography variant="h6" component="h2" className="mb-3 text-sm font-bold">Cadastrar Nova Marca</Typography>
            <Box component="form" onSubmit={(e) => void adicionarMarca(e)} className="grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <FormField label="Nome da Marca *">
                  <TextField size="small" fullWidth
                    required
                    placeholder="Ex.: Vonder, Makita, ESAB…"
                    value={novaMarcaNome}
                    onChange={(e) => setNovaMarcaNome(e.target.value)} />
                </FormField>
              </div>
              <div className="sm:col-span-5">
                <FormField label="Logo da Marca (Upload ou URL)">
                  <div className="flex gap-2">
                    <TextField size="small" fullWidth
                      placeholder="https://... ou envie arquivo ao lado"
                      value={novaMarcaLogo}
                      onChange={(e) => setNovaMarcaLogo(e.target.value)} />
                    <Typography component="label" className="mt-1 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-secondary">
                      {uploadingKey === "nova-marca" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          void uploadImagem(
                            e.target.files?.[0],
                            "nova-marca",
                            "marca",
                            setNovaMarcaLogo,
                          )
                        }
                      />
                    </Typography>
                  </div>
                </FormField>
              </div>
              <div className="flex items-end sm:col-span-3">
                <Button variant="contained" size="small" type="submit"><Plus className="h-4 w-4" /> Cadastrar Marca</Button>
              </div>
            </Box>
          </SectionCard>

          <SectionCard>
            <Typography variant="h6" component="h2" className="mb-3 text-sm font-bold">
              Marcas Cadastradas (exibidas em "Navegue por marcas" e no cadastro de Produtos)
            </Typography>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cms.marcas.map((m, idx) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/20 p-3"
                >
                  <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-white p-2">
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

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <TextField size="small" fullWidth
                      value={m.nome}
                      onChange={(e) => atualizarMarca(idx, { nome: e.target.value })} />
                    <div className="flex items-center gap-1.5">
                      <Typography component="label" className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium hover:bg-secondary">
                        <ImagePlus className="h-3 w-3" /> Trocar logo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            void uploadImagem(
                              e.target.files?.[0],
                              `marca-${m.id}`,
                              "marca",
                              (url) => atualizarMarca(idx, { logo: url }),
                            )
                          }
                        />
                      </Typography>
                      <Typography component="label" className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Checkbox checked={m.ativa} onChange={(e) => atualizarMarca(idx, { ativa: e.target.checked })} />
                        Ativa
                      </Typography>
                      <Button variant="contained" color="error" size="small" type="button" onClick={() => void excluirMarca(idx)}><Trash2 className="h-3 w-3" /> Excluir</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ABA 2: BANNER PRINCIPAL DO TOPO (HERO SLIDER) */}
      {aba === "slides" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outlined" size="small" type="button" onClick={adicionarSlide}><Plus className="h-4 w-4" /> Adicionar Slide no Topo</Button>
          </div>

          {cms.slides.map((s, idx) => (
            <SectionCard key={s.id} className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Slide #{idx + 1}
                  </span>
                  <Typography component="label" className="flex items-center gap-2 text-xs font-medium">
                    <Checkbox checked={s.ativo} onChange={(e) => atualizarSlide(idx, { ativo: e.target.checked })} />
                    Slide ativo na vitrine
                  </Typography>
                </div>
                <Button variant="contained" color="error" size="small" type="button" onClick={() => void excluirSlide(idx)}><Trash2 className="h-3.5 w-3.5" /> Excluir Slide</Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div className="space-y-2">
                  <div className="aspect-[16/7] w-full overflow-hidden rounded-2xl border border-border bg-slate-900">
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
                    <Typography component="label" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                      {uploadingKey === `slide-bg-${s.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      Trocar Banner Desktop (2000×650)
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
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
                    </Typography>
                    <Typography component="label" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                      <ImagePlus className="h-3.5 w-3.5" /> Banner Mobile (1080×1350)
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
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
                    </Typography>
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
            </SectionCard>
          ))}
        </div>
      )}

      {/* ABA 3: TRIO DE BANNERS PROMOCIONAIS */}
      {aba === "trio" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outlined" size="small" type="button" onClick={adicionarTrio}><Plus className="h-4 w-4" /> Adicionar Card no Trio</Button>
          </div>

          {cms.trio_banners.map((c, idx) => (
            <SectionCard key={c.id} className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Card #{idx + 1} · {c.titulo}
                  </span>
                  <Typography component="label" className="flex items-center gap-2 text-xs font-medium">
                    <Checkbox checked={c.ativo} onChange={(e) => atualizarTrio(idx, { ativo: e.target.checked })} />
                    Ativo
                  </Typography>
                </div>
                <Button variant="contained" color="error" size="small" type="button" onClick={() => void excluirTrio(idx)}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="space-y-2">
                  <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border bg-slate-900">
                    {c.imagem_url && (
                      <img
                        src={resolverUrlPreview(c.imagem_url)}
                        alt={c.titulo}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <Typography component="label" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                    <ImagePlus className="h-3.5 w-3.5" /> Auto-Ajustar Imagem (900×560)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
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
                  </Typography>
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
            </SectionCard>
          ))}
        </div>
      )}

      {/* ABA 4: DUO DE BANNERS LARGOS (50/50) */}
      {aba === "duo" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outlined" size="small" type="button" onClick={adicionarDuo}><Plus className="h-4 w-4" /> Adicionar Banner Largo</Button>
          </div>

          {cms.duo_banners.map((c, idx) => (
            <SectionCard key={c.id} className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Banner Largo #{idx + 1}
                  </span>
                  <Typography component="label" className="flex items-center gap-2 text-xs font-medium">
                    <Checkbox checked={c.ativo} onChange={(e) => atualizarDuo(idx, { ativo: e.target.checked })} />
                    Ativo
                  </Typography>
                </div>
                <Button variant="contained" color="error" size="small" type="button" onClick={() => void excluirDuo(idx)}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                <div className="space-y-2">
                  <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl border border-border bg-slate-900">
                    {c.imagem_url && (
                      <img
                        src={resolverUrlPreview(c.imagem_url)}
                        alt={`Banner Largo ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <Typography component="label" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                    <ImagePlus className="h-3.5 w-3.5" /> Auto-Ajustar Imagem (1200×620)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
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
                  </Typography>
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
            </SectionCard>
          ))}
        </div>
      )}

      {/* ABA 5: SELOS DE CONFIANÇA (faixa abaixo do hero) */}
      {aba === "selos" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outlined" size="small" type="button" onClick={adicionarSelo}><Plus className="h-4 w-4" /> Adicionar Selo</Button>
          </div>

          {cms.selos.map((s, idx) => (
            <SectionCard key={s.id} className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Selo #{idx + 1} · {s.titulo}
                  </span>
                  <Typography component="label" className="flex items-center gap-2 text-xs font-medium">
                    <Checkbox checked={s.ativo} onChange={(e) => atualizarSelo(idx, { ativo: e.target.checked })} />
                    Ativo
                  </Typography>
                </div>
                <Button variant="contained" color="error" size="small" type="button" onClick={() => void excluirSelo(idx)}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border border-border bg-white p-4">
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
                  <Typography component="label" className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                    {uploadingKey === `selo-${s.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    Ícone (128×128)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        void uploadImagem(
                          e.target.files?.[0],
                          `selo-${s.id}`,
                          "selo",
                          (url) => atualizarSelo(idx, { icone_url: url }),
                        )
                      }
                    />
                  </Typography>
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
                    <Typography component="label" className="flex h-10 items-center gap-2 text-xs font-medium">
                      <Checkbox checked={s.externo} onChange={(e) => atualizarSelo(idx, { externo: e.target.checked })} />
                      Abrir em nova aba (link externo)
                    </Typography>
                  </FormField>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </>
  );
}
