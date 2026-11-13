import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

/**
 * Suíte de PERFORMANCE — carga moderada contra produção.
 * Reusa credenciais do e2e (`tests/e2e/.env.e2e`) e helpers via
 * `../e2e/helpers/*`. Sem browser — só medição de latência/throughput.
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
  workers: 1, // cenários em série — paralelo contaminaria as medições
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: { ignoreHTTPSErrors: false },
  projects: [{ name: "performance" }],
});
