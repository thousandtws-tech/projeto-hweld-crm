import { Link } from "@tanstack/react-router";
import { Boxes, Filter, ShoppingCart, Zap } from "lucide-react";
import type { ReactNode } from "react";

const highlights = [
  { icon: Filter, text: "Pipeline de oportunidades e orçamentos" },
  { icon: ShoppingCart, text: "Pedidos com máquina de status auditável" },
  { icon: Boxes, text: "Estoque, NF e caixa integrados" },
];

function LogoMark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {light ? (
        <img src="/brand/hweld-white.png" alt="HWeld" className="h-20 w-auto" />
      ) : (
        <>
          <img src="/brand/hweld-color.png" alt="HWeld" className="h-20 w-auto dark:hidden" />
          <img src="/brand/hweld-white.png" alt="HWeld" className="hidden h-20 w-auto dark:block" />
        </>
      )}
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 lg:p-6">
      <div className="grid min-h-[calc(100vh-1.5rem)] sm:min-h-[calc(100vh-2rem)] lg:min-h-[calc(100vh-3rem)] lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Brand panel */}
        <div className="relative hidden lg:flex flex-col justify-between overflow-hidden rounded-3xl bg-foreground p-10 text-background">
          <Link to="/" className="relative z-10 w-fit">
            <LogoMark light />
          </Link>

          <div className="relative z-10 max-w-md">
            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.05]">
              Backoffice
              <br />
              que acompanha
              <br />a operação.
            </h1>
            <p className="mt-4 text-sm leading-relaxed opacity-70">
              E-commerce B2B de soldagem — CRM, catálogo, vendas, estoque e financeiro em um só
              lugar.
            </p>
          </div>

          <ul className="relative z-10 space-y-3">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full bg-lime text-primary-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="opacity-90">{text}</span>
              </li>
            ))}
          </ul>

          <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-lime/15" />
          <div className="absolute -left-16 -bottom-24 w-80 h-80 rounded-full bg-white/5" />
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center rounded-3xl bg-card border border-border p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="lg:hidden mb-8 text-foreground">
              <LogoMark />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

            <div className="mt-8">{children}</div>

            <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export const authInputClass =
  "w-full rounded-2xl bg-secondary/60 px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-secondary";
