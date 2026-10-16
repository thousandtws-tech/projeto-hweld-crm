import { describe, expect, it } from "vitest";

import {
  avaliarEntropiaSenha,
  calcularScoreLexico,
  cepMask,
  cnpjMask,
  construirLivroRazao,
  telefoneMask,
  validarCnpjModulo11,
} from "./algoritmos";
import type { CaixaMovimentacao } from "./models";

// ── CNPJ módulo-11 ───────────────────────────────────────────────────────────

describe("validarCnpjModulo11", () => {
  it("aceita CNPJs reais válidos (com e sem máscara)", () => {
    // CNPJs públicos válidos: Embraer, Banco do Brasil
    for (const cnpj of [
      "07689002000189",
      "07.689.002/0001-89",
      "00000000000191",
      "04.252.011/0001-10",
    ]) {
      expect(validarCnpjModulo11(cnpj)).toBe(true);
    }
  });

  it("rejeita dígito verificador errado, sequência repetida e tamanho incorreto", () => {
    expect(validarCnpjModulo11("07689002000188")).toBe(false); // DV errado
    expect(validarCnpjModulo11("11111111111111")).toBe(false); // repetidos
    expect(validarCnpjModulo11("1234567890123")).toBe(false); // 13 dígitos
    expect(validarCnpjModulo11("123456789012345")).toBe(false); // 15 dígitos
    expect(validarCnpjModulo11("")).toBe(false);
  });
});

describe("máscaras de documento", () => {
  it("formata CNPJ progressivamente", () => {
    expect(cnpjMask("07689002000189")).toBe("07.689.002/0001-89");
    expect(cnpjMask("0768")).toBe("07.68");
    expect(cnpjMask("")).toBe("");
    expect(cnpjMask("07689002000189999")).toBe("07.689.002/0001-89");
  });

  it("formata telefone fixo e celular", () => {
    expect(telefoneMask("1140028922")).toBe("(11) 4002-8922");
    expect(telefoneMask("11987654321")).toBe("(11) 98765-4321");
    expect(telefoneMask("11")).toBe("(11");
  });

  it("formata CEP", () => {
    expect(cepMask("01310100")).toBe("01310-100");
    expect(cepMask("0131")).toBe("0131");
  });
});

// ── Livro-razão do caixa ─────────────────────────────────────────────────────

const mov = (
  id: number,
  tipo: string,
  valor: string,
  created_at = `2024-06-0${id}T10:00:00Z`,
): CaixaMovimentacao => ({
  id,
  caixa_id: 1,
  tipo,
  valor,
  forma_pagamento_id: null,
  pagamento_id: null,
  usuario_id: 1,
  descricao: null,
  created_at,
});

describe("construirLivroRazao", () => {
  it("acumula saldo em ordem cronológica e devolve mais recente no topo", () => {
    const r = construirLivroRazao(100, [
      mov(3, "sangria", "30", "2024-06-01T12:00:00Z"),
      mov(1, "suprimento", "200", "2024-06-01T10:00:00Z"),
      mov(2, "despesa", "50", "2024-06-01T11:00:00Z"),
    ]);

    expect(r.saldoAtual).toBe(220); // 100 +200 -50 -30
    expect(r.entradas).toBe(200);
    expect(r.saidas).toBe(80);
    // topo = mais recente (sangria), base = mais antigo (suprimento)
    expect(r.linhas.map((l) => l.tipo)).toEqual(["sangria", "despesa", "suprimento"]);
    expect(r.linhas[2].saldoApos).toBe(300); // após suprimento
    expect(r.linhas[0].saldoApos).toBe(220); // após sangria
    expect(r.linhas[0].delta).toBe(-30);
    expect(r.linhas[2].delta).toBe(200);
  });

  it("trata estorno como saída (devolução ao pagador)", () => {
    const r = construirLivroRazao(0, [mov(1, "recebimento", "150"), mov(2, "estorno", "150")]);
    expect(r.saldoAtual).toBe(0);
    expect(r.entradas).toBe(150);
    expect(r.saidas).toBe(150);
  });

  it("caixa vazio mantém o valor de abertura", () => {
    const r = construirLivroRazao(250.5, []);
    expect(r.saldoAtual).toBe(250.5);
    expect(r.linhas).toHaveLength(0);
  });

  it("arredonda centesimalmente sem erro de ponto flutuante", () => {
    const r = construirLivroRazao(0, [
      mov(1, "venda", "0.1"),
      mov(2, "venda", "0.2"),
      mov(3, "venda", "0.3"),
    ]);
    expect(r.saldoAtual).toBe(0.6);
  });
});

// ── Score léxico da omnibox ──────────────────────────────────────────────────

describe("calcularScoreLexico", () => {
  it("ordena exato > prefixo > palavra inteira > substring > secundário > ausente", () => {
    const scores = [
      calcularScoreLexico("pedidos", "Pedidos"), // 100 exato
      calcularScoreLexico("pedi", "Pedidos"), // 85 prefixo
      calcularScoreLexico("venda", "Ordem de venda"), // 65 palavra
      calcularScoreLexico("presas", "Empresas & Contatos"), // 50 substring
      calcularScoreLexico("crm", "Pipeline", "módulo CRM"), // 35 secundário
      calcularScoreLexico("xyz", "Dashboard"), // 10 ausente
    ];
    expect(scores).toEqual([100, 85, 65, 50, 35, 10]);
    for (let i = 0; i + 1 < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i + 1]);
    }
  });

  it("é case-insensitive", () => {
    expect(calcularScoreLexico("PEDIDOS", "pedidos")).toBe(100);
  });
});

// ── Entropia de senha ────────────────────────────────────────────────────────

describe("avaliarEntropiaSenha", () => {
  it("vazia é neutra; curta é bloqueante", () => {
    expect(avaliarEntropiaSenha("").nivel).toBe(0);
    expect(avaliarEntropiaSenha("abc").nivel).toBe(1);
    expect(avaliarEntropiaSenha("abc").rotulo).toContain("mín. 6");
  });

  it("escala com alfabetos maiores e comprimento", () => {
    const fraca = avaliarEntropiaSenha("abcdef"); // só minúsculas, 6 chars
    const media = avaliarEntropiaSenha("Abc12345"); // misto, 8 chars
    const forte = avaliarEntropiaSenha("Hw#Solda2024!Xk9"); // 16 chars, 4 alfabetos
    expect(fraca.bits).toBeLessThan(media.bits);
    expect(media.bits).toBeLessThan(forte.bits);
    expect(forte.nivel).toBe(4);
    expect(fraca.nivel).toBeLessThanOrEqual(2);
  });

  it("penaliza repetição de caracteres", () => {
    const repetida = avaliarEntropiaSenha("aaaaaaaaaaaa1A!");
    const diversa = avaliarEntropiaSenha("aBc3!xKp9#wQ2$zR7");
    expect(repetida.bits).toBeLessThan(diversa.bits);
  });
});
