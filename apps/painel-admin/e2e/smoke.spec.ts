import { expect, test } from "@playwright/test";

import { rastrearErros, seedSessao, semScrollHorizontal, TEM_CREDENCIAL } from "./helpers";

test.skip(!TEM_CREDENCIAL, "sem credenciais E2E configuradas");

/**
 * Varredura dos módulos contratados na proposta: cada rota deve abrir com
 * cabeçalho de página, sem exceções não tratadas e sem scroll horizontal.
 */
const ROTAS: { path: string; h1: RegExp }[] = [
  { path: "/dashboard", h1: /./ },
  { path: "/crm/empresas", h1: /./ },
  { path: "/crm/oportunidades", h1: /./ },
  { path: "/vendas/orcamentos", h1: /./ },
  { path: "/vendas/pedidos", h1: /./ },
  { path: "/catalogo/produtos", h1: /./ },
  { path: "/catalogo/categorias", h1: /./ },
  { path: "/catalogo/tabelas-preco", h1: /./ },
  { path: "/estoque", h1: /./ },
  { path: "/financeiro/pagamentos", h1: /./ },
  { path: "/financeiro/caixa", h1: /./ },
  { path: "/operacao/ordens-servico", h1: /./ },
  { path: "/fiscal/notas", h1: /./ },
  { path: "/fiscal/configuracao", h1: /./ },
  { path: "/conta", h1: /./ },
];

test.describe("varredura dos módulos (aceite)", () => {
  test.beforeEach(async ({ page }) => {
    await seedSessao(page);
  });

  for (const rota of ROTAS) {
    test(`${rota.path} renderiza cabeçalho sem erros`, async ({ page }) => {
      const erros = rastrearErros(page);
      await page.goto(rota.path);

      // Página protegida continua autenticada
      await expect(page).not.toHaveURL(/\/login/);

      // Header do padrão do design system presente e com texto
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible();
      await expect(h1).toHaveText(/./);

      // Nenhum pageerror/console.error útil
      await expect.poll(() => erros).toEqual([]);

      // Layout sem overflow horizontal no desktop
      expect(await page.evaluate(semScrollHorizontal)).toBe(true);
    });
  }
});
