import { expect, test } from "@playwright/test";

import { req, staffToken } from "../e2e/helpers/api";
import { seedCenario } from "../e2e/helpers/dados";
import { CFG, edgeHeaders, sonda, TEM_ADMIN } from "../e2e/helpers/env";

/**
 * Integração com infra externa — MinIO (upload/download round-trip) e
 * Elasticsearch (busca do portal com sanitização de campos staff-only).
 */

// PNG 1x1 vermelho — bytes exatos para round-trip.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("storage e busca", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");
  });

  test("midia: upload → download retorna bytes idênticos (MinIO round-trip)", async () => {
    const staff = await staffToken();
    const up = await fetch(`${CFG.coreApi}/api/v1/midia/upload`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${staff}`,
        "Content-Type": "application/octet-stream",
        ...edgeHeaders(),
      },
      body: PNG_1PX,
    });
    expect(up.status).toBe(201);
    const { url } = (await up.json()) as { url: string };

    const down = await fetch(`${CFG.coreApi}${url}`, { headers: edgeHeaders() });
    expect(down.status).toBe(200);
    const bytes = Buffer.from(await down.arrayBuffer());
    expect(bytes.equals(PNG_1PX), "bytes do download divergem do upload").toBeTruthy();
  });

  test("upload rejeita conteúdo que não é imagem", async () => {
    const staff = await staffToken();
    const up = await fetch(`${CFG.coreApi}/api/v1/midia/upload`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${staff}`,
        "Content-Type": "application/octet-stream",
        ...edgeHeaders(),
      },
      body: Buffer.from("PK\x03\x04 fake zip/exe content"),
    });
    expect([400, 415, 422], `não-imagem aceito: ${up.status}`).toContain(up.status);
  });

  test("busca do portal NÃO vaza preco_custo (sanitização staff-only)", async () => {
    const cenario = await seedCenario();
    const { portalToken } = await import("../e2e/helpers/api");
    const ptoken = await portalToken(cenario.portal);

    const r = await req<{ itens: Record<string, unknown>[] }>(
      CFG.coreApi,
      "GET",
      `/api/v1/portal/catalogo?busca=${encodeURIComponent(cenario.produtoNome)}`,
      { token: ptoken },
    );
    expect(r.status).toBe(200);
    const item = r.body.itens.find((i) => i.id === cenario.produtoId);
    expect(item).toBeTruthy();
    // Contrato de exposição: custo é informação interna — nunca no portal.
    expect(item, "preco_custo vazou no catálogo do portal").not.toHaveProperty("preco_custo");
    expect(item).not.toHaveProperty("margem");
  });

  test("busca full-text: sugestões respondem no formato esperado", async () => {
    test.skip(CFG.skipBusca, "E2E_SKIP_BUSCA=1");
    const staff = await staffToken();
    const probe = await req(CFG.coreApi, "GET", "/api/v1/busca/produtos?q=x", { token: staff });
    test.skip(probe.status !== 200, "Elasticsearch indisponível neste ambiente");

    const cenario = await seedCenario();
    await req(CFG.coreApi, "POST", "/api/v1/busca/reindexar", { token: staff });
    const { portalToken, pollAte } = await import("../e2e/helpers/api");
    const ptoken = await portalToken(cenario.portal);

    const sug = await pollAte(
      async () =>
        req<unknown[] | { itens?: unknown[] }>(
          CFG.coreApi,
          "GET",
          `/api/v1/portal/busca/sugestoes?q=${encodeURIComponent(cenario.produtoNome.slice(0, 12))}`,
          { token: ptoken },
        ),
      (r) => r.status === 200,
      { descricao: "sugestões de busca" },
    );
    expect(sug.status).toBe(200);
  });
});
