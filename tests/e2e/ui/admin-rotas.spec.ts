import { expect, test } from "@playwright/test";

import { staffSessao } from "../helpers/api";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";
import { injetarSessaoStaff } from "../helpers/ui";

/**
 * Cobertura de rotas do painel-admin em produção — cada página deve
 * renderizar seu conteúdo esperado (não basta "abriu": assert de texto
 * característico + ausência de redirecionamento para /login).
 *
 * A sessão é injetada via sessionStorage (mesmas chaves do app:
 * hw_staff_access / hw_staff_refresh) — login via API, não pela tela,
 * para não multiplicar logins rate-limited por rota.
 */
const ROTAS: { path: string; espera: RegExp }[] = [
  { path: "/dashboard", espera: /Dashboard|Visão geral/i },
  { path: "/crm/oportunidades", espera: /Pipeline|Oportunidade|Qualificar/i },
  { path: "/crm/empresas", espera: /Empresas|Razão social/i },
  { path: "/vendas/orcamentos", espera: /Orçamento|Em análise|Aprovar|Aberto/i },
  { path: "/vendas/pedidos", espera: /Pedidos|Confirmar|Faturar|Aguardando/i },
  { path: "/catalogo/produtos", espera: /Produtos|Preço|Estoque/i },
  { path: "/catalogo/categorias", espera: /Categoria/i },
  { path: "/catalogo/tabelas-preco", espera: /tabela(s)? de preço/i },
  { path: "/catalogo/cms", espera: /CMS|banner|conteúdo|vitrine/i },
  { path: "/estoque", espera: /Estoque|Saldo|Movimenta/i },
  { path: "/operacao/ordens-servico", espera: /ordem(ns)? de serviço|OS #|Iniciar/i },
  { path: "/fiscal/notas", espera: /nota(s)?|fiscal|NF-?e?/i },
  { path: "/fiscal/configuracao", espera: /certificado|regime tributário|série da NF/i },
  { path: "/financeiro/pagamentos", espera: /pagamento(s)?|boleto|cartão/i },
  { path: "/financeiro/caixa", espera: /caixa|suprimento|sangria/i },
  { path: "/admin/usuarios", espera: /usuário(s)?|perfil/i },
  { path: "/admin/busca?q=martelo", espera: /busca|elasticsearch|resultado/i },
  { path: "/auditoria", espera: /auditoria/i },
  { path: "/conta", espera: /conta|perfil|senha|administrador|vendedor/i },
];

test.describe("painel-admin — cobertura de rotas", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

  test.beforeAll(async () => {
    test.skip(!(await sonda.admin()), `painel-admin fora do ar em ${CFG.adminUrl}`);
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    await staffSessao(); // valida credencial + aquece cache
  });

  for (const { path, espera } of ROTAS) {
    test(`${path} renderiza`, async ({ page }) => {
      await injetarSessaoStaff(page);

      // Erros JS não capturados (boundary/promise) viram falha do teste.
      const errosJs: string[] = [];
      page.on("pageerror", (e) => errosJs.push(e.message));

      await page.goto(path, { waitUntil: "domcontentloaded" });

      // Guard de auth: se cair no login, a sessão não colou (bug de auth, não de rota).
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
      await expect(
        page.getByText(espera).first(),
        `${path}: conteúdo esperado não apareceu`,
      ).toBeVisible({ timeout: 20_000 });

      expect(
        errosJs.filter((e) => !/favicon|chunk|ResizeObserver/i.test(e)),
        `${path}: exceção JS não tratada: ${errosJs.join(" | ")}`,
      ).toHaveLength(0);
    });
  }
});
