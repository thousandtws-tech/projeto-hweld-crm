import { expect, test } from "@playwright/test";

import { portalToken, req, staffToken } from "../helpers/api";
import { emailUnico, seedCenario } from "../helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";

test.describe("auth e isolamento de contextos", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_* — ver .env.e2e.example");

  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
  });

  test("login staff retorna tokens", async () => {
    const token = await staffToken();
    expect(token.length).toBeGreaterThan(20);
  });

  test("senha errada → 401", async () => {
    const r = await req(CFG.coreApi, "POST", "/api/v1/auth/staff/login", {
      body: { email: CFG.adminEmail, senha: "senha-errada-e2e" },
    });
    expect(r.status).toBe(401);
  });

  test("sem token → 401 em rota staff", async () => {
    const r = await req(CFG.coreApi, "GET", "/api/v1/usuarios");
    expect(r.status).toBe(401);
  });

  test("token staff acessa rota staff", async () => {
    const r = await req(CFG.coreApi, "GET", "/api/v1/usuarios", { token: await staffToken() });
    expect(r.status).toBe(200);
  });

  test("RBAC: vendedor não acessa administração de usuários", async () => {
    const staff = await staffToken();
    const email = emailUnico("vendedor");
    const criar = await req(CFG.coreApi, "POST", "/api/v1/usuarios", {
      token: staff,
      body: { nome: "Vendedor E2E", email, senha: "e2e#vend12345", perfil: "vendedor" },
    });
    expect(criar.status).toBe(201);

    const login = await req<{ access_token: string }>(CFG.coreApi, "POST", "/api/v1/auth/staff/login", {
      body: { email, senha: "e2e#vend12345" },
    });
    expect(login.status).toBe(200);

    const r = await req(CFG.coreApi, "GET", "/api/v1/usuarios", { token: login.body.access_token });
    expect(r.status).toBe(403);
  });

  test("token portal NÃO acessa rota staff (isolamento de contexto)", async () => {
    const cenario = await seedCenario();
    const ptoken = await portalToken(cenario.portal);

    const r = await req(CFG.coreApi, "GET", "/api/v1/usuarios", { token: ptoken });
    // O core rejeita JWT de portal em rota staff — 401 (tipo inválido) ou 403.
    expect([401, 403]).toContain(r.status);
  });
});
