import { expect, test } from "@playwright/test";

import { req } from "../e2e/helpers/api";
import { webhookStub } from "../e2e/helpers/webhook";
import { CFG, edgeHeaders, sonda } from "../e2e/helpers/env";

/**
 * Borda do webhook — entradas malformadas, assinaturas erradas e
 * eventos para recursos desconhecidos. Tudo que um PSP real pode mandar
 * de errado (ou um atacante fingindo ser um).
 */
test.describe("webhook — bordas", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.ops()), `operations-api fora do ar em ${CFG.opsApi}`);
  });

  test("JSON malformado → 400/422, não 500", async () => {
    const resp = await fetch(`${CFG.opsApi}/api/v1/webhooks/stub`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...edgeHeaders() },
      body: "{isto nao é json",
    });
    expect([400, 422], `payload malformado retornou ${resp.status}`).toContain(resp.status);
  });

  test("assinatura no formato errado (sem sha256=) → 401", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET");
    const corpo = JSON.stringify({ eventId: "x", externalId: "y", status: "CONFIRMED" });
    const resp = await fetch(`${CFG.opsApi}/api/v1/webhooks/stub`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-signature": "deadbeef", ...edgeHeaders() },
      body: corpo,
    });
    expect(resp.status).toBe(401);
  });

  test("assinatura de payload diferente → 401", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET");
    // Assina corpo A mas envia corpo B — HMAC não pode bater.
    const r = await webhookStub("stub_x", "CONFIRMED", { assinar: true });
    void r;
    const corpoB = JSON.stringify({ eventId: "evt", externalId: "stub_z", status: "FAILED" });
    const { createHmac } = await import("node:crypto");
    const sigErrada = `sha256=${createHmac("sha256", CFG.webhookSecret)
      .update(JSON.stringify({ eventId: "outro" }))
      .digest("hex")}`;
    const resp = await fetch(`${CFG.opsApi}/api/v1/webhooks/stub`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-signature": sigErrada, ...edgeHeaders() },
      body: corpoB,
    });
    expect(resp.status).toBe(401);
  });

  test("externalId desconhecido não derruba o endpoint", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET");
    const r = await webhookStub(`stub_${Date.now()}_naoexiste`, "CONFIRMED");
    // Contrato: evento para payment desconhecido é ignorado/rejeitado
    // graciosamente — nunca 5xx.
    expect(r.status, `externalId desconhecido → ${r.status}`).toBeLessThan(500);
  });

  test("status desconhecido no enum → rejeitado graciosamente", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET");
    const corpo = JSON.stringify({
      eventId: "evt-x",
      externalId: "stub_x",
      status: "INVENTADO_PELO_TESTE",
    });
    const { createHmac } = await import("node:crypto");
    const sig = `sha256=${createHmac("sha256", CFG.webhookSecret).update(corpo).digest("hex")}`;
    const resp = await fetch(`${CFG.opsApi}/api/v1/webhooks/stub`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-signature": sig, ...edgeHeaders() },
      body: corpo,
    });
    // Assinatura válida mas conteúdo inválido: 4xx esperado, nunca 5xx.
    expect([400, 404, 409, 422], `status inválido → ${resp.status}`).toContain(resp.status);
  });
});
