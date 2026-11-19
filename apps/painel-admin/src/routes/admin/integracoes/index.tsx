import { createFileRoute } from "@tanstack/react-router";
import { PlugZap, Search, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { IntegracaoCard } from "@/components/integracoes/IntegracaoCard";
import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { toast } from "@/components/ui/sonner";
import { exigePerfil } from "@/lib/guards";
import {
  CATALOGO,
  CATEGORIAS,
  categoriaRotulo,
  estadoInfobip,
  estadoMelhorEnvio,
  estadoSpedy,
  estadoZapi,
  type CategoriaIntegracao,
  type EstadoConexao,
  type IntegracaoCatalogo,
} from "@/lib/integracoes";
import type {
  IntegracaoInfobip,
  IntegracaoMelhorEnvio,
  IntegracaoSpedy,
  IntegracaoZapi,
} from "@/lib/models";
import {
  integracoesService,
  melhorEnvioService,
  spedyService,
  zapiService,
} from "@/lib/services";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export const Route = createFileRoute("/admin/integracoes/")({
  beforeLoad: exigePerfil("admin"),
  component: IntegracoesCatalogoPage,
});

type EstadoPorSlug = Record<string, EstadoConexao>;

const STATUS_FILTRO: { valor: EstadoConexao | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Todos os status" },
  { valor: "conectado", rotulo: "Conectado" },
  { valor: "pendente", rotulo: "Configuração pendente" },
  { valor: "desconectado", rotulo: "Desconectado" },
  { valor: "falha", rotulo: "Erro de conexão" },
  { valor: "em_breve", rotulo: "Em breve" },
];

const TEMPO_LIMITE_MS = 12_000;

function comTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error("tempo limite excedido")), TEMPO_LIMITE_MS)),
  ]);
}

/** Catálogo de integrações — estados reais por provider, "Em breve"
 *  para os ainda sem backend. Nenhuma ação de conexão é fabricada. */
function IntegracoesCatalogoPage() {
  const [estados, setEstados] = useState<EstadoPorSlug>({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaIntegracao | "">("");
  const [status, setStatus] = useState<EstadoConexao | "">("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [inf, zap, spe, me] = await Promise.allSettled([
      comTimeout(integracoesService.infobip()),
      comTimeout(zapiService.view()),
      comTimeout(spedyService.view()),
      comTimeout(melhorEnvioService.view()),
    ]);
    const prox: EstadoPorSlug = {};
    const errs: string[] = [];
    if (inf.status === "fulfilled") {
      prox.infobip = estadoInfobip(inf.value as IntegracaoInfobip);
    } else {
      prox.infobip = "falha";
      errs.push("Infobip");
    }
    if (zap.status === "fulfilled") {
      prox.zapi = estadoZapi(zap.value as IntegracaoZapi);
    } else {
      prox.zapi = "falha";
      errs.push("Z-API");
    }
    if (spe.status === "fulfilled") {
      prox.spedy = estadoSpedy(spe.value as IntegracaoSpedy);
    } else {
      prox.spedy = "falha";
      errs.push("Spedy");
    }
    if (me.status === "fulfilled") {
      prox["melhor-envio"] = estadoMelhorEnvio(me.value as IntegracaoMelhorEnvio);
    } else {
      prox["melhor-envio"] = "falha";
      errs.push("Melhor Envio");
    }
    // Nunca implementadas no backend → sempre "em_breve".
    for (const item of CATALOGO) {
      if (!item.implementada) prox[item.slug] = "em_breve";
    }
    setEstados(prox);
    setCarregando(false);
    if (errs.length > 0) {
      toast.error(`Não foi possível consultar o status de ${errs.join(", ")} — mostrando "Erro de conexão".`);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return CATALOGO.filter((item) => {
      if (categoria && item.categoria !== categoria) return false;
      const e = estados[item.slug] ?? "desconectado";
      if (status && e !== status) return false;
      if (q) {
        const alvo = `${item.nome} ${item.descricao} ${categoriaRotulo(item.categoria)}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [busca, categoria, status, estados]);

  const conectadas = filtradas.filter(
    (i) => i.implementada && estados[i.slug] === "conectado");
  const explorar = filtradas.filter((i) => !conectadas.includes(i));

  const estadoDe = (item: IntegracaoCatalogo): EstadoConexao =>
    item.implementada ? (estados[item.slug] ?? "desconectado") : "em_breve";

  return (
    <>
      <PageHeader
        title="Integrações"
        subtitle="Conecte ferramentas e serviços para automatizar e ampliar as funcionalidades do seu negócio."
      />

      {/* Busca + filtros */}
      <div className="mb-6 mt-4 flex flex-wrap items-center gap-3">
        <TextField
          size="small"
          placeholder="Buscar integrações…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          sx={{ minWidth: { xs: "100%", sm: 300 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          size="small"
          select
          value={status}
          onChange={(e) => setStatus(e.target.value as EstadoConexao | "")}
          sx={{ minWidth: 190 }}
          slotProps={{ select: { displayEmpty: true } }}
          aria-label="Filtrar por status de conexão"
        >
          {STATUS_FILTRO.map((s) => (
            <MenuItem key={s.rotulo} value={s.valor}>{s.rotulo}</MenuItem>
          ))}
        </TextField>
      </div>

      <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
        <Chip
          label="Todas"
          size="small"
          variant={categoria === "" ? "filled" : "outlined"}
          color={categoria === "" ? "primary" : "default"}
          onClick={() => setCategoria("")}
        />
        {CATEGORIAS.map((c) => (
          <Chip
            key={c.slug}
            label={c.rotulo}
            size="small"
            variant={categoria === c.slug ? "filled" : "outlined"}
            color={categoria === c.slug ? "primary" : "default"}
            onClick={() => setCategoria(categoria === c.slug ? "" : c.slug)}
          />
        ))}
      </div>

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <Skeleton key={k} variant="rounded" height={180} sx={{ borderRadius: "12px" }} />
          ))}
        </div>
      ) : filtradas.length === 0 ? (
        <SectionCard>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <SearchX className="h-6 w-6 text-muted-foreground" />
            <Typography variant="body2" className="text-sm font-medium">
              Nenhuma integração encontrada
            </Typography>
            <Typography variant="body2" className="text-xs text-muted-foreground">
              Ajuste a busca ou limpe os filtros para ver o catálogo completo.
            </Typography>
          </div>
        </SectionCard>
      ) : (
        <>
          {conectadas.length > 0 && (
            <section aria-labelledby="sec-conectadas" className="mb-8">
              <Typography
                id="sec-conectadas"
                component="h2"
                className="mb-3 flex items-center gap-2 text-sm font-semibold"
              >
                <PlugZap className="h-4 w-4 text-muted-foreground" /> Minhas integrações
              </Typography>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {conectadas.map((item) => (
                  <IntegracaoCard key={item.slug} item={item} estado={estadoDe(item)} />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="sec-explorar">
            <Typography
              id="sec-explorar"
              component="h2"
              className="mb-3 text-sm font-semibold"
            >
              Explorar integrações
            </Typography>
            {explorar.length === 0 ? (
              <SectionCard>
                <Typography variant="body2" className="py-6 text-center text-xs text-muted-foreground">
                  Todas as integrações do filtro atual já estão conectadas.
                </Typography>
              </SectionCard>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {explorar.map((item) => (
                  <IntegracaoCard key={item.slug} item={item} estado={estadoDe(item)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
