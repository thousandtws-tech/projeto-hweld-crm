import { createLink } from "@tanstack/react-router";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

const CardActionAreaLink = createLink(CardActionArea);
const ButtonLink = createLink(Button);

import { StatusPill } from "@/components/ui-kit/primitives";
import { LogoIntegracao } from "@/components/integracoes/LogoIntegracao";
import {
  acaoDoEstado,
  categoriaRotulo,
  estadoUi,
  type EstadoConexao,
  type IntegracaoCatalogo,
} from "@/lib/integracoes";

/** Card padronizado do catálogo — apresentação pura; o estado real vem de fora. */
export function IntegracaoCard({
  item,
  estado,
}: {
  item: IntegracaoCatalogo;
  estado: EstadoConexao;
}) {
  const ui = estadoUi(estado);
  const acao = acaoDoEstado(estado);
  const emBreve = estado === "em_breve";

  return (
    <Card
      variant="outlined"
      className="flex h-full flex-col"
      sx={{
        borderRadius: "12px",
        boxShadow: "none",
        transition: "border-color .15s ease, box-shadow .15s ease",
        "&:hover": { borderColor: "divider", boxShadow: "var(--shadow-card)" },
      }}
    >
      <CardActionAreaLink
        to="/admin/integracoes/$slug"
        params={{ slug: item.slug }}
        sx={{ flexGrow: 1, alignItems: "stretch" }}
        aria-label={`${item.nome} — ${ui.rotulo}`}
      >
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%", p: 2.5 }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <LogoIntegracao iniciais={item.iniciais} cor={item.cor} />
              <div className="min-w-0">
                <Typography component="h3" className="truncate text-sm font-semibold">
                  {item.nome}
                </Typography>
                <Typography className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {categoriaRotulo(item.categoria)}
                </Typography>
              </div>
            </div>
            <StatusPill status={ui.tom} label={ui.rotulo} />
          </div>

          <Typography
            variant="body2"
            className="text-xs leading-relaxed text-muted-foreground"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.6em",
            }}
          >
            {item.descricao}
          </Typography>
        </CardContent>
      </CardActionAreaLink>

      <CardActions sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 1.25 }}>
        <ButtonLink
          to="/admin/integracoes/$slug"
          params={{ slug: item.slug }}
          size="small"
          variant={emBreve ? "outlined" : "contained"}
          disabled={acao.desabilitado}
          fullWidth
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {acao.rotulo}
        </ButtonLink>
      </CardActions>
    </Card>
  );
}
