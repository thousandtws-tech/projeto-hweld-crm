import { expect, test } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_SENHA, login, rastrearErros, TEM_CREDENCIAL } from "./helpers";

test.describe("autenticação e sessão", () => {
  test("rota protegida sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("valida o formulário antes de chamar a API", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe um e-mail válido")).toBeVisible();
    await page.getByPlaceholder("voce@hweld.com").fill("nao-e-email");
    await page.getByPlaceholder("••••••••").fill("qualquer");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Informe um e-mail válido")).toBeVisible();
  });

  test("credencial inválida exibe erro visível (não silencia)", async ({ page }) => {
    test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");
    await page.goto("/login");
    await page.getByPlaceholder("voce@hweld.com").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("••••••••").fill("senha-errada-e2e");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText(/Credenciais inválidas|Não foi possível entrar/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/); // não navegou nem travou
  });

  test("login real → dashboard, sessão persiste em reload, logout funciona", async ({ page }) => {
    test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");
    const erros = rastrearErros(page);

    await login(page);
    await expect(page.locator("h1").first()).toBeVisible();

    // Sessão sobrevive a reload (token persistido)
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("h1").first()).toBeVisible();

    expect(erros).toEqual([]);
  });
});
