import { expect, test } from "@playwright/test";

import { staffToken } from "../e2e/helpers/api";
import { CFG, sonda, TEM_ADMIN } from "../e2e/helpers/env";
import { executarCarga, resumo } from "./lib/carga";
import { criarIteracao } from "./lib/requisicao";

/**
 * Busca full-text (Elasticsearch) — o endpoint mais pesado de leitura.
 * Cada iteração alterna o termo para evitar warm-cache mascarar a medida.
 */
test.describe("busca — Elasticsearch", () => {
  test.beforeAll(async () => {
    test.skip(!TEM_ADMIN, "sem credenciais");
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.skip(CFG.skipBusca, "E2E_SKIP_BUSCA=1");
    const staff = await staffToken();
    const probe = await fetch(`${CFG.coreApi}/api/v1/busca/produtos?q=x`, {
      headers: { authorization: `Bearer ${staff}` },
    });
    test.skip(probe.status !== 200, "Elasticsearch indisponível");
  });

  test("GET /busca/produtos — 6 VUs × 20s — p95 < 3s", async () => {
    const staff = await staffToken();
    const termos = ["eletrodo", "mig", "tig", "solda", "eletro"];
    let i = 0;
    const m = await executarCarga({ vus: 6, durMs: 20_000 }, () =>
      criarIteracao(
        `${CFG.coreApi}/api/v1/busca/produtos?q=${termos[i++ % termos.length]}`,
        staff,
      )(),
    );
    console.log(resumo("GET /busca/produtos", m));
    // Degradação do ES = erro explícito (503) — falha, não silêncio.
    expect(m.erros, `erros: ${JSON.stringify(m.porStatus)}`).toBe(0);
    expect(m.p95).toBeLessThan(3_000);
  });
});
