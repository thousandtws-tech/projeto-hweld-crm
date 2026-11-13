import { expect, test } from "@playwright/test";

import { pollAte, portalToken, req, staffToken } from "../helpers/api";
import { seedCenario, type Cenario } from "../helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";

test.describe("catálogo e estoque", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

  let cenario: Cenario;

  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    cenario = await seedCenario();
  });

  test("saldo reflete a movimentação de entrada", async () => {
    const staff = await staffToken();
    const saldo = await req<{ quantidade_disponivel: string }>(
      CFG.coreApi,
      "GET",
      `/api/v1/estoque/saldo/${cenario.produtoId}`,
      { token: staff },
    );
    expect(saldo.status).toBe(200);
    expect(Number(saldo.body.quantidade_disponivel)).toBeGreaterThanOrEqual(100);
  });

  test("produto aparece no catálogo do portal", async () => {
    const ptoken = await portalToken(cenario.portal);
    const cat = await req<{ itens: { id: number; nome: string }[] }>(
      CFG.coreApi,
      "GET",
      // Busca pelo nome único da seed — "Eletrodo E2E" genérico retorna
      // dezenas de produtos acumulados e o novo pode cair fora da página 1.
      `/api/v1/portal/catalogo?busca=${encodeURIComponent(cenario.produtoNome)}`,
      { token: ptoken },
    );
    expect(cat.status).toBe(200);
    expect(cat.body.itens.some((i) => i.id === cenario.produtoId)).toBeTruthy();
  });

  test("busca full-text encontra o produto (Elasticsearch)", async () => {
    test.skip(CFG.skipBusca, "E2E_SKIP_BUSCA=1");
    const staff = await staffToken();

    // ES é dependência opcional por design — fora do ar, o endpoint falha e o
    // teste skipa em vez de quebrar a suíte inteira.
    const probe = await req(CFG.coreApi, "GET", "/api/v1/busca/produtos?q=x", { token: staff });
    test.skip(probe.status !== 200, `busca indisponível (${probe.status}) — Elasticsearch desligado?`);

    await req(CFG.coreApi, "POST", "/api/v1/busca/reindexar", { token: staff });

    const ptoken = await portalToken(cenario.portal);
    const hits = await pollAte(
      () =>
        req<{ itens: { nome: string }[]; total: number }>(
          CFG.coreApi,
          "GET",
          `/api/v1/portal/busca/produtos?q=${encodeURIComponent("Eletrodo E2E")}`,
          { token: ptoken },
        ),
      (r) => r.status === 200 && r.body.total >= 1,
      { timeoutMs: 20_000, descricao: "produto indexado no ES" },
    );
    expect(hits.body.itens.some((i) => i.nome.includes("Eletrodo"))).toBeTruthy();
  });
});
