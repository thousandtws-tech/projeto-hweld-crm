import * as React from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { ChevronRight } from "lucide-react";

interface MenuCtxValue {
  anchor: HTMLElement | null;
  openMenu: (el: HTMLElement) => void;
  close: () => void;
}
const MenuCtx = React.createContext<MenuCtxValue>({ anchor: null, openMenu: () => {}, close: () => {} });
const SubCtx = React.createContext<MenuCtxValue>({ anchor: null, openMenu: () => {}, close: () => {} });

/** Dropdown sobre MUI Menu — mesma API declarativa dos componentes antigos. */
function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const ctx = React.useMemo(
    () => ({ anchor, openMenu: setAnchor, close: () => setAnchor(null) }),
    [anchor],
  );
  return <MenuCtx.Provider value={ctx}>{children}</MenuCtx.Provider>;
}

function DropdownMenuTrigger({
  children,
}: {
  children: React.ReactElement;
  asChild?: boolean;
}) {
  const ctx = React.useContext(MenuCtx);
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      (children.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e);
      ctx.openMenu(e.currentTarget as HTMLElement);
    },
  } as Partial<unknown>);
}

function DropdownMenuContent({
  children,
  align = "start",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const ctx = React.useContext(MenuCtx);
  const h = align === "end" ? "right" : align === "center" ? "center" : "left";
  return (
    <Menu
      className={className}
      open={Boolean(ctx.anchor)}
      anchorEl={ctx.anchor}
      onClose={ctx.close}
      anchorOrigin={{ vertical: "bottom", horizontal: h }}
      transformOrigin={{ vertical: "top", horizontal: h }}
      slotProps={{ paper: { sx: { borderRadius: 1, minWidth: 176 } } }}
    >
      {children}
    </Menu>
  );
}

function DropdownMenuItem({
  children,
  onSelect,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onSelect?: (e?: unknown) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ctx = React.useContext(MenuCtx);
  return (
    <MenuItem
      className={className}
      disabled={disabled}
      onClick={() => {
        ctx.close();
        onSelect?.();
      }}
    >
      {children}
    </MenuItem>
  );
}

function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const ctx = React.useMemo(
    () => ({ anchor, openMenu: setAnchor, close: () => setAnchor(null) }),
    [anchor],
  );
  return <SubCtx.Provider value={ctx}>{children}</SubCtx.Provider>;
}

function DropdownMenuSubTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const sub = React.useContext(SubCtx);
  return (
    <MenuItem className={className} onClick={(e) => sub.openMenu(e.currentTarget as HTMLElement)}>
      <ListItemText>{children}</ListItemText>
      <ChevronRight size={14} />
    </MenuItem>
  );
}

function DropdownMenuSubContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const sub = React.useContext(SubCtx);
  return (
    <Menu
      className={className}
      open={Boolean(sub.anchor)}
      anchorEl={sub.anchor}
      onClose={sub.close}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{ paper: { sx: { borderRadius: 1, minWidth: 160 } } }}
    >
      {children}
    </Menu>
  );
}

function DropdownMenuSeparator() {
  return <Divider sx={{ my: 0.5 }} />;
}

function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.75, display: "block" }}>
      {children}
    </Typography>
  );
}

function DropdownMenuShortcut({ children }: { children: React.ReactNode }) {
  return (
    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
      {children}
    </Typography>
  );
}

// Aliases de compatibilidade — mesmo comportamento de item.
const DropdownMenuCheckboxItem = DropdownMenuItem;
const DropdownMenuRadioItem = DropdownMenuItem;
const DropdownMenuGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuRadioGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
