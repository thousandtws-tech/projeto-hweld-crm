import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";

import "../styles.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/store/auth-store";
import { staffAutenticado } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <Typography variant="h4" component="h1" className="text-7xl font-bold text-foreground">404</Typography>
        <Typography variant="h6" component="h2" className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</Typography>
        <Typography variant="body2" component="p" className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </Typography>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <Typography variant="h4" component="h1" className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </Typography>
        <Typography variant="body2" component="p" className="mt-2 text-sm text-muted-foreground">
          Algo deu errado do nosso lado. Tente atualizar ou volte ao início.
        </Typography>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="contained" onClick={() => {
              router.invalidate();
              reset();
            }}>Tentar novamente</Button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir ao dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: ({ location }) => {
    const isLogin = location.pathname === "/login";
    const autenticado = staffAutenticado();
    if (!autenticado && !isLogin) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (autenticado && isLogin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Shell persistente: montado uma vez acima do <Outlet> e sobrevive a
  // toda navegação interna (sidebar, topbar, sino e listener Ctrl+K não
  // remontam). /login fica de fora — não há chrome de app na autenticação.
  const isLogin = useRouterState({ select: (s) => s.location.pathname === "/login" });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isLogin ? (
          <Outlet />
        ) : (
          <AppShell>
            <Outlet />
          </AppShell>
        )}
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
