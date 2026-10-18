import { expect, test } from "@playwright/test";

import { executarCarga, resumo, sondaLatencia } from "./lib/carga";
import { CFG, sonda } from "../e2e/helpers/env";

/**
 * Baseline de rede — /health sem auth mede o piso de latência
 * (rede + proxy + boot do handler). Os limiares dos outros cenários
 * fazem sentido relativos a este piso: endpoint pesado deveria ficar
 * no máximo ~3-4× o baseline, não 20×.
 */
test.describe("baseline — /health", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
  });

  test("20 VUs × 15s — p95 < 1s, sem erros", async () => {
    const m = await executarCarga(
      { vus: 20, durMs: 15_000 },
      () => sondaLatencia(`${CFG.coreApi}/health`),
    );
    console.log(resumo("GET /health", m));
    expect(m.erros, `erros no health: ${JSON.stringify(m.porStatus)}`).toBe(0);
    expect(m.erroRede).toBe(0);
    expect(m.p95).toBeLessThan(1_000);
  });

  test("baseline realtime: /health", async () => {
    test.skip(!(await sonda.realtime()), `realtime fora do ar em ${CFG.realtime}`);
    const m = await executarCarga(
      { vus: 15, durMs: 10_000 },
      () => sondaLatencia(`${CFG.realtime}/health`),
    );
    console.log(resumo("GET realtime /health", m));
    expect(m.erros).toBe(0);
    expect(m.p95).toBeLessThan(1_200);
  });
});
