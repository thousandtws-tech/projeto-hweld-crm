import { expect, test as setup } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_SENHA, salvarSessao, TEM_CREDENCIAL } from "./helpers";

setup.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");

/**
 * Um único login real por execução da suíte. A sessão (sessionStorage com
 * access/refresh token) é persistida e semeada nos demais testes — o backend
 * rate-limita logins em sequência (429), então logar por teste falharia.
 */
setup("login real no backend e salva a sessão", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("voce@hweld.com").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("••••••••").fill(ADMIN_SENHA);

  const loginResp = page.waitForResponse(
    (r) => r.url().includes("/auth/staff/login") && r.request().method() === "POST",
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Entrar" }).click();
  const resp = await loginResp;
  expect(resp.status(), "login do setup E2E").toBe(200);

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await salvarSessao(page);
});
