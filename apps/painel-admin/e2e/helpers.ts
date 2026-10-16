import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "";
export const ADMIN_SENHA = process.env.E2E_ADMIN_SENHA ?? process.env.ADMIN_SENHA ?? "";
export const TEM_CREDENCIAL = Boolean(ADMIN_EMAIL && ADMIN_SENHA);

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
export const SESSAO_PATH = resolve(E2E_DIR, ".auth/session.json");

/** Persiste o sessionStorage (onde o app guarda os tokens JWT). */
export async function salvarSessao(page: Page) {
  const sess = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      out[k] = sessionStorage.getItem(k)!;
    }
    return out;
  });
  mkdirSync(dirname(SESSAO_PATH), { recursive: true });
  writeFileSync(SESSAO_PATH, JSON.stringify(sess));
}

/**
 * Semeia a sessão salva no setup — evita um POST /auth/staff/login por teste
 * (o backend responde 429 com logins em sequência: rate limit real).
 */
export async function seedSessao(page: Page) {
  if (!existsSync(SESSAO_PATH)) {
    throw new Error("Sessão E2E não gerada — o projeto 'setup' rodou antes?");
  }
  const sess = JSON.parse(readFileSync(SESSAO_PATH, "utf8")) as Record<string, string>;
  await page.addInitScript((entries) => {
    for (const [k, v] of entries) sessionStorage.setItem(k, v);
  }, Object.entries(sess));
}

/** Login real contra o backend — sem mocks. */
export async function login(page: Page) {
  await page.goto("/login");
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    await page.getByPlaceholder("voce@hweld.com").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("••••••••").fill(ADMIN_SENHA);

    // Espera a resposta real do backend — se o POST falhar, o assert de
    // status aponta a causa em vez de um timeout opaco de navegação
    const loginResp = page.waitForResponse(
      (r) => r.url().includes("/auth/") && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Entrar" }).click();
    const resp = await loginResp;
    expect(resp.status(), `POST ${new URL(resp.url()).pathname}`).toBe(200);

    try {
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
      return;
    } catch (err) {
      if (tentativa === 1) throw err;
      await page.goto("/login"); // re-tenta o submit uma vez (corrida de navegação)
    }
  }
}

/**
 * Ruído esperado em dev que não é defeito: SSE do motor offline,
 * favicon ausente e dica do React DevTools.
 */
const RUIDO_DEV = [
  /events/i,
  /4100/,
  /favicon/i,
  /react devtools/i,
  /eventsource/i,
  /failed to load resource.*events/i,
];

/** Registra pageerrors e console.error úteis para assert no fim do teste. */
export function rastrearErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const texto = msg.text();
    if (RUIDO_DEV.some((re) => re.test(texto))) return;
    erros.push(`console.error: ${texto}`);
  });
  return erros;
}

/** PNG 1×1 válido (magic bytes reais — o backend valida a assinatura). */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export function semScrollHorizontal(): boolean {
  const el = document.documentElement;
  return el.scrollWidth <= el.clientWidth + 1;
}
