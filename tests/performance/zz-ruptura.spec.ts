import { expect, test } from "@playwright/test";

import { portalToken } from "../e2e/helpers/api";
import { seedCenario } from "../e2e/helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../e2e/helpers/env";
import { executarCarga, resumo } from "./lib/carga";
import { criarIteracao } from "./lib/requisicao";

/**
 * Ponto de ruptura — rampa crescente no catálogo do portal (o endpoint
 * mais quente) até p95 estourar 3s ou erros aparecerem. Descobre onde o
 * sistema quebra ANTES do usuário descobrir. Roda por último (zz) —
 * deixa a fila aquecida e pode apertar o pool de conexões.
 */
test.describe("ponto de ruptura — catálogo", () => {
  test.beforeAll(async () => {
    test.skip(!TEM_ADMIN, "sem credenciais");
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.setTimeout(240_000);
  });

  test("rampa 5→30 VUs no catálogo até degradar ou completar", async () => {
    const cenario = await seedCenario();
    const ptoken = await portalToken(cenario.portal);
    const iteracao = criarIteracao(
      `${CFG.coreApi}/api/v1/portal/catalogo?pagina=1&por_pagina=12`,
      ptoken,
    );

    let pontoRuptura: number | undefined;
    for (const vus of [5, 10, 15, 20, 25, 30]) {
      const m = await executarCarga({ vus, durMs: 15_000 }, iteracao);
      const linha = resumo(`catálogo ${vus} VUs`, m);
      console.log(linha);
      const cincoXX = Object.entries(m.porStatus)
        .filter(([s]) => Number(s) >= 500)
        .reduce((a, [, c]) => a + c, 0);
      const taxaErro = m.amostras > 0 ? (m.erros + m.erroRede) / m.amostras : 0;

      if (cincoXX > 0 || taxaErro > 0.02 || m.p95 > 3_000) {
        pontoRuptura = vus;
        console.log(
          `⚠ ruptura em ${vus} VUs — p95 ${m.p95.toFixed(0)}ms, ` +
            `erros ${(taxaErro * 100).toFixed(1)}%, 5xx ${cincoXX}`,
        );
        break;
      }
    }

    // O sistema NÃO deve quebrar antes de 10 VUs no catálogo (baseline
    // razoável para o volume de uma loja B2B de médio porte).
    expect(
      pontoRuptura ?? Number.POSITIVE_INFINITY,
      "degradou antes de 10 VUs — capacidade insuficiente",
    ).toBeGreaterThanOrEqual(10);
  });
});
