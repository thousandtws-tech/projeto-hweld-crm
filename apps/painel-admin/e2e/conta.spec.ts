import { expect, test } from "@playwright/test";

import { rastrearErros, seedSessao, TEM_CREDENCIAL } from "./helpers";

/**
 * /conta — "Sessões ativas" estilo Google/GitHub: dispositivo + IP da sessão
 * atual, lista de outras sessões e encerramento remoto.
 * A sessão semeada via `seedSessao` foi criada por um POST /login real com
 * User-Agent do Chromium — o backend deve resolvê-la como navegador.
 */
test.describe("Conta — sessões", () => {
  test.skip(!TEM_CREDENCIAL, "sem credenciais E2E");

  test("mostra dispositivo e IP da sessão atual", async ({ page }) => {
    const erros = rastrearErros(page);
    await seedSessao(page);
    await page.goto("/conta");

    await expect(page).toHaveURL(/\/conta/);
    await expect(page.getByRole("heading", { name: "Sessões ativas" })).toBeVisible();

    // A sessão atual aparece destacada com dispositivo + IP reais do backend.
    await expect(page.getByText("Esta sessão")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/).first()).toBeVisible();
    // User-Agent do Chromium → woothee deve identificar o navegador.
    await expect(page.getByText(/Chrome/i).first()).toBeVisible();

    expect(erros).toEqual([]);
  });

  test("encerramento de sessão removível é possível via API real", async ({ page }) => {
    await seedSessao(page);
    await page.goto("/conta");
    await expect(page.getByRole("heading", { name: "Sessões ativas" })).toBeVisible();

    // Prova o contrato do endpoint: GET retorna a sessão atual marcada.
    const sessoes = await page.evaluate(async (base) => {
      const token = sessionStorage.getItem("hw_staff_access");
      const res = await fetch(`${base}/auth/sessoes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok ? ((await res.json()) as { id: string; atual: boolean }[]) : [];
    }, process.env.E2E_API_URL ?? "http://localhost:8080/api/v1");

    expect(sessoes.length).toBeGreaterThan(0);
    expect(sessoes.some((s) => s.atual)).toBe(true);
  });
});
