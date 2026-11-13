import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import jetVitePlugin from "@jet-admin/jet-vite-plugin";
import tsConfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    jetVitePlugin(),
    tailwindcss(),
    tsConfigPaths(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  server: {
    allowedHosts: true,
    proxy: {
      // SSE do motor realtime (Phoenix :4100) — mesmo origem em dev,
      // evita CORS. Produção usa VITE_HW_REALTIME_URL.
      "/events": { target: "http://localhost:4100", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Dependências pesadas fora do entry chunk — recharts/kanban/jet só
        // são buscados quando a rota que os usa carrega (code-split já vem
        // do router; aqui evita que uma página pesada contamine o vendor).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts")) return "charts";
          if (id.includes("react-kanban-kit")) return "kanban";
          if (id.includes("@jet-admin")) return "jet";
          return undefined;
        },
      },
    },
  },
});
