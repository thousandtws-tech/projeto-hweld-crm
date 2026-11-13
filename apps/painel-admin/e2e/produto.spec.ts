import { expect, test } from "@playwright/test";

import { PNG_1PX, rastrearErros, seedSessao, TEM_CREDENCIAL } from "./helpers";

test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");

test.describe("produto + galeria de mídia (regressão do bug das fotos)", () => {
  test.beforeEach(async ({ page }) => {
    await seedSessao(page);
  });

  test("cria produto, envia foto real ao backend e a foto persiste no reload", async ({ page }) => {
    const erros = rastrearErros(page);
    const sku = `E2E-${Date.now()}`;

    // ── Criação ──────────────────────────────────────────────────────────
    await page.goto("/catalogo/produtos/novo");
    await page.getByLabel(/SKU/).fill(sku);
    await page.getByLabel(/Nome do produto/).fill(`Produto E2E ${sku}`);

    // Categoria: primeira opção real do select
    const selectCategoria = page.locator("select").first();
    const opcoes = selectCategoria.locator("option");
    await expect(async () => {
      expect(await opcoes.count()).toBeGreaterThan(1);
    }).toPass({ timeout: 15_000 });
    await selectCategoria.selectOption({ index: 1 });

    await page.getByLabel(/Preço de venda/).fill("99.90");

    // ── Upload real de imagem (POST /api/v1/midia/upload) ────────────────
    const uploadResp = page.waitForResponse(
      (r) => r.url().includes("/midia/upload") && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles({ name: "capa-e2e.png", mimeType: "image/png", buffer: PNG_1PX });

    const resp = await uploadResp;
    // O endpoint novo existe e respondeu — sem fallback silencioso
    expect([200, 201]).toContain(resp.status());

    await expect(page.getByText("1 foto(s)")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("img[alt]").first()).toBeVisible();

    // ── Salvar e reabrir: foto deve persistir ────────────────────────────
    await page.getByRole("button", { name: /Salvar produto|Criar produto/ }).click();
    // O fluxo volta para a listagem — abrimos o produto criado a partir dela
    await expect(page).toHaveURL(/\/catalogo\/produtos$/, { timeout: 20_000 });
    await page.getByRole("link", { name: sku }).click();
    // Detalhe é mascarado por public_id (UUID) — não id numérico
    await expect(page).toHaveURL(/\/catalogo\/produtos\/[\w-]+/, { timeout: 15_000 });
    await expect(page.getByText("1 foto(s)")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText("1 foto(s)")).toBeVisible({ timeout: 15_000 });
    const img = page.locator("img[alt]").first();
    await expect(img).toBeVisible();
    // URL real do servidor (não data: do fallback)
    const src = await img.getAttribute("src");
    expect(src).toBeTruthy();
    expect(src).not.toMatch(/^data:/);

    expect(erros).toEqual([]);
  });

  test("falha no upload de mídia é visível (regressão do .catch silencioso)", async ({ page }) => {
    // Simula backend indisponível: a falha NÃO pode sumir sem feedback
    await page.route("**/api/v1/midia/upload", (route) => route.abort());

    await page.goto("/catalogo/produtos/novo");
    await page
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: PNG_1PX });

    // Feedback visível de erro (toast sonner ou texto de alerta)
    await expect(page.getByText(/falha|erro|não foi possível/i).first()).toBeVisible({
      timeout: 15_000,
    });
    // E a foto fantasma não pode ter sido adicionada como se tivesse salvo
    await expect(page.getByText("1 foto(s)")).not.toBeVisible();
  });
});
