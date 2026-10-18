import { expect, test } from "@playwright/test";

import { portalToken, staffToken } from "../e2e/helpers/api";
import { seedCenario } from "../e2e/helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../e2e/helpers/env";
import { executarCarga, resumo } from "./lib/carga";
import { criarIteracao } from "./lib/requisicao";

/**
 * Catálogo — os GETs mais quentes do sistema (listagem portal + staff).
 * VUs compartilham 1 token (login fora da medição — auth tem rate limit).
 */
test.describe("catálogo — endpoints quentes", () => {
  let ptoken: string;
  let staff: string;

  test.beforeAll(async () => {
    test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    const cenario = await seedCenario();
    ptoken = await portalToken(cenario.portal);
    staff = await staffToken();
  });

  test("GET /portal/catalogo — 8 VUs × 25s — p95 < 2.5s", async () => {
    const m = await executarCarga(
      { vus: 8, durMs: 25_000 },
      criarIteracao(`${CFG.coreApi}/api/v1/portal/catalogo?pagina=1&por_pagina=12`, ptoken),
    );
    console.log(resumo("GET /portal/catalogo", m));
    expect(m.erros, `erros: ${JSON.stringify(m.porStatus)}`).toBe(0);
    expect(m.p95).toBeLessThan(2_500);
  });

  test("GET /produtos staff paginado — 6 VUs × 20s — p95 < 2.5s", async () => {
    const m = await executarCarga(
      { vus: 6, durMs: 20_000 },
      criarIteracao(`${CFG.coreApi}/api/v1/produtos?pagina=1&por_pagina=20`, staff),
    );
    console.log(resumo("GET /produtos", m));
    expect(m.erros).toBe(0);
    expect(m.p95).toBeLessThan(2_500);
  });
});
