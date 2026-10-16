import { describe, expect, it } from "vitest";

import { mapearResposta } from "./brasilapi";

describe("mapearResposta (BrasilAPI → formulário)", () => {
  it("normaliza payload completo, incluindo tipo de logradouro", () => {
    const d = mapearResposta({
      cnpj: "07689002000189",
      razao_social: "H WELD INDUSTRIA LTDA",
      nome_fantasia: "HWeld",
      ddd_telefone_1: "4133334444",
      email: "CONTATO@HWELD.COM",
      descricao_tipo_de_logradouro: "Rua",
      logradouro: "das Soldas",
      numero: "100",
      complemento: "",
      bairro: "Industrial",
      municipio: "Curitiba",
      uf: "PR",
      cep: "81310100",
      descricao_situacao_cadastral: "ATIVA",
      porte: "MICRO EMPRESA",
      cnae_fiscal: 2512800,
      cnae_fiscal_descricao: "Fabricação de esquadrias de metal",
    });

    expect(d).toEqual({
      cnpj: "07689002000189",
      razao_social: "H WELD INDUSTRIA LTDA",
      nome_fantasia: "HWeld",
      telefone: "4133334444",
      email: "CONTATO@HWELD.COM",
      logradouro: "Rua das Soldas",
      numero: "100",
      complemento: null,
      bairro: "Industrial",
      cidade: "Curitiba",
      uf: "PR",
      cep: "81310100",
      situacao_cadastral: "ATIVA",
      porte: "MICRO EMPRESA",
      cnae_fiscal: 2512800,
      cnae_fiscal_descricao: "Fabricação de esquadrias de metal",
      segmento_sugerido: "Fabricação de esquadrias de metal",
    });
  });

  it("sem tipo de logradouro usa o logradouro puro; campos vazios viram null", () => {
    const d = mapearResposta({
      cnpj: "00000000000191",
      razao_social: "BANCO",
      logradouro: "  Rua X  ",
      numero: null,
      complemento: null,
      bairro: "   ",
      municipio: "Brasília",
      uf: "df",
    });
    expect(d.logradouro).toBe("Rua X");
    expect(d.bairro).toBeNull();
    expect(d.cidade).toBe("Brasília");
    expect(d.uf).toBe("df");
    expect(d.telefone).toBeNull();
    expect(d.cnae_fiscal).toBeNull();
    expect(d.situacao_cadastral).toBeNull();
  });
});
