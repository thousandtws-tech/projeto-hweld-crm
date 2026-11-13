import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import type { AlertColor } from "@mui/material/Alert";

type ToastOpts = { description?: string; duration?: number };
type ToastItem = { id: number; msg: string; desc?: string; sev: AlertColor; duration: number };

let seq = 0;
let push: ((t: ToastItem) => void) | null = null;

function emit(sev: AlertColor, msg: string, opts?: ToastOpts) {
  push?.({ id: ++seq, msg, desc: opts?.description, sev, duration: opts?.duration ?? 4000 });
}

/** API compatível com `sonner` — troque o import "sonner" por este módulo. */
export const toast = {
  success: (msg: string, opts?: ToastOpts) => emit("success", msg, opts),
  error: (msg: string, opts?: ToastOpts) => emit("error", msg, opts),
  info: (msg: string, opts?: ToastOpts) => emit("info", msg, opts),
  warning: (msg: string, opts?: ToastOpts) => emit("warning", msg, opts),
  message: (msg: string, opts?: ToastOpts) => emit("info", msg, opts),
  loading: (msg: string, opts?: ToastOpts) => emit("info", msg, opts),
};

/** Host de toasts sobre MUI Snackbar — fila simples, um toast por vez. */
export function Toaster(_props?: { position?: string; richColors?: boolean }) {
  const [fila, setFila] = useState<ToastItem[]>([]);

  useEffect(() => {
    push = (t) => setFila((f) => [...f, t]);
    return () => {
      push = null;
    };
  }, []);

  const atual = fila[0];
  return (
    <Snackbar
      open={Boolean(atual)}
      autoHideDuration={atual?.duration ?? 4000}
      onClose={() => setFila((f) => f.slice(1))}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
    >
      {atual ? (
        <Alert
          variant="filled"
          severity={atual.sev}
          onClose={() => setFila((f) => f.slice(1))}
          sx={{ borderRadius: 2, alignItems: "center" }}
        >
          {atual.msg}
          {atual.desc ? ` — ${atual.desc}` : ""}
        </Alert>
      ) : (
        <span />
      )}
    </Snackbar>
  );
}
