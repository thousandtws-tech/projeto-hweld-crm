/**
 * Algoritmos puros do frontend — extraídos das páginas para testabilidade.
 * Sem I/O, sem DOM, sem React: funções totais determinísticas cobertas por
 * Vitest e espelhando as regras do domínio Rust (`crates/domain`).
 */

import type { CaixaMovimentacao } from "./models";

// ── Documentos & máscaras ────────────────────────────────────────────────────

export const apenasDigitos = (v: string) => v.replace(/\D/g, "");

/** XX.XXX.XXX/XXXX-XX */
export function cnpjMask(raw: string): string {
  return apenasDigitos(raw)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** (XX) XXXXX-XXXX ou (XX) XXXX-XXXX */
export function telefoneMask(raw: string): string {
  const d = apenasDigitos(raw).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** XXXXX-XXX */
export function cepMask(raw: string): string {
  const d = apenasDigitos(raw).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Validação oficial de CNPJ (Módulo 11 — espelha `texto::cnpj` do backend).
 * Evita chamadas desnecessárias à BrasilAPI e erros 422 no submit.
 */
export function validarCnpjModulo11(raw: string): boolean {
  const digitos = apenasDigitos(raw)
    .split("")
    .map((c) => Number(c));
  if (digitos.length !== 14) return false;
  if (digitos.every((d) => d === digitos[0])) return false;

  const calcularDv = (base: number[], pesos: number[]) => {
    const soma = base.reduce((acc, d, i) => acc + d * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = calcularDv(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calcularDv(digitos.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return dv1 === digitos[12] && dv2 === digitos[13];
}

// ── Caixa: livro-razão e conciliação ─────────────────────────────────────────

/** Tipos de lançamento que somam no caixa; o restante subtrai. */
export const TIPOS_ENTRADA_CAIXA = new Set(["suprimento", "venda", "recebimento"]);

export const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface LinhaLivroRazao extends CaixaMovimentacao {
  delta: number;
  saldoApos: number;
}

export interface LivroRazao {
  /** Mais recente no topo, cada linha com o saldo acumulado daquele momento. */
  linhas: LinhaLivroRazao[];
  saldoAtual: number;
  entradas: number;
  saidas: number;
  porTipo: Record<string, number>;
}

/**
 * Running Ledger Balance — acumula `saldo_i = saldo_{i-1} ± valor_i` em ordem
 * cronológica (centesimal) e devolve em ordem reversa para auditoria.
 */
export function construirLivroRazao(abertura: number, movs: CaixaMovimentacao[]): LivroRazao {
  const cronologico = [...movs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id,
  );

  let saldo = abertura;
  let entradas = 0;
  let saidas = 0;
  const porTipo: Record<string, number> = {
    suprimento: 0,
    recebimento: 0,
    venda: 0,
    sangria: 0,
    despesa: 0,
    estorno: 0,
  };

  const comSaldo: LinhaLivroRazao[] = cronologico.map((m) => {
    const v = num(m.valor);
    const ehEntrada = TIPOS_ENTRADA_CAIXA.has(m.tipo);
    const delta = ehEntrada ? v : -v;
    saldo += delta;
    if (ehEntrada) entradas += v;
    else saidas += v;
    porTipo[m.tipo] = (porTipo[m.tipo] ?? 0) + v;

    return { ...m, delta, saldoApos: Math.round(saldo * 100) / 100 };
  });

  return {
    linhas: comSaldo.reverse(),
    saldoAtual: Math.round(saldo * 100) / 100,
    entradas: Math.round(entradas * 100) / 100,
    saidas: Math.round(saidas * 100) / 100,
    porTipo,
  };
}

// ── Busca omnibox ────────────────────────────────────────────────────────────

/** Pontua relevância léxica: match exato > prefixo > palavra inteira > substring. */
export function calcularScoreLexico(
  query: string,
  alvoPrincipal: string,
  alvoSecundario = "",
): number {
  const q = query.toLowerCase();
  const p = alvoPrincipal.toLowerCase();
  const s = alvoSecundario.toLowerCase();

  if (p === q || s === q) return 100;
  if (p.startsWith(q)) return 85;
  if (s.startsWith(q)) return 75;
  if (p.includes(` ${q}`)) return 65;
  if (p.includes(q)) return 50;
  if (s.includes(q)) return 35;
  return 10;
}

// ── Força de senha ───────────────────────────────────────────────────────────

export interface EntropiaSenha {
  bits: number;
  nivel: 0 | 1 | 2 | 3 | 4;
  rotulo: string;
}

/**
 * Entropia estimada da senha — H = L × log2(R) penalizada pela razão de
 * caracteres repetidos (L = comprimento, R = tamanho do alfabeto usado).
 */
export function avaliarEntropiaSenha(senha: string): EntropiaSenha {
  if (!senha) return { bits: 0, nivel: 0, rotulo: "—" };

  let pool = 0;
  if (/[a-z]/.test(senha)) pool += 26;
  if (/[A-Z]/.test(senha)) pool += 26;
  if (/\d/.test(senha)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(senha)) pool += 32;

  const caracteresUnicos = new Set(senha).size;
  const fatorDiversidade = caracteresUnicos / senha.length;
  const bits = Math.round(senha.length * Math.log2(Math.max(2, pool)) * fatorDiversidade);

  if (senha.length < 6) return { bits, nivel: 1, rotulo: "Muito curta (mín. 6)" };
  if (bits < 36) return { bits, nivel: 1, rotulo: "Fraca" };
  if (bits < 54) return { bits, nivel: 2, rotulo: "Razoável" };
  if (bits < 75) return { bits, nivel: 3, rotulo: "Forte" };
  return { bits, nivel: 4, rotulo: "Muito forte" };
}
