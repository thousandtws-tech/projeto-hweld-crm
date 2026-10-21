import { useCallback, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "hweld-theme";

function temaInicial(): Theme {
  try {
    const stored = (localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem("finpay-theme")) as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* storage indisponível */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function useTheme() {
  // Init síncrono: o script inline no index.html já aplicou a classe antes
  // do primeiro paint — sem flash de tema nem efeito pós-mount.
  const [theme, setTheme] = useState<Theme>(temaInicial);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage indisponível */
      }
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
