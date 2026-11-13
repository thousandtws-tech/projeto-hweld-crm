import type { FormEvent, ReactNode } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const fieldClass =
  "mt-1 w-full rounded-xl border border-border bg-secondary/60 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground";

export function FormField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <FormControl
      fullWidth
      sx={{ gridColumn: wide ? { sm: "span 2" } : undefined, gap: 1.25 }}
    >
      <FormLabel sx={{ fontSize: 12.5, fontWeight: 500, color: "text.primary" }}>{label}</FormLabel>
      {children}
    </FormControl>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, maxHeight: "90vh" } } }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}>
        <Typography variant="h6" component="div" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </DialogTitle>
      <Box component="form" onSubmit={onSubmit}>
        <DialogContent
          sx={{ display: "grid", gap: 2, gridTemplateColumns: { sm: "1fr 1fr" }, py: 3 }}
        >
          {children}
        </DialogContent>
        <DialogActions sx={{ borderTop: 1, borderColor: "divider", px: 3, py: 2 }}>
          <Button variant="outlined" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained">
            {submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function downloadCsv<T extends object>(filename: string, rows: T[]) {
  if (rows.length === 0) return;
  const first = rows[0] as Record<string, unknown>;
  const keys = Object.keys(first);
  const quote = (value: string | number | boolean) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [
    keys.map(quote).join(","),
    ...rows.map((row) =>
      keys.map((key) => quote(String((row as Record<string, unknown>)[key] ?? ""))).join(","),
    ),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
