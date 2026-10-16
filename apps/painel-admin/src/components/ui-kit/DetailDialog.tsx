import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl border-border bg-card p-0 gap-0 overflow-hidden shadow-[var(--shadow-pop)]">
        <DialogHeader className="space-y-2 border-b border-border p-5 sm:p-6 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-xl font-bold tracking-tight">
                {title}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                {subtitle ?? "Record details"}
              </DialogDescription>
            </div>
            {status && <StatusPill status={status} />}
          </div>
          {headline && (
            <div>
              <div className="text-3xl font-bold tracking-tight">{headline}</div>
              {headlineLabel && (
                <div className="text-xs text-muted-foreground mt-1">{headlineLabel}</div>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto p-5 sm:p-6 space-y-5">
          {fields.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              {fields.map((f) => (
                <div key={f.label} className={f.wide ? "col-span-2" : ""}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="mt-1 text-sm font-medium break-words">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {children}
        </div>

        {actions && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4 sm:px-6">
            {actions}
          </div>
        )}
      </DialogContent>
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
  const cls =
    variant === "primary"
      ? "bg-lime text-primary-foreground"
      : "border border-border bg-card text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${cls}`}
    >
      {children}
    </button>
  );
}
