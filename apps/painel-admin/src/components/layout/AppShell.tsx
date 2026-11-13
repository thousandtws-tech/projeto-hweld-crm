import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Network,
  Package,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Tags,
  Users,
  Vault,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useTheme } from "@/hooks/use-theme";
import { calcularScoreLexico } from "@/lib/algoritmos";
import { ApiError } from "@/lib/api";
import { brl, fmtDataHora } from "@/lib/format";
import type { Contato, Empresa, Oportunidade, Perfil, Produto } from "@/lib/models";
import { buscaService, catalogoService, crmService } from "@/lib/services";
import { useNotificacoes } from "@/lib/use-notificacoes";
import { useRealtimeStatus } from "@/lib/use-realtime";
import { useAuth } from "@/store/auth-store";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import MuiLink from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

type NavItem = { to: string; label: string; icon: LucideIcon; perfis?: Perfil[] };
type NavSection = { secao: string; itens: NavItem[] };

const NAV: NavSection[] = [
  {
    secao: "Vendas",
    itens: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/crm/oportunidades", label: "Oportunidades", icon: Filter },
      { to: "/crm/empresas", label: "Empresas", icon: Building2 },
      { to: "/vendas/orcamentos", label: "Orçamentos", icon: FileText },
      { to: "/vendas/pedidos", label: "Pedidos", icon: ShoppingCart },
    ],
  },
  {
    secao: "Catálogo",
    itens: [
      {
        to: "/catalogo/produtos",
        label: "Produtos",
        icon: Package,
        perfis: ["admin", "estoque", "vendedor"],
      },
      {
        to: "/catalogo/categorias",
        label: "Categorias",
        icon: Network,
        perfis: ["admin", "estoque"],
      },
      {
        to: "/catalogo/tabelas-preco",
        label: "Tabelas de preço",
        icon: Tags,
        perfis: ["admin", "vendedor"],
      },
      {
        to: "/catalogo/cms",
        label: "CMS da Loja (Banners & Marcas)",
        icon: LayoutDashboard,
        perfis: ["admin", "estoque", "vendedor"],
      },
    ],
  },
  {
    secao: "Operação",
    itens: [
      { to: "/estoque", label: "Estoque", icon: Boxes, perfis: ["admin", "estoque"] },
      {
        to: "/operacao/ordens-servico",
        label: "Ordens de serviço",
        icon: Wrench,
        perfis: ["admin", "tecnico"],
      },
      {
        to: "/fiscal/notas",
        label: "Notas fiscais",
        icon: Receipt,
        perfis: ["admin", "financeiro"],
      },
      {
        to: "/fiscal/configuracao",
        label: "Config. fiscal",
        icon: ShieldCheck,
        perfis: ["admin", "financeiro"],
      },
    ],
  },
  {
    secao: "Financeiro",
    itens: [
      {
        to: "/financeiro/pagamentos",
        label: "Pagamentos",
        icon: Coins,
        perfis: ["admin", "financeiro"],
      },
      { to: "/financeiro/caixa", label: "Caixa", icon: Vault, perfis: ["admin", "financeiro"] },
    ],
  },
  {
    secao: "Administração",
    itens: [
      { to: "/admin/usuarios", label: "Usuários", icon: Users, perfis: ["admin"] },
      { to: "/admin/busca", label: "Busca", icon: Search, perfis: ["admin"] },
      { to: "/auditoria", label: "Auditoria", icon: ShieldCheck, perfis: ["admin"] },
    ],
  },
];

type Crumb = { label: string; to?: string };

const MAPA_ROTAS: Record<string, { secao: string; label: string; parentTo?: string }> = {
  "/dashboard": { secao: "Vendas", label: "Dashboard" },
  "/crm/oportunidades": { secao: "Vendas", label: "Oportunidades" },
  "/crm/empresas": { secao: "Vendas", label: "Empresas" },
  "/crm/empresas/nova": { secao: "Vendas", label: "Nova empresa", parentTo: "/crm/empresas" },
  "/vendas/orcamentos": { secao: "Vendas", label: "Orçamentos" },
  "/vendas/pedidos": { secao: "Vendas", label: "Pedidos" },
  "/vendas/pedidos/novo": { secao: "Vendas", label: "Novo pedido", parentTo: "/vendas/pedidos" },
  "/catalogo/produtos": { secao: "Catálogo", label: "Produtos" },
  "/catalogo/produtos/novo": {
    secao: "Catálogo",
    label: "Novo produto",
    parentTo: "/catalogo/produtos",
  },
  "/catalogo/categorias": { secao: "Catálogo", label: "Categorias" },
  "/catalogo/tabelas-preco": { secao: "Catálogo", label: "Tabelas de preço" },
  "/catalogo/cms": { secao: "Catálogo", label: "CMS da Loja (Banners & Marcas)" },
  "/estoque": { secao: "Operação", label: "Estoque" },
  "/operacao/ordens-servico": { secao: "Operação", label: "Ordens de serviço" },
  "/fiscal/notas": { secao: "Operação", label: "Notas fiscais" },
  "/fiscal/configuracao": { secao: "Operação", label: "Configuração fiscal" },
  "/financeiro/pagamentos": { secao: "Financeiro", label: "Pagamentos" },
  "/financeiro/caixa": { secao: "Financeiro", label: "Caixa" },
  "/admin/usuarios": { secao: "Administração", label: "Usuários" },
  "/admin/busca": { secao: "Administração", label: "Busca" },
  "/auditoria": { secao: "Administração", label: "Auditoria" },
  "/conta": { secao: "Conta", label: "Minha conta" },
};

function resolverBreadcrumbs(pathname: string): Crumb[] {
  const limpo = pathname === "/" ? "/dashboard" : pathname.replace(/\/+$/, "");
  const direto = MAPA_ROTAS[limpo];
  if (direto) {
    if (direto.parentTo && MAPA_ROTAS[direto.parentTo]) {
      return [
        { label: direto.secao },
        { label: MAPA_ROTAS[direto.parentTo].label, to: direto.parentTo },
        { label: direto.label },
      ];
    }
    return [{ label: direto.secao }, { label: direto.label }];
  }

  // Rotas parametrizadas (/recurso/:id)
  const partes = limpo.split("/").filter(Boolean);
  if (partes.length >= 2) {
    const id = partes[partes.length - 1];
    const prefixo = `/${partes.slice(0, -1).join("/")}`;
    const pai = MAPA_ROTAS[prefixo];
    if (pai && /^\d+$/.test(id)) {
      return [{ label: pai.secao }, { label: pai.label, to: prefixo }, { label: `#${id}` }];
    }
  }

  return [{ label: "CRM" }, { label: limpo.slice(1) || "Dashboard" }];
}

/* ---------------------------------------------------------------------------
 * Algoritmo 2: Motor de Busca Federada & Ranqueamento Léxico (Omnibox Ctrl+K)
 * ------------------------------------------------------------------------- */

interface ItemOmnibox {
  id: string;
  grupo: "Navegação" | "Empresas" | "Oportunidades" | "Contatos" | "Produtos";
  titulo: string;
  subtitulo?: string;
  direita?: string;
  to: string;
  search?: Record<string, string>;
  score: number;
}

function Logo() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2 px-2 py-2">
      <img src="/brand/hweld-color.png" alt="HWeld" className="h-15 w-auto dark:hidden" />
      <img src="/brand/hweld-white.png" alt="HWeld" className="hidden h-15 w-auto dark:block" />
    </Link>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { user, pode, signOut } = useAuth();
  const navigate = useNavigate();
  const itemBase =
    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors";
  const itemSx = { py: "10px", px: "12px", borderRadius: "16px" } as const;

  const handleSignOut = async () => {
    await signOut();
    onNavigate?.();
    navigate({ to: "/login" });
  };

  return (
    <>
      <Logo />
      <Box component="nav" className="mt-4 flex flex-col gap-4">
        {NAV.map((secao) => {
          const itens = secao.itens.filter((i) => !i.perfis || pode(...i.perfis));
          if (itens.length === 0) return null;
          return (
            <div key={secao.secao}>
              <Typography
                variant="overline"
                component="p"
                className="px-3 pb-1 text-[13px] font-bold tracking-[0.12em] text-muted-foreground"
              >
                {secao.secao}
              </Typography>
              <List disablePadding className="flex flex-col gap-0.5">
                {itens.map((item) => {
                  const active =
                    item.to === "/dashboard"
                      ? pathname === "/dashboard" || pathname === "/"
                      : pathname.startsWith(item.to);
                  const Icon = item.icon;
                  return (
                    <ListItem key={item.to} disablePadding>
                      <ListItemButton
                        component={Link}
                        to={item.to as "/"}
                        onClick={onNavigate}
                        selected={active}
                        sx={itemSx}
                        className={`${itemBase} ${
                          active
                            ? "bg-lime text-primary-foreground"
                            : "text-foreground hover:bg-secondary"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </div>
          );
        })}
      </Box>

      <List disablePadding className="mt-auto space-y-1 pt-6">
        <ListItem disablePadding>
          <ListItemButton
            component={Link}
            to="/conta"
            onClick={onNavigate}
            selected={pathname === "/conta"}
            className={`${itemBase} ${pathname === "/conta" ? "bg-lime text-primary-foreground" : "text-foreground hover:bg-secondary"}`}
            sx={itemSx}
          >
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold">
              {(user?.perfil?.[0] ?? "?").toUpperCase()}
            </div>
            <span className="min-w-0 flex-1 truncate">
              {user?.nome ?? `#${user?.id ?? "?"}`}
              <span className="ml-1.5 text-xs capitalize text-muted-foreground">{user?.perfil}</span>
            </span>
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleSignOut}
            className={`${itemBase} w-full text-foreground hover:bg-secondary`}
            sx={itemSx}
          >
            <LogOut className="h-4 w-4" /> Sair
          </ListItemButton>
        </ListItem>
      </List>
    </>
  );
}

function Panel({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <ClickAwayListener onClickAway={onClose}>
      <Paper
        elevation={0}
        className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-white p-2.5 shadow-[var(--shadow-pop)]"
      >
        {children}
      </Paper>
    </ClickAwayListener>
  );
}

function Sino() {
  const svc = useNotificacoes();
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative">
      <Tooltip title="Notificações">
        <IconButton
          aria-label="Notificações"
          onClick={() => {
            setAberto((v) => {
              if (!v) void svc.atualizar();
              return !v;
            });
          }}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <Badge
            badgeContent={svc.naoLidas > 99 ? "99+" : svc.naoLidas}
            color="error"
            invisible={svc.naoLidas === 0}
            overlap="circular"
            sx={{ "& .MuiBadge-badge": { fontSize: 10, height: 16, minWidth: 16, padding: "0 4px" } }}
          >
            <Bell className="h-4 w-4" />
          </Badge>
        </IconButton>
      </Tooltip>
      {aberto && (
        <Panel onClose={() => setAberto(false)}>
          <div className="flex items-center justify-between border-b border-border/60 px-2.5 pt-1 pb-2">
            <Typography variant="overline" className="text-xs font-bold tracking-wider text-muted-foreground">
              Notificações {svc.naoLidas > 0 ? `(${svc.naoLidas})` : ""}
            </Typography>
            {svc.itens.length > 0 && (
              <Button
                variant="text"
                size="small"
                onClick={() => void svc.marcarTodas()}
                className="text-xs font-medium text-primary hover:underline"
                sx={{ minWidth: 0, p: 0 }}
              >
                Limpar todas
              </Button>
            )}
          </div>
          <List disablePadding className="mt-1 max-h-80 space-y-0.5 overflow-y-auto scrollbar-none">
            {svc.itens.length === 0 && (
              <ListItem>
                <Typography variant="caption" className="py-6 text-center text-muted-foreground" component="div" sx={{ width: "100%" }}>
                  Tudo em dia! Nenhuma notificação pendente.
                </Typography>
              </ListItem>
            )}
            {svc.itens.map((n) => (
              <ListItem
                key={n.id}
                disablePadding
                secondaryAction={
                  <Tooltip title="Marcar como lida e remover">
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label="Marcar como lida e remover"
                      onClick={(e) => {
                        e.stopPropagation();
                        void svc.dispensar(n.id);
                      }}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-600"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </IconButton>
                  </Tooltip>
                }
                className="rounded-xl bg-secondary/40 transition hover:bg-secondary"
              >
                <ListItemButton
                  onClick={() => {
                    setAberto(false);
                    void svc.abrir(n);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-2 py-2 text-left"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">
                      {n.titulo}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {n.mensagem}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                      {fmtDataHora(n.created_at)}
                    </span>
                  </span>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Panel>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggleTheme } = useTheme();
  const { user, perfil, pode, signOut } = useAuth();
  const sseOnline = useRealtimeStatus();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Estado do Omnibox Federado (Ctrl+K / ⌘K)
  const inputBuscaRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [resultadosRemotos, setResultadosRemotos] = useState<{
    empresas: Empresa[];
    oportunidades: Oportunidade[];
    contatos: Contato[];
    produtos: Produto[];
  }>({ empresas: [], oportunidades: [], contatos: [], produtos: [] });

  const crumbs = useMemo(() => resolverBreadcrumbs(pathname), [pathname]);

  // Atalho global Ctrl+K / Cmd+K para focar na busca
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputBuscaRef.current?.focus();
        setBuscaAberta(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Busca federada multi-entidade com debounce e cancelamento
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResultadosRemotos({ empresas: [], oportunidades: [], contatos: [], produtos: [] });
      setBuscando(false);
      return;
    }

    let cancelado = false;
    setBuscando(true);

    const t = setTimeout(async () => {
      const buscarProdutos = async (): Promise<Produto[]> => {
        try {
          const p = await buscaService.buscar({ q, por_pagina: 4 });
          return p.itens ?? [];
        } catch (e) {
          if (e instanceof ApiError && e.status === 503) {
            const p = await catalogoService.produtos({ busca: q, por_pagina: 4 }).catch(() => null);
            return p?.itens ?? [];
          }
          return [];
        }
      };

      const [empresasRes, contatosRes, opsRes, produtos] = await Promise.all([
        crmService.empresas({ busca: q, por_pagina: 4 }).catch(() => null),
        crmService.contatos({ busca: q, por_pagina: 4 }).catch(() => null),
        // `busca` filtra no servidor quando suportado; o filtro local abaixo
        // continua como rede de segurança para o caso de o backend ignorar.
        crmService.oportunidades({ busca: q, por_pagina: 30 }).catch(() => null),
        buscarProdutos(),
      ]);

      if (cancelado) return;

      const termo = q.toLowerCase();
      const opsFiltradas = (opsRes?.itens ?? [])
        .filter(
          (o) =>
            o.titulo.toLowerCase().includes(termo) ||
            (o.descricao ?? "").toLowerCase().includes(termo),
        )
        .slice(0, 4);

      setResultadosRemotos({
        empresas: empresasRes?.itens ?? [],
        contatos: contatosRes?.itens ?? [],
        oportunidades: opsFiltradas,
        produtos,
      });
      setBuscando(false);
      setIndiceAtivo(0);
    }, 240);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [search]);

  // Monta e ranqueia a lista unificada do Omnibox
  const itensOmnibox = useMemo<ItemOmnibox[]>(() => {
    const q = search.trim();
    const lista: ItemOmnibox[] = [];

    // 1. Páginas de navegação permitidas ao perfil
    for (const sec of NAV) {
      for (const item of sec.itens) {
        if (item.perfis && !pode(...item.perfis)) continue;
        if (!q) {
          lista.push({
            id: `nav-${item.to}`,
            grupo: "Navegação",
            titulo: item.label,
            subtitulo: sec.secao,
            to: item.to,
            score: 50,
          });
        } else if (
          item.label.toLowerCase().includes(q.toLowerCase()) ||
          sec.secao.toLowerCase().includes(q.toLowerCase())
        ) {
          lista.push({
            id: `nav-${item.to}`,
            grupo: "Navegação",
            titulo: item.label,
            subtitulo: sec.secao,
            to: item.to,
            score: calcularScoreLexico(q, item.label, sec.secao) + 5,
          });
        }
      }
    }

    if (q.length < 2) return lista.slice(0, 6);

    // 2. Empresas
    for (const emp of resultadosRemotos.empresas) {
      const nome = emp.nome_fantasia || emp.razao_social;
      lista.push({
        id: `emp-${emp.id}`,
        grupo: "Empresas",
        titulo: nome,
        subtitulo: emp.cnpj ? `CNPJ ${emp.cnpj}` : emp.razao_social,
        to: `/crm/empresas/${emp.public_id}`,
        score: calcularScoreLexico(q, nome, emp.cnpj ?? ""),
      });
    }

    // 3. Oportunidades
    for (const op of resultadosRemotos.oportunidades) {
      lista.push({
        id: `op-${op.id}`,
        grupo: "Oportunidades",
        titulo: op.titulo,
        subtitulo: op.estagio.toUpperCase(),
        direita: op.valor_estimado ? brl(op.valor_estimado) : undefined,
        to: "/crm/oportunidades",
        score: calcularScoreLexico(q, op.titulo, op.descricao ?? ""),
      });
    }

    // 4. Contatos
    for (const c of resultadosRemotos.contatos) {
      lista.push({
        id: `cont-${c.id}`,
        grupo: "Contatos",
        titulo: c.nome,
        subtitulo: c.email || c.telefone || c.cargo || `Empresa #${c.empresa_id}`,
        to: `/crm/empresas/${c.empresa_id}`,
        score: calcularScoreLexico(q, c.nome, c.email ?? ""),
      });
    }

    // 5. Produtos
    for (const prod of resultadosRemotos.produtos) {
      lista.push({
        id: `prod-${prod.id}`,
        grupo: "Produtos",
        titulo: prod.nome,
        subtitulo: `${prod.sku}${prod.marca ? ` · ${prod.marca}` : ""}`,
        direita: brl(prod.preco_venda),
        to: `/catalogo/produtos/${prod.public_id}`,
        score: calcularScoreLexico(q, prod.nome, prod.sku),
      });
    }

    return lista.sort((a, b) => b.score - a.score);
  }, [search, resultadosRemotos, pode]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    setUserMenuOpen(false);
    setMenuOpen(false);
    setBuscaAberta(false);
  }, [pathname]);

  const executarItemOmnibox = (item: ItemOmnibox) => {
    setBuscaAberta(false);
    setSearch("");
    navigate({ to: item.to as "/", search: item.search as never });
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setBuscaAberta(false);
      inputBuscaRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setBuscaAberta(true);
      setIndiceAtivo((i) => (itensOmnibox.length > 0 ? (i + 1) % itensOmnibox.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setBuscaAberta(true);
      setIndiceAtivo((i) =>
        itensOmnibox.length > 0 ? (i - 1 + itensOmnibox.length) % itensOmnibox.length : 0,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const selecionado = itensOmnibox[indiceAtivo];
      if (selecionado) {
        executarItemOmnibox(selecionado);
      } else if (search.trim() && perfil === "admin") {
        setBuscaAberta(false);
        navigate({ to: "/admin/busca", search: { q: search.trim() } });
      }
    }
  };

  const sair = async () => {
    setUserMenuOpen(false);
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 lg:p-6">
      <div className="flex gap-4 lg:gap-6">
        {/* Sidebar (desktop) */}
        <Box
          component="aside"
          className="hidden lg:flex w-60 xl:w-64 shrink-0 flex-col rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] p-5 sticky top-6 self-start h-[calc(100vh-3rem)] overflow-y-auto scrollbar-none"
        >
          <SidebarContent pathname={pathname} />
        </Box>

        {/* Mobile / tablet drawer */}
        <Drawer
          anchor="left"
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          sx={{ display: { lg: "none" } }}
          slotProps={{
            paper: {
              className: "w-[80%] max-w-xs flex-col bg-card border-r border-border p-5 overflow-y-auto scrollbar-none",
            },
          }}
        >
          <IconButton
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-secondary/60"
          >
            <X className="h-4 w-4" />
          </IconButton>
          <SidebarContent pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        </Drawer>

        {/* Main */}
        <Box component="main" className="flex-1 min-w-0 space-y-4 lg:space-y-5">
          {/* Header Enterprise Minimalista */}
          <Box
            component="header"
            className="sticky top-3 z-30 flex h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-3.5 shadow-[var(--shadow-card)] backdrop-blur-md sm:px-4"
          >
            {/* Esquerda: Menu Mobile + Breadcrumb Hierárquico */}
            <div className="flex min-w-0 items-center gap-2.5">
              <IconButton
                aria-label="Abrir menu"
                onClick={() => setMenuOpen(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/70 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </IconButton>

              <Breadcrumbs
                aria-label="Breadcrumb"
                separator={<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
                className="min-w-0 text-sm"
                sx={{ "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap" } }}
              >
                {crumbs.map((c, idx) => {
                  const ultimo = idx === crumbs.length - 1;
                  return c.to && !ultimo ? (
                    <MuiLink
                      key={`${c.label}-${idx}`}
                      component={Link}
                      to={c.to as "/"}
                      underline="hover"
                      className="truncate text-xs font-medium text-muted-foreground transition hover:text-foreground sm:text-sm"
                    >
                      {c.label}
                    </MuiLink>
                  ) : (
                    <Typography
                      key={`${c.label}-${idx}`}
                      component="span"
                      className={`truncate text-xs sm:text-sm ${
                        ultimo
                          ? "font-semibold text-foreground"
                          : "hidden font-medium text-muted-foreground sm:inline"
                      }`}
                    >
                      {c.label}
                    </Typography>
                  );
                })}
              </Breadcrumbs>
            </div>

            {/* Centro: Omnibox Federado (Ctrl+K) */}
            <div className="relative flex-1 max-w-md">
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 transition ${
                  buscaAberta
                    ? "border-primary bg-card ring-2 ring-primary/15"
                    : "border-border/80 bg-secondary/40 hover:border-border"
                }`}
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <InputBase
                  inputRef={inputBuscaRef}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBuscaAberta(true);
                  }}
                  onFocus={() => setBuscaAberta(true)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Buscar empresas, oportunidades, produtos…"
                  inputProps={{
                    "aria-label": "Busca global",
                    autoComplete: "off",
                    name: "hweld-omnibox",
                    spellCheck: false,
                  }}
                  className="min-w-0 flex-1 text-xs sm:text-sm"
                />
                {search ? (
                  <IconButton
                    size="small"
                    aria-label="Limpar busca"
                    onClick={() => {
                      setSearch("");
                      inputBuscaRef.current?.focus();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    sx={{ p: 0.25 }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                ) : (
                  <kbd className="hidden shrink-0 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
                    Ctrl K
                  </kbd>
                )}
              </div>

              {buscaAberta && (
                <ClickAwayListener onClickAway={() => setBuscaAberta(false)}>
                  <Paper
                    elevation={0}
                    className="absolute inset-x-0 top-[calc(100%+0.4rem)] z-50 max-h-96 overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-[var(--shadow-pop)]"
                  >
                    {buscando && itensOmnibox.length === 0 ? (
                      <Typography variant="caption" component="p" className="px-3 py-3 text-xs text-muted-foreground">
                        Buscando…
                      </Typography>
                    ) : itensOmnibox.length === 0 ? (
                      <Typography variant="caption" component="p" className="px-3 py-3 text-xs text-muted-foreground">
                        Nenhum resultado para &ldquo;{search.trim()}&rdquo;
                      </Typography>
                    ) : (
                      (() => {
                        let ultimoGrupo = "";
                        return itensOmnibox.map((item, idx) => {
                          const mostrarGrupo = item.grupo !== ultimoGrupo;
                          ultimoGrupo = item.grupo;
                          const ativo = idx === indiceAtivo;
                          return (
                            <div key={item.id}>
                              {mostrarGrupo && (
                                <Typography
                                  variant="overline"
                                  component="div"
                                  className="px-2.5 pt-2 pb-1 text-[10px] font-bold tracking-wider text-muted-foreground"
                                >
                                  {item.grupo}
                                </Typography>
                              )}
                              <ListItemButton
                                selected={ativo}
                                onMouseEnter={() => setIndiceAtivo(idx)}
                                onClick={() => executarItemOmnibox(item)}
                                className={`flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-xs transition ${
                                  ativo ? "bg-secondary text-foreground" : "text-foreground"
                                }`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-medium">{item.titulo}</span>
                                  {item.subtitulo && (
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                      {item.subtitulo}
                                    </span>
                                  )}
                                </span>
                                {item.direita && (
                                  <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                                    {item.direita}
                                  </span>
                                )}
                              </ListItemButton>
                            </div>
                          );
                        });
                      })()
                    )}

                    {search.trim().length >= 2 && perfil === "admin" && (
                      <MuiLink
                        component={Link}
                        to="/admin/busca"
                        search={{ q: search.trim() } as never}
                        underline="hover"
                        onClick={() => setBuscaAberta(false)}
                        className="mt-1 block border-t border-border/60 px-2.5 pt-2 pb-1 text-center text-xs font-medium text-primary"
                      >
                        Pesquisa avançada no catálogo →
                      </MuiLink>
                    )}
                  </Paper>
                </ClickAwayListener>
              )}
            </div>

            {/* Direita: Status SSE + Tema + Notificações + Conta */}
            <div className="flex shrink-0 items-center gap-2">
              <Tooltip
                title={
                  sseOnline ? "Conectado em tempo real (SSE)" : "Reconectando stream de eventos…"
                }
              >
                <Chip
                  size="small"
                  variant="outlined"
                  icon={
                    <span
                      className={`ml-1 h-1.5 w-1.5 rounded-full ${
                        sseOnline ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                    />
                  }
                  label={sseOnline ? "Online" : "Offline"}
                  className="hidden rounded-xl border-border/70 bg-secondary/30 text-[11px] font-medium text-muted-foreground md:inline-flex"
                />
              </Tooltip>

              <Tooltip title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}>
                <IconButton
                  aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
                  onClick={toggleTheme}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-border/70 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </IconButton>
              </Tooltip>

              <Sino />

              <div className="relative">
                <ButtonBase
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-label={`Conta de ${perfil ?? "usuário"}`}
                  className="flex h-9 items-center gap-2 rounded-xl border border-border/70 bg-secondary/40 pl-1.5 pr-2.5 transition hover:bg-secondary"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
                    {(user?.nome?.[0] ?? perfil?.[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="hidden max-w-28 truncate text-xs font-semibold sm:block">
                    {user?.nome ?? `#${user?.id ?? "?"}`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </ButtonBase>
                {userMenuOpen && (
                  <Panel onClose={() => setUserMenuOpen(false)}>
                    <div className="border-b border-border/60 px-3 py-2">
                      <div className="truncate text-xs font-bold text-foreground">
                        {user?.nome ?? `Usuário #${user?.id ?? "?"}`}
                      </div>
                      <div className="truncate text-[11px] capitalize text-muted-foreground">
                        {user?.email ?? perfil ?? "—"}
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <MenuItem
                        component={Link}
                        to="/conta"
                        onClick={() => setUserMenuOpen(false)}
                        className="gap-2 rounded-xl px-3 py-2 text-xs font-medium"
                      >
                        Minha conta
                      </MenuItem>
                      <MenuItem
                        onClick={() => void sair()}
                        className="gap-2 rounded-xl px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sair
                      </MenuItem>
                    </div>
                  </Panel>
                )}
              </div>
            </div>
          </Box>

          {children}
        </Box>
      </div>
    </div>
  );
}
