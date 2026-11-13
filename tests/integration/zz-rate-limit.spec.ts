import { expect, test } from "@playwright/test";

import { CFG, sonda } from "../e2e/helpers/env";

/**
 * Rate limit por IP real no escopo /auth — token bucket burst 10, refill ~6s.
 *
 * Histórico: o `PeerIpKeyExtractor` original enxergava o IP do LB da
 * Railway (não do usuário) — medido em prod, ~90 logins por IP sem 429.
 * Corrigido com `RealIpExtractor` (x-real-ip/cf-connecting-ip do worker
 * Cloudflare → x-forwarded-for → peer). Agora o 429 deve aparecer logo
 * após o burst de 10 — este teste falha se a proteção regredir.
 *
 * Nome com zz para rodar POR ÚLTIMO: esgota o bucket do IP do runner.
 */
test.describe("rate limit — proteção de login", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.setTimeout(120_000);
  });

  test("rajada de logins falhos → 429 dentro do burst real (10 + refill)", async () => {
    // Credenciais falsas — nenhuma conta real é afetada; o bucket é por IP.
    const resultados: number[] = [];
    // 3 lotes × 8 concorrentes = 24 tentativas — burst 10 + ~2-3 tokens de
    // refill nessa janela → espera-se 429 em pelo menos uma.
    for (let lote = 0; lote < 3; lote++) {
      // fetch cru: o helper `req` respeitaria retry-after e esconderia os 429.
      const resps = await Promise.all(
        Array.from({ length: 8 }, () =>
          fetch(`${CFG.coreApi}/api/v1/auth/staff/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: "nao.existe@example.invalid",
              senha: "senha-errada-123",
            }),
          }),
        ),
      );
      resultados.push(...resps.map((r) => r.status));
      if (resultados.includes(429)) break;
    }

    const total401 = resultados.filter((s) => s === 401).length;
    const total429 = resultados.filter((s) => s === 429).length;
    const outros = resultados.filter((s) => s !== 401 && s !== 429);
    expect(outros, `respostas inesperadas: ${outros.join(",")}`).toHaveLength(0);
    expect(total401).toBeGreaterThan(0);
    expect(
      total429,
      `${resultados.length} tentativas sem 429 — rate limit não está ` +
        `limitando por IP real (regressão?): 401×${total401}`,
    ).toBeGreaterThan(0);
  });
});
