#!/usr/bin/env node
/**
 * Budget de bundle — gate de regressão de performance.
 *
 * Falha (exit 1) quando qualquer chunk JS excede o teto gzip configurado.
 * Rode DEPOIS de `npm run build` (lê dist/assets).
 *
 * Ajuste os tetos apenas com justificativa registrada em
 * docs/performance/OPTIMIZATION_REPORT.md — budget frouxo demais
 * deixa de ser controle de regressão.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ASSETS = fileURLToPath(new URL("../dist/assets", import.meta.url));

/** Tetos por tipo de artefato, em kB gzip. */
const BUDGET_JS_KB = 130; // qualquer chunk JS (entry e lazy)
const BUDGET_CSS_KB = 20; // qualquer arquivo CSS

const KB = 1024;
let falhou = false;

for (const nome of readdirSync(ASSETS)) {
  const caminho = join(ASSETS, nome);
  const teto = nome.endsWith(".js") ? BUDGET_JS_KB : nome.endsWith(".css") ? BUDGET_CSS_KB : null;
  if (teto === null) continue;
  const gzipKb = gzipSync(readFileSync(caminho)).length / KB;
  if (gzipKb > teto) {
    falhou = true;
    console.error(`✗ ${nome}: ${gzipKb.toFixed(1)} kB gzip — acima do budget (${teto} kB)`);
  }
}

if (falhou) {
  console.error("\nBudget de bundle estourado. Ver docs/performance/PERFORMANCE_STANDARDS.md.");
  process.exit(1);
}
console.log("Budget de bundle OK (todos os chunks dentro do teto).");
