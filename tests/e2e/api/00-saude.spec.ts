import { expect, test } from "@playwright/test";

import { CFG } from "../helpers/env";

/**
 * Gate de ambiente: falha rápido e alto quando a stack não está de pé.
 * Todo o resto da suíte faz skip gracioso — este arquivo não: ele existe
 * para dizer claramente O QUE está fora do ar.
 */
test.describe("saúde dos serviços", () => {
  test("core-api (Rust) responde /health", async () => {
    const resp = await fetch(`${CFG.coreApi}/health`, { signal: AbortSignal.timeout(5_000) });
    expect(resp.status, `core-api em ${CFG.coreApi} — suba com: cd services/hweld-core-api && cargo run`).toBe(200);
  });

  test("operations-api (Java) responde /actuator/health", async () => {
    const resp = await fetch(`${CFG.opsApi}/actuator/health`, { signal: AbortSignal.timeout(5_000) });
    expect(resp.status, `operations-api em ${CFG.opsApi} — suba com: cd services/hweld-operations-api && ./mvnw spring-boot:run`).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("UP");
  });

  test("realtime-engine (Elixir) responde /health", async () => {
    test.skip(CFG.skipRealtime, "E2E_SKIP_REALTIME=1");
    const resp = await fetch(`${CFG.realtime}/health`, { signal: AbortSignal.timeout(5_000) });
    expect(resp.status, `realtime-engine em ${CFG.realtime} — suba com: cd services/hweld-realtime-engine && mix phx.server (ou exporte E2E_SKIP_REALTIME=1)`).toBe(200);
  });
});
