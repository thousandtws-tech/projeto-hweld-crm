import { expect, test } from "@playwright/test";

import { pollAte, portalToken, req, staffToken } from "../helpers/api";
import { comprarPeloPortal, seedCenario, type Cenario } from "../helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";
import { webhookStub } from "../helpers/webhook";

interface Payment {
  id: string;
  pedidoId: number;
  status: string;
  externalId: string;
  pixCopyPaste?: string;
  expiresAt?: string;
  amount?: string;
  currency?: string;
}

interface Pedido {
  id: number;
  numero: string;
  status: string;
  total: string;
}

/**
 * Jornada central do sistema, ponta a ponta e cross-service:
 *
 *   seed (staff/Rust) → compra (portal/Rust) → cobrança PIX (portal → Java,
 *   que repassa o JWT ao Rust para validar posse do pedido) → webhook
 *   assinado (Java) → payment CONFIRMED → outbox relay (Java, ~2s) →
 *   pedido confirmado (Rust, /internal/eventos-financeiros).
 *
 * É o teste que prova que os três serviços conversam de verdade.
 */
test.describe("jornada pedido → pagamento → confirmação", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");
  test.describe.configure({ timeout: 90_000 });

  let cenario: Cenario;
  let pedido: Pedido;
  let payment: Payment;

  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.skip(!(await sonda.ops()), `operations-api fora do ar em ${CFG.opsApi}`);

    cenario = await seedCenario();
    pedido = await comprarPeloPortal(cenario);
  });

  test("checkout cria pedido aguardando pagamento", () => {
    expect(pedido.id).toBeGreaterThan(0);
    expect(pedido.status).toBe("aguardando_pagamento");
  });

  test("portal cria cobrança PIX no operations-api", async () => {
    const ptoken = await portalToken(cenario.portal);
    const r = await req<Payment>(CFG.opsApi, "POST", "/api/v1/payments", {
      token: ptoken,
      body: { pedidoId: pedido.id, method: "PIX" },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.status).toBe("PENDING");
    expect(r.body.externalId).toMatch(/^stub_/);
    expect(r.body.pixCopyPaste).toContain("BR.GOV.BCB.PIX");
    expect(r.body.pedidoId).toBe(pedido.id);
    payment = r.body;
  });

  test("portal NÃO cria cobrança para pedido de outra empresa", async () => {
    const outro = await seedCenario();
    const ptokenOutro = await portalToken(outro.portal);

    const r = await req(CFG.opsApi, "POST", "/api/v1/payments", {
      token: ptokenOutro,
      body: { pedidoId: pedido.id, method: "PIX" },
    });
    // O Java repassa o JWT ao core-api, que responde 404/403 para pedido alheio.
    expect([403, 404]).toContain(r.status);
  });

  test("webhook sem assinatura válida → 401", async () => {
    const r = await webhookStub(payment.externalId, "CONFIRMED", { assinar: false });
    // Com allow-unsigned-stub-webhook=false (default) a falta de assinatura é 401.
    test.skip(r.status === 200, "PAYMENT_STUB_ALLOW_UNSIGNED=true neste ambiente — sem validação de assinatura");
    expect(r.status).toBe(401);
  });

  test("webhook assinado confirma o pagamento", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET — assinatura real não testável");
    const r = await webhookStub(payment.externalId, "CONFIRMED");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.aceito).toBeTruthy();

    const staff = await staffToken();
    const final = await pollAte(
      () =>
        req<Payment>(CFG.opsApi, "GET", `/api/v1/payments/${payment.id}`, { token: staff }),
      (r) => r.status === 200 && r.body.status === "CONFIRMED",
      { timeoutMs: 15_000, descricao: "payment CONFIRMED" },
    );
    expect(final.body.status).toBe("CONFIRMED");
  });

  test("outbox relay confirma o pedido no core-api (Java → Rust)", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET — pagamento não confirma");
    const ptoken = await portalToken(cenario.portal);
    const final = await pollAte(
      () =>
        req<Pedido>(CFG.coreApi, "GET", `/api/v1/portal/pedidos/${pedido.id}`, {
          token: ptoken,
        }),
      (r) => r.status === 200 && r.body.status === "confirmado",
      {
        timeoutMs: 45_000,
        intervaloMs: 2_000,
        descricao: "pedido confirmado via evento PaymentConfirmed",
      },
    );
    expect(final.body.status).toBe("confirmado");
  });

  test("e-mail transacional de confirmação foi registrado", async () => {
    test.skip(!CFG.temWebhookSecret, "sem E2E_WEBHOOK_SECRET — pagamento não confirma");
    const staff = await staffToken();
    const lista = await pollAte(
      () =>
        req<{ content: { templateCode: string; recipient: string; status: string }[] }>(
          CFG.opsApi,
          "GET",
          "/api/v1/notifications?porPagina=50",
          { token: staff },
        ),
      (r) =>
        r.status === 200 &&
        r.body.content.some(
          (d) => d.templateCode === "payment_confirmed" && d.recipient === cenario.portal.email,
        ),
      { timeoutMs: 30_000, intervaloMs: 2_000, descricao: "notification_deliveries payment_confirmed" },
    );
    const entrega = lista.body.content.find(
      (d) => d.templateCode === "payment_confirmed" && d.recipient === cenario.portal.email,
    );
    expect(entrega?.status).toBeTruthy();
  });
});
