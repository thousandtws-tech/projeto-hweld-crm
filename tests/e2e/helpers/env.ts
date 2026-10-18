import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Configuração resolvida da suíte. Precedência:
 *   variável de ambiente > .env.e2e > .env do core-api > default dev.
 * (O playwright.config.ts já carrega os arquivos em process.env — aqui só lemos.)
 */

const DIR = dirname(fileURLToPath(import.meta.url));

export const CFG = {
  coreApi: process.env.E2E_CORE_API ?? "http://localhost:8080",
  opsApi: process.env.E2E_OPS_API ?? "http://localhost:8090",
  realtime: process.env.E2E_REALTIME ?? "http://localhost:4100",
  webUrl: process.env.E2E_WEB_URL ?? "http://localhost:4210",
  adminUrl: process.env.E2E_ADMIN_URL ?? "http://localhost:5173",

  adminEmail: process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "",
  adminSenha: process.env.E2E_ADMIN_SENHA ?? process.env.ADMIN_SENHA ?? "",

  webhookSecret: process.env.E2E_WEBHOOK_SECRET ?? "dev-stub-webhook-secret",
  /** true quando o segredo veio de env explícito — sem ele, webhooks em prod falhariam 401 por config, não por defeito. */
  temWebhookSecret: Boolean(process.env.E2E_WEBHOOK_SECRET),
  motorToken: process.env.E2E_MOTOR_INGEST_TOKEN ?? process.env.MOTOR_INGEST_TOKEN ?? "",

  skipRealtime: process.env.E2E_SKIP_REALTIME === "1",
  skipBusca: process.env.E2E_SKIP_BUSCA === "1",
} as const;

/** Cache de disponibilidade por URL — um probe por serviço por worker. */
const vivos = new Map<string, boolean>();

/**
 * Probe barato de disponibilidade (3s). Sem throw — specs decidem skip/fail.
 */
export async function servicoVivo(baseUrl: string, caminho = "/health"): Promise<boolean> {
  const chave = `${baseUrl}${caminho}`;
  const cache = vivos.get(chave);
  if (cache !== undefined) return cache;

  let ok = false;
  try {
    const resp = await fetch(chave, {
      signal: AbortSignal.timeout(3_000),
      redirect: "manual",
    });
    // Qualquer resposta HTTP conta como "vivo" — a spec valida o conteúdo.
    ok = resp.status > 0;
  } catch {
    ok = false;
  }
  vivos.set(chave, ok);
  return ok;
}

/** Healthchecks dos três serviços — usado pelo 00-saude e pelos skips dos specs. */
export const sonda = {
  core: () => servicoVivo(CFG.coreApi, "/health"),
  ops: () => servicoVivo(CFG.opsApi, "/actuator/health"),
  realtime: () => servicoVivo(CFG.realtime, "/health"),
  web: () => servicoVivo(CFG.webUrl, "/"),
  admin: () => servicoVivo(CFG.adminUrl, "/"),
};

export const TEM_ADMIN = Boolean(CFG.adminEmail && CFG.adminSenha);
