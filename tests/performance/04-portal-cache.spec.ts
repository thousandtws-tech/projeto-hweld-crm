import { expect, test } from "@playwright/test";

import { executarCarga, resumo, sondaLatencia } from "./lib/carga";
import { CFG, sonda } from "../e2e/helpers/env";

/**
 * Budgets dos endpoints públicos do portal — os que sustentam a vitrine:
 * categorias, catálogo e PDP. Limites pensados para produção via Worker
 * (RTT de borda incluído) e direto na API:
 *
 *  - p95 via worker < 900ms (RTT ~200-400ms + backend <150ms + margem)
 *  - p95 direto  < 700ms
 *
 * E a regressão do cache HTTP: ETag presente, If-None-Match → 304 com
 * corpo vazio, e resposta comprimida quando o cliente aceita.
 */
test.describe("portal — budgets e cache HTTP", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
  });

  test("GET /portal/categorias — p95 direto < 700ms", async () => {
    const m = await executarCarga(
      { vus: 10, durMs: 10_000 },
      () => sondaLatencia(`${CFG.coreApi}/api/v1/portal/categorias`),
    );
    console.log(resumo("GET /portal/categorias (direto)", m));
    expect(m.erros).toBe(0);
    expect(m.p95).toBeLessThan(700);
  });

  test("GET /portal/catalogo — p95 direto < 700ms", async () => {
    const m = await executarCarga(
      { vus: 10, durMs: 10_000 },
      () => sondaLatencia(`${CFG.coreApi}/api/v1/portal/catalogo?por_pagina=24`),
    );
    console.log(resumo("GET /portal/catalogo (direto)", m));
    expect(m.erros).toBe(0);
    expect(m.p95).toBeLessThan(700);
  });

  test("GET /portal/categorias via worker — p95 < 900ms", async () => {
    test.skip(!(await sonda.web()), `storefront fora do ar em ${CFG.webUrl}`);
    const m = await executarCarga(
      { vus: 10, durMs: 10_000 },
      () => sondaLatencia(`${CFG.webUrl}/api/v1/portal/categorias`),
    );
    console.log(resumo("GET /portal/categorias (worker)", m));
    expect(m.erros).toBe(0);
    expect(m.p95).toBeLessThan(900);
  });

  test("ETag + revalidação 304 em GET público do portal", async () => {
    const url = `${CFG.coreApi}/api/v1/portal/categorias`;
    const r1 = await fetch(url);
    expect(r1.status).toBe(200);
    const etag = r1.headers.get("etag");
    expect(etag, "GET público deve emitir ETag").toBeTruthy();
    expect(r1.headers.get("cache-control")).toContain("max-age");
    expect(r1.headers.get("vary") ?? "").toContain("Authorization");
    await r1.arrayBuffer();

    const r2 = await fetch(url, { headers: { "if-none-match": etag! } });
    expect(r2.status).toBe(304);
    const corpo = await r2.arrayBuffer();
    expect(corpo.byteLength).toBe(0);
  });

  test("compressão gzip/brotli em JSON do portal", async () => {
    const r = await fetch(`${CFG.coreApi}/api/v1/portal/categorias`, {
      headers: { "accept-encoding": "gzip" },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-encoding")).toBe("gzip");
    await r.arrayBuffer();
  });
});
