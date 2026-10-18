import { expect, test } from "@playwright/test";

import { req, staffToken } from "../e2e/helpers/api";
import { CFG, sonda, TEM_ADMIN } from "../e2e/helpers/env";

/**
 * Contratos de resposta — shapes de erro, paginação, headers de segurança
 * e CORS. Estes contratos são consumidos pelos dois frontends e por
 * integradores: quebrar aqui quebra todo mundo silenciosamente.
 */
test.describe("contratos HTTP", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
  });

  test("paginação: lista devolve itens + metadados", async () => {
    test.skip(!TEM_ADMIN, "sem credenciais");
    const staff = await staffToken();
    const r = await req<{ itens: unknown[]; total?: number; pagina?: number }>(
      CFG.coreApi,
      "GET",
      "/api/v1/empresas?pagina=1&por_pagina=5",
      { token: staff },
    );
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.itens)).toBeTruthy();
  });

  test("404 devolve envelope de erro padronizado", async () => {
    test.skip(!TEM_ADMIN, "sem credenciais");
    const staff = await staffToken();
    const r = await req<{ erro?: { codigo: string; mensagem: string } }>(
      CFG.coreApi,
      "GET",
      "/api/v1/empresas/99999999",
      { token: staff },
    );
    expect(r.status).toBe(404);
    expect(r.body.erro?.codigo).toBeTruthy();
    expect(r.body.erro?.mensagem).toBeTruthy();
  });

  test("erro de desserialização usa o envelope de erro padronizado", async () => {
    test.skip(!TEM_ADMIN, "sem credenciais");
    const staff = await staffToken();
    const r = await req<{ erro?: { codigo: string; mensagem: string } }>(
      CFG.coreApi,
      "POST",
      "/api/v1/empresas",
      { token: staff, body: { nome_fantasia: "Sem razão" } },
    );
    // Após o fix do JsonConfig: envelope {erro:{codigo:"valor_invalido"}}
    // em 422 — o default do actix devolvia texto puro em 400.
    expect([400, 422]).toContain(r.status);
    expect(r.body.erro?.codigo, JSON.stringify(r.body)).toBe("valor_invalido");
    expect(r.body.erro?.mensagem).toContain("razao_social");
  });

  test("security headers presentes (OWASP)", async () => {
    const resp = await fetch(`${CFG.coreApi}/health`);
    const h = resp.headers;
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("x-frame-options")).toBeTruthy();
    expect(h.get("referrer-policy")).toBeTruthy();
  });

  test("CORS: origem arbitrária não recebe allow-origin", async () => {
    const resp = await fetch(`${CFG.coreApi}/health`, {
      headers: { Origin: "https://malicious.example.com" },
    });
    const acao = resp.headers.get("access-control-allow-origin");
    // Permissivo só em dev (CORS_PERMISSIVE); em prod a origem estranha não ecoa.
    if (acao !== null) {
      expect(acao).not.toBe("https://malicious.example.com");
    }
    expect(acao).not.toBe("*");
  });

  test("ops-api: actuator sensível não é público", async () => {
    test.skip(!(await sonda.ops()), `operations-api fora do ar em ${CFG.opsApi}`);
    for (const path of ["/actuator/metrics", "/actuator/prometheus", "/actuator/env"]) {
      const resp = await fetch(`${CFG.opsApi}${path}`);
      expect([401, 403, 404], `${path} exposto sem auth`).toContain(resp.status);
    }
  });
});
