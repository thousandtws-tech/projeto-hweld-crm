import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthField, AuthLayout, authInputClass } from "@/components/auth/AuthLayout";
import { AuthError, useAuth } from "@/store/auth-store";

const credentialsSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido"),
  senha: z.string().min(1, "Informe a senha"),
});

type FieldErrors = Partial<Record<"email" | "senha", string>>;

const searchSchema = (search: Record<string, unknown>) => ({
  redirect:
    typeof search.redirect === "string" && search.redirect.startsWith("/")
      ? search.redirect
      : "/dashboard",
  expired: search.expired === "1",
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect, expired } = Route.useSearch();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = credentialsSchema.safeParse({ email, senha });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await signIn(parsed.data.email, parsed.data.senha);
      navigate({ to: redirect as "/" });
    } catch (err) {
      setFormError(
        err instanceof AuthError && err.code === "invalid_credentials"
          ? "Credenciais inválidas ou usuário inativo."
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesso restrito à equipe"
      footer={<>Problemas de acesso? Fale com um administrador.</>}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {expired && (
          <div className="rounded-2xl bg-[var(--pill-warn-bg)] px-4 py-3 text-sm text-[var(--pill-warn-fg)]">
            Sessão expirada. Entre novamente.
          </div>
        )}
        {formError && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {formError}
          </div>
        )}

        <AuthField label="E-mail" error={errors.email}>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@hweld.com"
            className={authInputClass}
          />
        </AuthField>

        <AuthField label="Senha" error={errors.senha}>
          <div className="relative">
            <input
              type={showSenha ? "text" : "password"}
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              className={`${authInputClass} pr-11`}
            />
            <button
              type="button"
              aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShowSenha((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </AuthField>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-lime px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </AuthLayout>
  );
}
