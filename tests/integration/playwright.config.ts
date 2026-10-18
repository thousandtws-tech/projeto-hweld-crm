import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

/**
 * Suíte de INTEGRAÇÃO — fronteiras e contratos entre serviços.
 * Reusa as credenciais do e2e (`tests/e2e/.env.e2e`) e os helpers via
 * `../e2e/helpers/*` — mesma stack, escopo diferente.
 */
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const configDir = dirname(fileURLToPath(import.meta.url));

loadEnvFile(resolve(configDir, "../e2e/.env.e2e"));
loadEnvFile(
  process.env.HWELD_CORE_ENV ?? resolve(configDir, "../../services/hweld-core-api/.env"),
);

export default defineConfig({
  testDir: "./",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1, // rate limit por IP no backend — paralelo poluiria os buckets
  retries: 0,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { ignoreHTTPSErrors: false },
  projects: [{ name: "integration" }],
});
