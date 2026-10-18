import { expect, test } from "@playwright/test";

import { pollAte, portalToken, req, staffToken, uuid } from "../helpers/api";
import { comprarPeloPortal, seedCenario } from "../helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";
import { webhookStub } from "../helpers/webhook";

interface Payment {
  id: string;
  status: string;
  externalId: string;
}

/**
 * Garantias de entrega — o que diferencia "funciona" de "é seguro em produção":
 * retries de client e replays de webhook não podem criar efeito duplo.
 */
test.describe("idempotência ponta a ponta", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");
  test.describe.configure({ timeout: 90_000 });

  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.skip(!(await sonda.ops()), `operations-api fora do ar em ${CFG.opsApi}`);
  });

  test("mesmo Idempotency-Key não duplica a cobrança", async () => {
    const cenario = await seedCenario();
    const pedido = await comprarPeloPortal(cenario);
    const ptoken = await portalToken(cenario.portal);
    const chave = `e2e-${uuid()}`;

    const corpo = { pedidoId: pedido.id, method: "PIX", idempotencyKey: chave };
    const p1 = await req<Payment>(CFG.opsApi, "POST", "/api/v1/payments", {
      token: ptoken,
      body: corpo,
    });
    expect(p1.status).toBe(201);

    const p2 = await req<Payment>(CFG.opsApi, "POST", "/api/v1/payments", {
      token: ptoken,
      body: corpo,
    });
    // Replay com a mesma chave devolve a MESMA cobrança — nunca uma segunda.
    expect([200, 201]).toContain(p2.status);
    expect(p2.body.id).toBe(p1.body.id);
  });

  test("replay de webhook → duplicado, sem reprocessar", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET — webhook não é aceito");
    const cenario = await seedCenario();
    const pedido = await comprarPeloPortal(cenario);
    const ptoken = await portalToken(cenario.portal);

    const p = await req<Payment>(CFG.opsApi, "POST", "/api/v1/payments", {
      token: ptoken,
      body: { pedidoId: pedido.id, method: "PIX" },
    });
    expect(p.status).toBe(201);

    const eventId = uuid();
    const primeiro = await webhookStub(p.body.externalId, "CONFIRMED", { eventId });
    expect(primeiro.status).toBe(200);
    expect(primeiro.body.duplicado).toBeFalsy();

    // Mesmo eventId reenviado (PSP re-tenta entregas) — dedupe por (provider, event_id).
    const replay = await webhookStub(p.body.externalId, "CONFIRMED", { eventId });
    expect(replay.status).toBe(200);
    expect(replay.body.duplicado).toBeTruthy();

    // O pagamento continua CONFIRMED — o replay não criou efeito colateral.
    const staff = await staffToken();
    const final = await pollAte(
      () => req<Payment>(CFG.opsApi, "GET", `/api/v1/payments/${p.body.id}`, { token: staff }),
      (r) => r.status === 200 && r.body.status === "CONFIRMED",
      { timeoutMs: 15_000, descricao: "payment CONFIRMED" },
    );
    expect(final.body.status).toBe("CONFIRMED");
  });
});
