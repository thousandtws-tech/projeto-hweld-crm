import { expect, test } from "@playwright/test";

import { rastrearErros, seedSessao, TEM_CREDENCIAL } from "./helpers";

test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");

test.describe("onboarding de empresa (CNPJ módulo-11)", () => {
  test.beforeEach(async ({ page }) => {
    await seedSessao(page);
  });

  test("CNPJ com DV inválido bloqueia com mensagem visível", async ({ page }) => {
    await page.goto("/crm/empresas/nova");

    const campo = page.getByPlaceholder("00.000.000/0000-00");
    await campo.fill("11222333000100"); // dígitos válidos de tamanho, DV errado

    // Validação instantânea e visível — sem depender de submit/422 do backend
    await expect(page.getByText("Dígitos verificadores do CNPJ inválidos.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Consultar/ })).toBeDisabled();
  });

  test("máscara formata o CNPJ enquanto digita", async ({ page }) => {
    await page.goto("/crm/empresas/nova");
    const campo = page.getByPlaceholder("00.000.000/0000-00");
    await campo.fill("07689002000189");
    await expect(campo).toHaveValue("07.689.002/0001-89");
  });

  test("CNPJ válido consulta a BrasilAPI direto do navegador e hidrata o form", async ({
    page,
  }) => {
    await page.goto("/crm/empresas/nova");

    // Prova que a chamada sai direto para a BrasilAPI — sem passar pelo backend
    const reqBrasil = page.waitForRequest(
      (r) => r.url().includes("brasilapi.com.br/api/cnpj/v1/47960950000121"),
      { timeout: 20_000 },
    );
    await page.getByPlaceholder("00.000.000/0000-00").fill("47960950000121");
    await reqBrasil;

    // Razão social e nome fantasia hidratados pela Receita Federal
    await expect(page.getByLabel(/Razão social/)).not.toHaveValue("", { timeout: 20_000 });
    await expect(page.getByLabel(/Nome fantasia/)).toHaveValue("MAGAZINE LUIZA");
  });

  test("URL de detalhe é mascarada — id numérico redireciona para public_id (UUID)", async ({
    page,
  }) => {
    // Entra pela URL legada com id sequencial — a página deve reescrever a URL
    // para o public_id, sem expor o número na barra de endereço.
    await page.goto("/crm/empresas/3");
    await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/crm\/empresas\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  });
});
