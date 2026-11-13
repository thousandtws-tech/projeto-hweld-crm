import { expect, test } from "@playwright/test";

import { staffToken, uuid } from "../helpers/api";
import { CFG, edgeHeaders, sonda, TEM_ADMIN } from "../helpers/env";
import { aguardarEventoSSE } from "../helpers/sse";
import { ingest } from "../helpers/webhook";

/**
 * realtime-engine (Phoenix): ingest → PubSub → fan-out SSE.
 * O motor é dependência OPCIONAL por design — fora do ar, tudo skipa.
 * Requer E2E_MOTOR_INGEST_TOKEN (ou MOTOR_INGEST_TOKEN no .env do core-api).
 */
test.describe("realtime-engine", () => {
  test.beforeAll(async () => {
    test.skip(CFG.skipRealtime, "E2E_SKIP_REALTIME=1");
    test.skip(!(await sonda.realtime()), `realtime-engine fora do ar em ${CFG.realtime}`);
  });

  test("/ingest sem token de serviço → 401", async () => {
    const r = await ingest({
      tipo: "e2e.ping",
      escopo: "todos",
      dados: { ok: true },
      token: "token-errado",
    });
    expect(r.status).toBe(401);
  });

  test("/ingest com envelope inválido → 422", async () => {
    test.skip(!CFG.motorToken, "sem MOTOR_INGEST_TOKEN");
    const r = await ingest({ tipo: "SEM_PONTO", escopo: "todos", dados: {} });
    // tipo precisa seguir `entidade.acao` — "SEM_PONTO" é recusado na borda.
    expect([400, 422]).toContain(r.status);
  });

  test("/events/staff sem JWT → 401", async () => {
    const resp = await fetch(`${CFG.realtime}/events/staff`, {
      headers: edgeHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    expect(resp.status).toBe(401);
  });

  test("evento ingerido chega ao SSE público (ingest → PubSub → SSE)", async () => {
    test.skip(!CFG.motorToken, "sem MOTOR_INGEST_TOKEN");
    test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

    const marca = uuid();
    const escuta = aguardarEventoSSE(`${CFG.realtime}/events/publico`, {
      timeoutMs: 15_000,
      casar: (e) => e.tipo === "e2e.ping" && (e.dados as { marca?: string }).marca === marca,
    });

    try {
      // Só publica depois da saudação do stream — subscribe confirmado no nó.
      await escuta.conectado;

      const r = await ingest({
        tipo: "e2e.ping",
        escopo: "todos",
        dados: { marca, origem: "tests/e2e" },
      });
      expect(r.status, JSON.stringify(r.body)).toBe(202);

      const evento = await escuta.evento;
      expect(evento.tipo).toBe("e2e.ping");
      expect((evento.dados as { marca: string }).marca).toBe(marca);
    } finally {
      escuta.abort();
    }
  });

  test("evento staff chega ao SSE staff com JWT", async () => {
    test.skip(!CFG.motorToken, "sem MOTOR_INGEST_TOKEN");
    test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

    const staff = await staffToken();
    const marca = uuid();
    const escuta = aguardarEventoSSE(`${CFG.realtime}/events/staff`, {
      token: staff,
      timeoutMs: 15_000,
      casar: (e) => e.tipo === "e2e.staff" && (e.dados as { marca?: string }).marca === marca,
    });

    try {
      await escuta.conectado;
      const r = await ingest({
        tipo: "e2e.staff",
        escopo: "staff",
        dados: { marca },
      });
      expect(r.status).toBe(202);

      const evento = await escuta.evento;
      expect(evento.tipo).toBe("e2e.staff");
    } finally {
      escuta.abort();
    }
  });
});
