import * as React from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface SheetCtxValue {
  setOpen: (open: boolean) => void;
}
const SheetCtx = React.createContext<SheetCtxValue>({ setOpen: () => {} });

type Side = "top" | "right" | "bottom" | "left";

function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <SheetCtx.Provider value={{ setOpen: (o) => onOpenChange?.(o) }}>
      <SheetRenderCtx.Provider value={open ?? false}>{children}</SheetRenderCtx.Provider>
    </SheetCtx.Provider>
  );
}

const SheetRenderCtx = React.createContext(false);

function SheetContent({
  side = "right",
  children,
  className,
  style,
}: {
  side?: Side;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const open = React.useContext(SheetRenderCtx);
  const ctx = React.useContext(SheetCtx);
  return (
    <Drawer
      anchor={side}
      open={open}
      onClose={() => ctx.setOpen(false)}
      slotProps={{
        paper: {
          className,
          sx: { p: 0, width: { xs: "100%", sm: 480 } },
          style,
        },
      }}
    >
      {children}
    </Drawer>
  );
}

function SheetHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Box className={className}>{children}</Box>;
}

function SheetFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Box className={className}>{children}</Box>;
}

function SheetTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Typography variant="h6" component="h2" className={className}>
      {children}
    </Typography>
  );
}

function SheetDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Typography variant="body2" color="text.secondary" className={className}>
      {children}
    </Typography>
  );
}

function SheetTrigger({ children }: { children: React.ReactElement; asChild?: boolean }) {
  const ctx = React.useContext(SheetCtx);
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      (children.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e);
      ctx.setOpen(true);
    },
  } as Partial<unknown>);
}

function SheetClose({ children }: { children: React.ReactElement; asChild?: boolean }) {
  const ctx = React.useContext(SheetCtx);
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      (children.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e);
      ctx.setOpen(false);
    },
  } as Partial<unknown>);
}

const SheetPortal = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const SheetOverlay = () => null;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
