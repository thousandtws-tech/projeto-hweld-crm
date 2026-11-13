import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api } from "@/lib/api";
import type { Perfil, Usuario } from "@/lib/models";
import {
  loginStaff,
  logoutStaff,
  onSessionChange,
  perfilAtual,
  pode as sessionPode,
  staffAutenticado,
  usuarioIdAtual,
} from "@/lib/session";
import { trocarSenha } from "@/lib/services";

export type StaffUser = {
  id: number;
  perfil: Perfil | null;
  nome?: string;
  email?: string;
};

export class AuthError extends Error {
  readonly code: "invalid_credentials" | "unknown";

  constructor(code: AuthError["code"]) {
    super(code);
    this.code = code;
  }
}

export function getSessionUser(): StaffUser | null {
  if (!staffAutenticado()) return null;
  return { id: usuarioIdAtual() ?? 0, perfil: perfilAtual() };
}

type AuthStore = {
  user: StaffUser | null;
  perfil: Perfil | null;
  isLoading: boolean;
  autenticado: boolean;
  pode: (...perfis: Perfil[]) => boolean;
  signIn: (email: string, senha: string) => Promise<void>;
  signOut: () => Promise<void>;
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
};

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(() => getSessionUser());
  const [isLoading] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => onSessionChange(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    if (!user || user.nome || user.perfil !== "admin") return;
    api
      .get<Usuario>("usuarios", user.id)
      .then((u) =>
        setUser((cur) => (cur?.id === u.id ? { ...cur, nome: u.nome, email: u.email } : cur)),
      )
      .catch(() => {});
  }, [user]);

  const signIn = useCallback<AuthStore["signIn"]>(async (email, senha) => {
    try {
      await loginStaff(email.trim(), senha);
    } catch {
      throw new AuthError("invalid_credentials");
    }
    setUser(getSessionUser());
  }, []);

  const signOut = useCallback<AuthStore["signOut"]>(async () => {
    await logoutStaff();
    setUser(null);
  }, []);

  const value = useMemo<AuthStore>(
    () => ({
      user,
      perfil: user?.perfil ?? null,
      isLoading,
      autenticado: user !== null,
      pode: sessionPode,
      signIn,
      signOut,
      trocarSenha,
    }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
