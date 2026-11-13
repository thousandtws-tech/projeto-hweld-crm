import { expect, test } from "@playwright/test";

import { seedCenario, type Cenario } from "../helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";

/**
 * Smoke UI do portal B2B (Angular, :4210 em dev).
 * A jornada completa de compra já é coberta no nível de API
 * (jornada-pedido-pagamento.spec.ts) — aqui validamos que a UI
 * renderiza, autentica e navega contra os serviços reais.
 */
test.describe("portal B2B — smoke", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

  let cenario: Cenario;

  test.beforeAll(async () => {
    test.skip(!(await sonda.web()), `app web fora do ar em ${CFG.webUrl} — suba com: cd apps/web && npm start`);
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    cenario = await seedCenario();
  });

  test("tela de login renderiza", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#senha")).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
  });

  test("login real do contato navega para a vitrine", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(cenario.portal.email);
    await page.locator("#senha").fill(cenario.portal.senha);

    const loginResp = page.waitForResponse(
      (r) => r.url().includes("/auth/portal/login") && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /entrar/i }).click();

    const resp = await loginResp;
    expect(resp.status(), "POST /auth/portal/login").toBe(200);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  });

  test("área da conta exige autenticação", async ({ page }) => {
    await page.goto("/conta/pedidos");
    // Sem sessão o guard redireciona para /login (ou renderiza o form).
    await expect(page.locator("#email")).toBeVisible({ timeout: 15_000 });
  });
});
