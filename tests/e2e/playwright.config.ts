import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

/**
 * Credenciais/endereços de teste sem segredo hardcoded:
 * 1) `.env.e2e` local (gitignored — ver `.env.e2e.example`);
 * 2) fallback: `.env` do core-api (ADMIN_EMAIL/ADMIN_SENHA/MOTOR_INGEST_TOKEN seed);
 * 3) variáveis já exportadas vencem os arquivos.
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

loadEnvFile(resolve(configDir, ".env.e2e"));
loadEnvFile(
  process.env.HWELD_CORE_ENV ?? resolve(configDir, "../../services/hweld-core-api/.env"),
);

export const CORE_API = process.env.E2E_CORE_API ?? "http://localhost:8080";
export const OPS_API = process.env.E2E_OPS_API ?? "http://localhost:8090";
export const REALTIME = process.env.E2E_REALTIME ?? "http://localhost:4100";
export const WEB_URL = process.env.E2E_WEB_URL ?? "http://localhost:4210";
export const ADMIN_URL = process.env.E2E_ADMIN_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Serial: login staff/portal é rate-limited (429) e os specs compartilham
  // o mesmo banco de dados — paralelismo geraria flakes de isolamento.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
  },
  projects: [
    {
      name: "api",
      testDir: "./api",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "portal-ui",
      testDir: "./ui",
      testMatch: /portal-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: WEB_URL },
    },
    {
      name: "admin-ui",
      testDir: "./ui",
      testMatch: /admin-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN_URL },
    },
  ],
});
