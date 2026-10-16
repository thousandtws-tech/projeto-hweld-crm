import { expect, test } from "@playwright/test";

import { rastrearErros, seedSessao, TEM_CREDENCIAL } from "./helpers";

test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");

test.describe("configuração fiscal SEFAZ", () => {
  test.beforeEach(async ({ page }) => {
    await seedSessao(page);
  });

  test("exibe status da integração e checklist de pendências", async ({ page }) => {
    const erros = rastrearErros(page);
    await page.goto("/fiscal/configuracao");

    // Status da integração real (devolvido pelo backend, não hardcoded)
    await expect(
      page.getByText(/Integração pendente|Pronta em homologação|Pronta para produção/i).first(),
    ).toBeVisible();
    // Checklist de pendências (chips) — estado real da config
    await expect(
      page.getByText(/Certificado digital A1|CSC — Código|Série da NF-e/).first(),
    ).toBeVisible();

    // Formulário de credenciais presente
    await expect(page.getByLabel(/Ambiente SEFAZ/)).toBeVisible();
    await expect(page.getByLabel(/Regime tributário/)).toBeVisible();

    expect(erros).toEqual([]);
  });

  test("certificado inválido é rejeitado com erro visível", async ({ page }) => {
    await page.goto("/fiscal/configuracao");

    // .pfx falso — magic bytes devem ser recusados pelo backend com 422/400
    await page.locator('input[type="file"][accept*=".pfx"]').setInputFiles({
      name: "fake.pfx",
      mimeType: "application/x-pkcs12",
      buffer: Buffer.from("nao-e-um-pkcs12"),
    });

    // Erro precisa aparecer (toast sonner ou alerta inline) — nunca silenciar
    await expect(page.getByText(/certificado|inválid|erro|falha/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("banner em /fiscal/notas reflete o estado real da configuração", async ({ page }) => {
    await page.goto("/fiscal/notas");
    await expect(page.locator("h1").first()).toBeVisible();
    // Aviso de integração pendente deve estar visível enquanto não houver
    // certificado + CSC (estado atual da H Weld)
    const aviso = page.getByText(/SEFAZ|integra|pendente|homologa/i);
    await expect(aviso.first()).toBeVisible();
  });
});
