import { expect, test } from "@playwright/test";

import { seedSessao, semScrollHorizontal, TEM_CREDENCIAL } from "./helpers";

test.describe("responsividade e acessibilidade básica", () => {
  test("login não estoura horizontalmente no mobile", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    expect(await page.evaluate(semScrollHorizontal)).toBe(true);
  });

  test("login: ordem de foco por Tab chega ao botão Entrar", async ({ page }) => {
    await page.goto("/login");
    // foco parte do primeiro campo e percorre a ordem natural
    await page.locator('input[type="email"]').focus();
    let achou = false;
    for (let i = 0; i < 8; i++) {
      const ativo = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          tag: el?.tagName,
          texto: el?.textContent?.trim() ?? "",
          type: el?.getAttribute("type"),
        };
      });
      if (ativo.tag === "BUTTON" && /Entrar/.test(ativo.texto)) {
        achou = true;
        break;
      }
      await page.keyboard.press("Tab");
    }
    expect(achou).toBe(true);
  });

  test("todas as imagens renderizadas têm alt", async ({ page }) => {
    test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");
    await seedSessao(page);
    await page.goto("/dashboard");
    await expect(page.locator("h1").first()).toBeVisible();
    const semAlt = await page.locator("img:not([alt])").count();
    expect(semAlt).toBe(0);
  });

  test("dashboard no mobile: sem scroll horizontal", async ({ page }) => {
    test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");
    await seedSessao(page);
    await page.goto("/dashboard");
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.evaluate(semScrollHorizontal)).toBe(true);
  });
});
