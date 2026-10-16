import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/sem-permissao")({
  component: SemPermissaoPage,
});

function SemPermissaoPage() {
  return (
    <AppShell>
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--pill-warn-bg)] text-[var(--pill-warn-fg)]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sem permissão</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu perfil não tem acesso a esta área. Fale com um administrador.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
