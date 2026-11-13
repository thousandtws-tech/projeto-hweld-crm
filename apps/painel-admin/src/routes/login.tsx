import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleAlert, Clock, Eye, EyeOff, Loader2 } from "lucide-react";
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
      footer={
        <p className="m-0">
          Problemas de acesso?{" "}
          <span className="font-semibold text-[#0062ff]">Fale com um administrador.</span>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {expired && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg bg-[#fff7e6] px-3 py-3 text-[12.5px] text-[#b45309]"
          >
            <Clock className="h-[18px] w-[18px] shrink-0" />
            <span>Sua sessão expirou. Entre novamente para continuar.</span>
          </div>
        )}
        {formError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg bg-[#fee2e2] px-3 py-3 text-[12.5px] text-[#dc2626]"
          >
            <CircleAlert className="h-[18px] w-[18px] shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <AuthField icon="mail" invalid={!!errors.email}>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="Seu e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authInputClass}
              />
            </AuthField>
            {errors.email && (
              <p className="mt-1 text-xs font-medium text-[#dc2626]">{errors.email}</p>
            )}
          </div>

          <div>
            <AuthField icon="lock" invalid={!!errors.senha}>
              <input
                id="senha"
                type={showSenha ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className={authInputClass}
              />
              <button
                type="button"
                aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowSenha((v) => !v)}
                className="shrink-0 text-[#969ab8] transition-colors hover:text-[#171725]"
              >
                {showSenha ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </AuthField>
            {errors.senha && (
              <p className="mt-1 text-xs font-medium text-[#dc2626]">{errors.senha}</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0062ff] px-4 py-3 text-[14px] font-semibold tracking-[0.1px] text-white transition-colors hover:bg-[#0052d8] disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </AuthLayout>
  );
}
