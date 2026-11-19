import { createFileRoute, createLink, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock } from "lucide-react";
import { useCallback, useState } from "react";

import { InfobipPainel } from "@/components/integracoes/InfobipPainel";
import { MelhorEnvioPainel } from "@/components/integracoes/MelhorEnvioPainel";
import { PagBankPainel } from "@/components/integracoes/PagBankPainel";
import { SpedyPainel } from "@/components/integracoes/SpedyPainel";
import { LogoIntegracao } from "@/components/integracoes/LogoIntegracao";
import { ZapiCard } from "@/components/integracoes/ZapiCard";
import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { exigePerfil } from "@/lib/guards";
import {
  CATALOGO_POR_SLUG,
  categoriaRotulo,
  estadoInfobip,
  estadoMelhorEnvio,
  estadoPagBank,
  estadoSpedy,
  estadoUi,
  estadoZapi,
  type EstadoConexao,
  type IntegracaoCatalogo,
} from "@/lib/integracoes";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

const ButtonLink = createLink(Button);

export const Route = createFileRoute("/admin/integracoes/$slug")({
  beforeLoad: exigePerfil("admin"),
  component: IntegracaoDetalhePage,
});

/** Detalhe da integração — hero (logo, categoria, estado real) + painel
 *  do provider quando implementado; "Em breve" informativo caso contrário. */
function IntegracaoDetalhePage() {
  const { slug } = Route.useParams();
  const item = CATALOGO_POR_SLUG.get(slug);
  const [estado, setEstado] = useState<EstadoConexao | null>(null);

  if (!item) {
    return (
      <>
        <PageHeader title="Integração não encontrada" />
        <SectionCard>
          <div className="py-8 text-center">
            <Typography variant="body2" className="text-xs text-muted-foreground">
              Não existe integração com o identificador "{slug}" no catálogo.
            </Typography>
            <ButtonLink to="/admin/integracoes" variant="outlined" size="small"
              className="mt-3" startIcon={<ArrowLeft className="h-4 w-4" />}>
              Voltar ao catálogo
            </ButtonLink>
          </div>
        </SectionCard>
      </>
    );
  }

  const estadoEfetivo: EstadoConexao =
    item.implementada ? (estado ?? "desconectado") : "em_breve";
  const ui = estadoUi(estadoEfetivo);

  return (
    <>
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <li>
            <Link to="/admin/integracoes" className="hover:text-foreground hover:underline">
              Integrações
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>{categoriaRotulo(item.categoria)}</li>
          <li aria-hidden>/</li>
          <li className="font-medium text-foreground">{item.nome}</li>
        </ol>
      </nav>

      {/* Hero da integração */}
      <SectionCard className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <LogoIntegracao iniciais={item.iniciais} cor={item.cor} tamanho={52} />
            <div className="min-w-0">
              <Typography component="h1" className="text-base font-semibold leading-tight">
                {item.nome}
                {item.escopo && (
                  <span className="ml-2 rounded-md border border-border px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {item.escopo}
                  </span>
                )}
              </Typography>
              <Typography className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {categoriaRotulo(item.categoria)}
              </Typography>
              <Typography variant="body2" className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
                {item.descricao}
              </Typography>
            </div>
          </div>
          <StatusPill status={ui.tom} label={ui.rotulo} />
        </div>
      </SectionCard>

      {item.implementada ? (
        <PainelDoProvider item={item} onEstado={setEstado} />
      ) : (
        <EmBreve item={item} />
      )}
    </>
  );
}

function PainelDoProvider({
  item,
  onEstado,
}: {
  item: IntegracaoCatalogo;
  onEstado: (e: EstadoConexao) => void;
}) {
  const onInfobip = useCallback(
    (v: Parameters<typeof estadoInfobip>[0]) => onEstado(estadoInfobip(v)), [onEstado]);
  const onZapi = useCallback(
    (v: Parameters<typeof estadoZapi>[0]) => onEstado(estadoZapi(v)), [onEstado]);
  const onSpedy = useCallback(
    (v: Parameters<typeof estadoSpedy>[0]) => onEstado(estadoSpedy(v)), [onEstado]);
  const onMelhorEnvio = useCallback(
    (v: Parameters<typeof estadoMelhorEnvio>[0]) => onEstado(estadoMelhorEnvio(v)), [onEstado]);
  const onPagBank = useCallback(
    (v: Parameters<typeof estadoPagBank>[0]) => onEstado(estadoPagBank(v)), [onEstado]);

  if (item.slug === "infobip") return <InfobipPainel onView={onInfobip} />;
  if (item.slug === "zapi") return <ZapiCard onView={onZapi} />;
  if (item.slug === "spedy") return <SpedyPainel onView={onSpedy} />;
  if (item.slug === "melhor-envio") return <MelhorEnvioPainel onView={onMelhorEnvio} />;
  if (item.slug === "pagbank") return <PagBankPainel onView={onPagBank} />;
  return null;
}

/** Detalhe informativo para integrações ainda sem backend — sem ação de conexão. */
function EmBreve({ item }: { item: IntegracaoCatalogo }) {
  return (
    <SectionCard>
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <Typography component="h2" className="text-sm font-semibold">
            Em breve no HWeld
          </Typography>
          <Typography variant="body2" className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {item.nome} está no nosso catálogo planejado de integrações e ainda não
            está disponível para conexão. Quando implementada, aparecerá aqui com as
            credenciais e configurações gerenciadas por você.
          </Typography>
          {item.funcionalidades && item.funcionalidades.length > 0 && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {item.funcionalidades.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          )}
          <ButtonLink to="/admin/integracoes" variant="outlined" size="small"
            className="mt-5" startIcon={<ArrowLeft className="h-4 w-4" />}>
            Voltar ao catálogo
          </ButtonLink>
        </div>
      </div>
    </SectionCard>
  );
}
