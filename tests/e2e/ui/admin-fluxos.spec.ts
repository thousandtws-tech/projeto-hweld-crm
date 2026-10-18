import { expect, test } from "@playwright/test";

import { pollAte, portalToken, req, staffToken } from "../helpers/api";
import {
  comprarPeloPortal,
  emailUnico,
  seedCenario,
  skuUnico,
  sufixoTeste,
} from "../helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";
import { injetarSessaoStaff } from "../helpers/ui";
import { webhookStub } from "../helpers/webhook";

/**
 * Fluxos de tela do painel-admin contra produção — ações reais de
 * escrita via UI (não só render): criar registros, lançar estoque,
 * emitir NF, abrir caixa, criar usuário, buscar.
 * Todos os registros levam tag "E2E" para identificação/limpeza.
 */
test.describe("painel-admin — fluxos de escrita", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

  test.beforeAll(async () => {
    test.skip(!(await sonda.admin()), `painel-admin fora do ar em ${CFG.adminUrl}`);
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
  });

  test("CRM: criar empresa pelo formulário", async ({ page }) => {
    await injetarSessaoStaff(page);
    const marca = sufixoTeste();
    const razao = `E2E UI Metalúrgica ${marca} LTDA`;

    await page.goto("/crm/empresas/nova");
    await page.getByLabel("Razão social *").fill(razao);
    await page.getByLabel("Nome fantasia").fill(`UI ${marca}`);

    const criada = page.waitForResponse(
      (r) => r.url().includes("/api/v1/empresas") && r.request().method() === "POST" && r.status() === 201,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Criar empresa" }).click();
    await criada;

    // Sucesso navega para o detalhe da empresa criada.
    await expect(page).toHaveURL(/\/crm\/empresas\/\d+/, { timeout: 15_000 });
    await expect(page.getByText(razao).first()).toBeVisible();
  });

  test("Catálogo: criar categoria pelo diálogo", async ({ page }) => {
    await injetarSessaoStaff(page);
    const nome = `E2E UI Categoria ${sufixoTeste()}`;

    await page.goto("/catalogo/categorias");
    await page.getByRole("button", { name: /Nova categoria/ }).click();
    await page.getByLabel("Nome *").fill(nome);
    await page.getByRole("button", { name: "Salvar categoria" }).click();

    await expect(page.getByText(/Categoria salva/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Catálogo: criar produto pelo formulário", async ({ page }) => {
    await injetarSessaoStaff(page);
    const sku = skuUnico();
    const nome = `Eletrodo UI ${sufixoTeste()}`;

    await page.goto("/catalogo/produtos/novo");
    await page.getByLabel("SKU *").fill(sku);
    await page.getByLabel("Nome do produto *").fill(nome);
    await page.getByLabel("Categoria *").selectOption({ index: 1 });
    await page.getByLabel("Preço de venda (R$) *").fill("31.90");

    const criado = page.waitForResponse(
      (r) => r.url().includes("/api/v1/produtos") && r.request().method() === "POST" && r.status() === 201,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await criado;

    // Sucesso = toast + navegação para a listagem.
    await expect(page.getByText(/Produto salvo/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/catalogo\/produtos$/, { timeout: 15_000 });
  });

  test("Estoque: lançar movimentação de entrada", async ({ page }) => {
    await injetarSessaoStaff(page);
    const motivo = `carga e2e ui ${sufixoTeste()}`;

    await page.goto("/estoque");
    await page.getByLabel("Produto").selectOption({ index: 1 });
    await page.getByLabel("Quantidade").fill("5");
    await page.getByLabel("Motivo").fill(motivo);
    await page.getByRole("button", { name: "Lançar" }).click();

    await expect(page.getByText(/Lançamento registrado/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(motivo).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Fiscal: emitir NF em rascunho para pedido confirmado", async ({ page }) => {
    // Pré-condição via API: pedido E2E confirmado (checkout → PIX → webhook
    // assinado) — a mesma cadeia validada no spec de jornada.
    const cenario = await seedCenario();
    const pedido = await comprarPeloPortal(cenario);
    const ptoken = await portalToken(cenario.portal);
    const pay = await req<{ id: string; externalId: string }>(
      CFG.opsApi,
      "POST",
      "/api/v1/payments",
      { token: ptoken, body: { pedidoId: pedido.id, method: "PIX" } },
    );
    expect(pay.status, JSON.stringify(pay.body)).toBe(201);
    const hook = await webhookStub(pay.body.externalId, "CONFIRMED");
    expect(hook.status).toBe(200);

    // O outbox relay confirma o pedido no core-api de forma assíncrona —
    // o modal de NF só lista pedidos já faturáveis.
    await pollAte(
      async () =>
        req<{ status: string }>(CFG.coreApi, "GET", `/api/v1/portal/pedidos/${pedido.id}`, {
          token: ptoken,
        }),
      (r) => r.status === 200 && r.body.status === "confirmado",
      { descricao: `pedido ${pedido.numero} confirmado via outbox` },
    );

    // Emissão exige pedido em separação/faturado (regra do core-api) —
    // avança o pedido E2E pelo fluxo de separação como staff.
    const staff = await staffToken();
    const sep = await req(CFG.coreApi, "PATCH", `/api/v1/pedidos/${pedido.id}/status`, {
      token: staff,
      body: { status: "em_separacao" },
    });
    expect(sep.status, JSON.stringify(sep.body)).toBe(200);

    await injetarSessaoStaff(page);
    await page.goto("/fiscal/notas");
    await page.getByRole("button", { name: /Emitir NF/ }).click();

    const dialog = page.getByRole("dialog");
    const seletor = dialog.locator("select");
    await expect(seletor).toBeVisible({ timeout: 10_000 });
    // O option traz o número do pedido — seleciona o da jornada E2E por índice.
    const opcoes = await seletor.locator("option").allTextContents();
    const alvo = opcoes.findIndex((o) => o.includes(pedido.numero));
    if (alvo < 0) {
      throw new Error(`pedido ${pedido.numero} não listado como faturável: ${opcoes}`);
    }
    await seletor.selectOption({ index: alvo });

    await dialog.getByRole("button", { name: "Emitir rascunho" }).click();
    await expect(page.getByText(/NF emitida em rascunho/i).first()).toBeVisible({
      timeout: 15_000,
    });
    // A tabela identifica a NF pelo id numérico do pedido ("Pedido #N").
    await expect(
      page.getByText(new RegExp(`Pedido\\s*#\\s*${pedido.id}\\b`)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Financeiro: abrir caixa (ou confirmar caixa já aberto)", async ({ page }) => {
    await injetarSessaoStaff(page);
    await page.goto("/financeiro/caixa");

    const campoAbertura = page.getByPlaceholder("Valor de abertura (R$)");
    if (await campoAbertura.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await campoAbertura.fill("150.00");
      await page.getByRole("button", { name: "Abrir caixa" }).click();
      await expect(
        page.getByText(/Caixa aberto|Já existe um caixa aberto/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
    // Estado final: sessão aberta visível (botões de sangria/suprimento/fechar).
    await expect(
      page.getByText(/Sessão #|Suprimento|Sangria|Movimenta/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Admin: criar usuário vendedor", async ({ page }) => {
    await injetarSessaoStaff(page);
    const nome = `E2E Usuario ${sufixoTeste()}`;
    const email = emailUnico("e2e.usuario");

    await page.goto("/admin/usuarios");
    await page.getByRole("button", { name: /Usuário/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill(nome);
    await dialog.getByLabel("E-mail").fill(email);
    await dialog.getByLabel("Senha").fill("e2e@senha123");
    await dialog.getByLabel("Perfil").selectOption("vendedor");
    await dialog.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText(/Usuário salvo/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Admin: busca de produtos no Elasticsearch", async ({ page }) => {
    test.skip(CFG.skipBusca, "E2E_SKIP_BUSCA=1");
    await injetarSessaoStaff(page);

    await page.goto("/admin/busca");
    const input = page.getByPlaceholder("Buscar produtos…");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("Eletrodo");
    await page.getByRole("button", { name: "Buscar" }).click();

    // Resultados ou estado explícito de "sem resultados"/ES off — qualquer
    // um prova que a busca respondeu sem crashar a página.
    await expect(
      page
        .getByText(/resultado|Eletrodo|encontrad|Elasticsearch indisponível|nenhum/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
