import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { StatusPill } from "@/components/ui-kit/primitives";

export type DetailField = { label: string; value: ReactNode; wide?: boolean };

export function DetailDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  headline,
  headlineLabel,
  fields = [],
  children,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  status?: string;
  headline?: string;
  headlineLabel?: string;
  fields?: DetailField[];
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: "8px" } } }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Box minWidth={0}>
            <Typography variant="h6" component="div" fontWeight={700} noWrap>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {subtitle ?? "Detalhes do registro"}
            </Typography>
          </Box>
          {status && <StatusPill status={status} />}
        </Stack>
        {headline && (
          <Box mt={1}>
            <Typography variant="h4" fontWeight={700} letterSpacing="-0.02em">
              {headline}
            </Typography>
            {headlineLabel && (
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                {headlineLabel}
              </Typography>
            )}
          </Box>
        )}
      </DialogTitle>

      <DialogContent sx={{ maxHeight: "60vh", py: 3 }}>
        <Stack spacing={3}>
          {fields.length > 0 && (
            <Box
              component="dl"
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                columnGap: 2,
                rowGap: 2,
                m: 0,
              }}
            >
              {fields.map((f) => (
                <Box key={f.label} sx={f.wide ? { gridColumn: "span 2" } : undefined}>
                  <Typography component="dt" variant="caption" color="text.secondary">
                    {f.label}
                  </Typography>
                  <Typography
                    component="dd"
                    variant="body2"
                    fontWeight={500}
                    sx={{ m: 0, mt: 0.5, wordBreak: "break-word" }}
                  >
                    {f.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          {children}
        </Stack>
      </DialogContent>

      {actions && (
        <DialogActions sx={{ borderTop: 1, borderColor: "divider", px: 3, py: 2 }}>
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
}

export function DetailAction({
  children,
  onClick,
  variant = "ghost",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "primary";
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={variant === "primary" ? "contained" : "outlined"}
      size="small"
    >
      {children}
    </Button>
  );
}
