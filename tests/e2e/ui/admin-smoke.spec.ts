import { expect, test } from "@playwright/test";

import { staffToken } from "../helpers/api";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";

/**
 * Smoke UI do painel administrativo (React/Vite, :5173 em dev).
 * O painel tem suíte própria detalhada em apps/painel-admin/e2e —
 * aqui só provamos que login e shell funcionam na stack integrada.
 */
test.describe("painel-admin — smoke", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

  test.beforeAll(async () => {
    test.skip(!(await sonda.admin()), `painel-admin fora do ar em ${CFG.adminUrl} — suba com: cd apps/painel-admin && npm run dev`);
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    // Aquece o cache de token + valida credencial antes de gastar browser.
    await staffToken();
  });

  test("login staff abre o dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("voce@hweld.com").fill(CFG.adminEmail);
    await page.getByPlaceholder("••••••••").fill(CFG.adminSenha);

    const loginResp = page.waitForResponse(
      (r) => r.url().includes("/auth/staff/login") && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Entrar" }).click();

    const resp = await loginResp;
    expect(resp.status(), "POST /auth/staff/login").toBe(200);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("rota protegida redireciona para login sem sessão", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
