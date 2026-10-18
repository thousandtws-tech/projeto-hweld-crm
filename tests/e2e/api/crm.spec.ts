import { expect, test } from "@playwright/test";

import { req, staffToken } from "../helpers/api";
import { cnpjValido, emailUnico, sufixoTeste } from "../helpers/dados";
import { CFG, sonda, TEM_ADMIN } from "../helpers/env";

test.describe("CRM — empresas, contatos e endereços", () => {
  test.skip(!TEM_ADMIN, "sem credenciais E2E_ADMIN_*");

  test.beforeAll(async () => {
    test.skip(!(await sonda.core()), `core-api fora do ar em ${CFG.coreApi}`);
  });

  test("cria, lista, atualiza empresa e anexa contato/endereço", async () => {
    const staff = await staffToken();
    const marca = sufixoTeste();
    const cnpj = cnpjValido();

    // Create
    const emp = await req<{ id: number }>(CFG.coreApi, "POST", "/api/v1/empresas", {
      token: staff,
      body: { razao_social: `E2E CRM ${marca} LTDA`, cnpj, status: "ativo" },
    });
    expect(emp.status, JSON.stringify(emp.body)).toBe(201);
    const empId = emp.body.id;

    // List com busca textual — o registro criado aparece
    const lista = await req<{ itens: { id: number; cnpj: string }[] }>(
      CFG.coreApi,
      "GET",
      `/api/v1/empresas?busca=${marca}`,
      { token: staff },
    );
    expect(lista.status).toBe(200);
    expect(lista.body.itens.some((e) => e.id === empId)).toBeTruthy();

    // Update — o endpoint é PUT-semântico: exige EmpresaReq completo
    // (razao_social + status obrigatórios), não patch parcial.
    const patch = await req(CFG.coreApi, "PATCH", `/api/v1/empresas/${empId}`, {
      token: staff,
      body: {
        razao_social: `E2E CRM ${marca} LTDA`,
        nome_fantasia: `Fantasia ${marca}`,
        status: "ativo",
      },
    });
    expect(patch.status).toBe(200);

    // Regressão do bug "PATCH apaga campos": campos omitidos no update
    // devem ser PRESERVADOS (COALESCE), não zerados.
    const detalhe = await req<{ id: number; cnpj: string | null; nome_fantasia: string | null }>(
      CFG.coreApi,
      "GET",
      `/api/v1/empresas/${empId}`,
      { token: staff },
    );
    expect(detalhe.status).toBe(200);
    // A API normaliza CNPJ para dígitos — compara contra a forma normalizada.
    expect(detalhe.body.cnpj, "PATCH omitiu cnpj — não pode ter sido apagado")
      .toBe(cnpj.replace(/\D/g, ""));
    expect(detalhe.body.nome_fantasia).toBe(`Fantasia ${marca}`);

    // Contato
    const ct = await req<{ id: number }>(CFG.coreApi, "POST", "/api/v1/contatos", {
      token: staff,
      body: {
        empresa_id: empId,
        nome: "Contato E2E",
        email: emailUnico("contato"),
        is_principal: true,
        acesso_portal: false,
      },
    });
    expect(ct.status, JSON.stringify(ct.body)).toBe(201);

    // Endereço
    const end = await req<{ id: number }>(CFG.coreApi, "POST", "/api/v1/enderecos", {
      token: staff,
      body: {
        empresa_id: empId,
        tipo: "entrega",
        cidade: "Campinas",
        uf: "SP",
        cep: "13010-000",
        logradouro: "Rua E2E",
        numero: "42",
        principal: true,
      },
    });
    expect(end.status, JSON.stringify(end.body)).toBe(201);
  });

  test("CNPJ duplicado → 409 (unicidade do domínio)", async () => {
    const staff = await staffToken();
    const cnpj = cnpjValido();
    const body = { razao_social: `E2E Dup ${sufixoTeste()}`, cnpj, status: "ativo" };

    const primeiro = await req(CFG.coreApi, "POST", "/api/v1/empresas", { token: staff, body });
    expect(primeiro.status).toBe(201);

    const segundo = await req(CFG.coreApi, "POST", "/api/v1/empresas", { token: staff, body });
    expect(segundo.status).toBe(409);
  });
});
