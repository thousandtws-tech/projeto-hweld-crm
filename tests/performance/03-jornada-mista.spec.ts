import { expect, test } from "@playwright/test";

import { staffToken } from "../e2e/helpers/api";
import { CFG, sonda, TEM_ADMIN } from "../e2e/helpers/env";
import { executarCarga, resumo } from "./lib/carga";
import { criarIteracao } from "./lib/requisicao";

/**
 * Jornada mista de backoffice — distribui a carga como um usuário real
 * navegando: 40% empresas, 30% pedidos, 20% produtos, 10% auditoria.
 */
test.describe("backoffice — jornada mista", () => {
  test.beforeAll(async () => {
    test.skip(!TEM_ADMIN, "sem credenciais");
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
  });

  test("5 VUs × 25s — p95 < 2.5s, sem 5xx", async () => {
    const staff = await staffToken();
    const rotas = [
      [`${CFG.coreApi}/api/v1/empresas?pagina=1&por_pagina=10`, 0.4],
      [`${CFG.coreApi}/api/v1/pedidos?pagina=1&por_pagina=10`, 0.3],
      [`${CFG.coreApi}/api/v1/produtos?pagina=1&por_pagina=10`, 0.2],
      [`${CFG.coreApi}/api/v1/auditoria?pagina=1&por_pagina=10`, 0.1],
    ] as const;
    let roleta = 0;
    const proxima = () => {
      roleta = (roleta + 0.13) % 1;
      let acc = 0;
      for (const [url, peso] of rotas) {
        acc += peso;
        if (roleta <= acc) return url;
      }
      return rotas[rotas.length - 1][0];
    };

    const m = await executarCarga({ vus: 5, durMs: 25_000 }, () =>
      criarIteracao(proxima(), staff)(),
    );
    console.log(resumo("jornada mista staff", m));

    const cincoXX = Object.entries(m.porStatus)
      .filter(([s]) => Number(s) >= 500)
      .reduce((a, [, c]) => a + c, 0);
    expect(cincoXX, `5xx: ${JSON.stringify(m.porStatus)}`).toBe(0);
    expect(m.p95).toBeLessThan(2_500);
  });
});
