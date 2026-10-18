import type { ResultadoIteracao } from "./carga";

/**
 * Iteração HTTP para medição — NÃO usa o helper `req` do e2e porque o
 * retry-on-429 embutido distorceria a latência (espera incluída na
 * amostra). O consumo do corpo é necessário para a medida de resposta
 * completa (TTFB + transferência).
 */
export function criarIteracao(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  return async (): Promise<ResultadoIteracao> => {
    const resp = await fetch(url, { headers });
    await resp.arrayBuffer();
    return { status: resp.status };
  };
}
