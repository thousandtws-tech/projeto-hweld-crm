import type { FormEvent, ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const fieldClass =
  "mt-1 w-full rounded-2xl border border-border bg-secondary/60 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground";

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
    <label
      className={`block text-xs font-medium text-muted-foreground ${wide ? "sm:col-span-2" : ""}`}
    >
      {label}
      {children}
    </label>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl border-border bg-card p-0 gap-0 shadow-[var(--shadow-pop)]">
        <DialogHeader className="border-b border-border p-5 text-left sm:p-6">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">{children}</div>
          <div className="flex justify-end gap-2 border-t border-border p-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-full bg-lime text-primary-foreground hover:bg-lime/90"
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
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
