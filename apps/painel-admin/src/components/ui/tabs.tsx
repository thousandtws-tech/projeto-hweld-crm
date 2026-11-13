import * as React from "react";
import MuiTab from "@mui/material/Tab";
import MuiTabs from "@mui/material/Tabs";
import Box from "@mui/material/Box";

interface TabsCtxValue {
  value: string;
  set: (v: string) => void;
}
const TabsCtx = React.createContext<TabsCtxValue>({ value: "", set: () => {} });

/**
 * API compatível com os componentes antigos (value/defaultValue/onValueChange,
 * TabsTrigger value, TabsContent value) sobre Material-UI.
 */
function Tabs({
  value,
  defaultValue,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const cur = value ?? inner;
  const set = React.useCallback(
    (v: string) => {
      setInner(v);
      onValueChange?.(v);
    },
    [onValueChange],
  );
  return (
    <TabsCtx.Provider value={{ value: cur, set }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(TabsCtx);
  return (
    <MuiTabs
      className={className}
      value={ctx.value || false}
      onChange={(_, v) => ctx.set(v as string)}
      variant="scrollable"
      scrollButtons="auto"
      sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0.5 } }}
    >
      {children}
    </MuiTabs>
  );
}

function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <MuiTab className={className} value={value} label={children} disableRipple />;
}

function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return (
    <Box className={className} sx={{ mt: 1 }}>
      {children}
    </Box>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
