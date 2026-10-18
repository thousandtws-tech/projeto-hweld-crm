/**
 * Runner de carga mínimo — N "virtual users" executando a função de
 * iteração em loop até o tempo esgotar, coletando latência e status.
 * Sem dependência externa: VU = async worker com sleep de rampa.
 */

export interface OpcoesCarga {
  /** VUs concorrentes (workers async em loop). */
  vus: number;
  /** Duração da janela de medição. */
  durMs: number;
  /** Rampa de entrada dos VUs (default 0 = todos de uma vez). */
  rampaMs?: number;
}

export interface ResultadoIteracao {
  status: number;
}

export interface Metricas {
  amostras: number;
  durMs: number;
  rps: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  erros: number;
  erroRede: number;
  porStatus: Record<number, number>;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function executarCarga(
  opts: OpcoesCarga,
  iteracao: () => Promise<ResultadoIteracao>,
): Promise<Metricas> {
  const latencias: number[] = [];
  const porStatus = new Map<number, number>();
  let erroRede = 0;

  const fim = Date.now() + opts.durMs;
  const intervaloRampa = opts.vus > 1 ? (opts.rampaMs ?? 0) / (opts.vus - 1) : 0;

  const workers = Array.from({ length: opts.vus }, async (_, i) => {
    if (intervaloRampa > 0) await dormir(i * intervaloRampa);
    while (Date.now() < fim) {
      const t0 = performance.now();
      try {
        const r = await iteracao();
        latencias.push(performance.now() - t0);
        porStatus.set(r.status, (porStatus.get(r.status) ?? 0) + 1);
      } catch {
        latencias.push(performance.now() - t0);
        erroRede++;
      }
    }
  });
  await Promise.all(workers);

  latencias.sort((a, b) => a - b);
  const n = latencias.length;
  const pct = (p: number) => (n === 0 ? 0 : latencias[Math.min(n - 1, Math.floor(p * n))]);
  const erros = [...porStatus.entries()]
    .filter(([s]) => s >= 400)
    .reduce((acc, [, c]) => acc + c, 0);

  return {
    amostras: n,
    durMs: opts.durMs,
    rps: n / (opts.durMs / 1000),
    p50: pct(0.5),
    p90: pct(0.9),
    p95: pct(0.95),
    p99: pct(0.99),
    max: n ? latencias[n - 1] : 0,
    erros,
    erroRede,
    porStatus: Object.fromEntries(porStatus),
  };
}

export function resumo(nome: string, m: Metricas): string {
  const status = Object.entries(m.porStatus)
    .map(([s, c]) => `${s}×${c}`)
    .join(" ");
  return (
    `\n━━━ ${nome} ` +
    `─`.repeat(Math.max(4, 60 - nome.length)) +
    `\n  ${m.amostras} req em ${(m.durMs / 1000).toFixed(0)}s ` +
    `(${m.rps.toFixed(1)} rps)  erros: ${m.erros} rede: ${m.erroRede}` +
    `\n  p50 ${m.p50.toFixed(0)}ms  p90 ${m.p90.toFixed(0)}ms  ` +
    `p95 ${m.p95.toFixed(0)}ms  p99 ${m.p99.toFixed(0)}ms  max ${m.max.toFixed(0)}ms` +
    (status ? `\n  status: ${status}` : "")
  );
}

/** Baseline HTTP sem auth — para calibrar o piso de rede antes dos endpoints autenticados. */
export async function sondaLatencia(url: string): Promise<ResultadoIteracao> {
  const resp = await fetch(url);
  await resp.arrayBuffer(); // consome o corpo p/ latência real
  return { status: resp.status };
}
