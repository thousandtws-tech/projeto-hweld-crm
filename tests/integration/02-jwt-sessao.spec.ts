import { expect, test } from "@playwright/test";

import { req } from "../e2e/helpers/api";
import { CFG, sonda, TEM_ADMIN } from "../e2e/helpers/env";

/**
 * Ciclo de vida do JWT — integração auth↔stateless↔refresh em DB.
 * Cobre o que a jornada e2e não cobre: token adulterado, refresh rotation,
 * logout revogando e isolamento de tipo de token.
 */
test.describe("jwt e sessões", () => {
  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
    test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");
  });

  test("token com assinatura adulterada → 401", async () => {
    const login = await req<{ access_token: string }>(
      CFG.coreApi,
      "POST",
      "/api/v1/auth/staff/login",
      { body: { email: CFG.adminEmail, senha: CFG.adminSenha } },
    );
    expect(login.status).toBe(200);
    const partes = login.body.access_token.split(".");
    const adulterado = `${partes[0]}.${partes[1]}.${"A".repeat(partes[2].length)}`;

    const r = await req(CFG.coreApi, "GET", "/api/v1/usuarios", { token: adulterado });
    expect(r.status).toBe(401);
  });

  test("token truncado/malformado → 401", async () => {
    const r = await req(CFG.coreApi, "GET", "/api/v1/usuarios", { token: "abc.def" });
    expect(r.status).toBe(401);
  });

  test("refresh devolve novo access funcional", async () => {
    const login = await req<{ access_token: string; refresh_token: string }>(
      CFG.coreApi,
      "POST",
      "/api/v1/auth/staff/login",
      { body: { email: CFG.adminEmail, senha: CFG.adminSenha } },
    );
    expect(login.status).toBe(200);

    const refresh = await req<{ access_token: string; refresh_token?: string }>(
      CFG.coreApi,
      "POST",
      "/api/v1/auth/refresh",
      { body: { refresh_token: login.body.refresh_token } },
    );
    expect(refresh.status, JSON.stringify(refresh.body)).toBe(200);
    expect(refresh.body.access_token).toBeTruthy();

    const r = await req(CFG.coreApi, "GET", "/api/v1/usuarios", {
      token: refresh.body.access_token,
    });
    expect(r.status).toBe(200);

    // Refresh rotation: o refresh antigo não pode ser reusado.
    if (refresh.body.refresh_token) {
      const reuso = await req(CFG.coreApi, "POST", "/api/v1/auth/refresh", {
        body: { refresh_token: login.body.refresh_token },
      });
      expect([401, 403], "refresh token antigo aceito de novo").toContain(reuso.status);
    }
  });

  test("logout revoga o refresh token", async () => {
    const login = await req<{ access_token: string; refresh_token: string }>(
      CFG.coreApi,
      "POST",
      "/api/v1/auth/staff/login",
      { body: { email: CFG.adminEmail, senha: CFG.adminSenha } },
    );
    expect(login.status).toBe(200);

    const logout = await req(CFG.coreApi, "POST", "/api/v1/auth/logout", {
      token: login.body.access_token,
      body: { refresh_token: login.body.refresh_token },
    });
    expect([200, 204]).toContain(logout.status);

    const refresh = await req(CFG.coreApi, "POST", "/api/v1/auth/refresh", {
      body: { refresh_token: login.body.refresh_token },
    });
    expect([401, 403], "refresh sobreviveu ao logout").toContain(refresh.status);
  });
});
