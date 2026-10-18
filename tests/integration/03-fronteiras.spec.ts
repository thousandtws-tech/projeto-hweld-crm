import { expect, test } from "@playwright/test";

import { req, staffToken } from "../e2e/helpers/api";
import { seedCenario, comprarPeloPortal } from "../e2e/helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../e2e/helpers/env";

/**
 * Fronteiras entre serviços — o que separa "interno" de "público":
 * endpoints /internal/** rejeitam JWT de usuário (exigem service token),
 * o ops-api repassa JWT ao core-api na validação síncrona, e recursos
 * inexistentes retornam o erro correto em cada lado.
 */
test.describe("fronteiras entre serviços", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.skip(!(await sonda.ops()), `operations-api fora do ar em ${CFG.opsApi}`);
    test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");
  });

  test("ops-api: /internal/events rejeita JWT de usuário (exige service token)", async () => {
    const staff = await staffToken();
    const r = await req(CFG.opsApi, "POST", "/api/v1/internal/events", {
      token: staff,
      body: { eventId: "x", eventType: "teste", payload: {} },
    });
    expect([401, 403], "endpoint interno aceitou JWT de usuário").toContain(r.status);
  });

  test("ops-api: /internal/events sem credencial → 401/403", async () => {
    const r = await req(CFG.opsApi, "POST", "/api/v1/internal/events", {
      body: { eventId: "x", eventType: "teste", payload: {} },
    });
    expect([401, 403]).toContain(r.status);
  });

  test("core-api: /internal/eventos-financeiros sem service token → 401/403", async () => {
    const r = await req(CFG.coreApi, "POST", "/api/v1/internal/eventos-financeiros", {
      body: { eventId: "x", tipo: "payment.confirmed", payload: {} },
    });
    expect([401, 403, 404]).toContain(r.status);
  });

  test("payments para pedido inexistente → 404, não 500", async () => {
    const cenario = await seedCenario();
    const { portalToken } = await import("../e2e/helpers/api");
    const ptoken = await portalToken(cenario.portal);
    const r = await req(CFG.opsApi, "POST", "/api/v1/payments", {
      token: ptoken,
      body: { pedidoId: 99999999, method: "PIX" },
    });
    // O Java repassa o JWT ao Rust, que responde 404 — não pode vazar 500.
    expect([403, 404], `pedido inexistente retornou ${r.status}`).toContain(r.status);
  });

  test("recurso alheio entre empresas: pedido de outra org → 403/404", async () => {
    const a = await seedCenario();
    const b = await seedCenario();
    const pedido = await comprarPeloPortal(a);

    const { portalToken } = await import("../e2e/helpers/api");
    const ptokenB = await portalToken(b.portal);
    const r = await req(CFG.coreApi, "GET", `/api/v1/portal/pedidos/${pedido.id}`, {
      token: ptokenB,
    });
    expect([403, 404], `pedido alheio legível: ${r.status}`).toContain(r.status);
  });
});
