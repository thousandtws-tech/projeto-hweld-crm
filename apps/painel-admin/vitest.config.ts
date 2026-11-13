import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest só roda as suítes unitárias em `src/**` — os testes E2E em `e2e/`
 * pertencem ao Playwright (`npm run test:e2e`).
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
