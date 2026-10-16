/**
 * Consulta direta à BrasilAPI — `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`.
 * Sem passar pelo backend: dado cadastral público, o formulário hidrata na hora.
 *
 * Preserva as proteções do antigo adapter Rust: cache em memória (cota
 * gratuita limita por IP) e retry honrando `Retry-After` em 429/5xx.
 */

const BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;

export interface DadosCnpjReceita {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  /** `descricao_situacao_cadastral` — ex.: "ATIVA", "BAIXADA". */
  situacao_cadastral: string | null;
  porte: string | null;
  cnae_fiscal: number | null;
  cnae_fiscal_descricao: string | null;
  /** CNAE vira sugestão de `segmento` no cadastro. */
  segmento_sugerido: string | null;
}

export class ErroConsultaCnpj extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroConsultaCnpj";
  }
}

/** Shape cru da BrasilAPI — só o que o formulário consome. */
interface RespostaBrasilApi {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  ddd_telefone_1?: string | null;
  email?: string | null;
  descricao_tipo_de_logradouro?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  descricao_situacao_cadastral?: string | null;
  porte?: string | null;
  cnae_fiscal?: number | null;
  cnae_fiscal_descricao?: string | null;
}

const naoVazio = (s: string | null | undefined): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

/** Normaliza o payload cru da BrasilAPI para o formato do formulário. */
export function mapearResposta(r: RespostaBrasilApi): DadosCnpjReceita {
  const logradouro =
    r.descricao_tipo_de_logradouro && r.logradouro
      ? `${r.descricao_tipo_de_logradouro} ${r.logradouro}`
      : r.logradouro;

  return {
    cnpj: r.cnpj,
    razao_social: r.razao_social,
    nome_fantasia: naoVazio(r.nome_fantasia),
    telefone: naoVazio(r.ddd_telefone_1),
    email: naoVazio(r.email),
    logradouro: naoVazio(logradouro),
    numero: naoVazio(r.numero),
    complemento: naoVazio(r.complemento),
    bairro: naoVazio(r.bairro),
    cidade: naoVazio(r.municipio),
    uf: naoVazio(r.uf),
    cep: naoVazio(r.cep),
    situacao_cadastral: naoVazio(r.descricao_situacao_cadastral),
    porte: naoVazio(r.porte),
    cnae_fiscal: r.cnae_fiscal ?? null,
    cnae_fiscal_descricao: naoVazio(r.cnae_fiscal_descricao),
    segmento_sugerido: naoVazio(r.cnae_fiscal_descricao),
  };
}

// Dado cadastral é quase estático — cache evita queimar a cota por IP (429).
const cache = new Map<string, { quando: number; dados: DadosCnpjReceita }>();

async function consultarComRetry(cnpj: string): Promise<Response> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(`${BRASILAPI_URL}/${cnpj}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const status = res.status;
      if (tentativa < 2 && (status === 429 || status === 502 || status === 503 || status === 504)) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const espera = Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 900, 4_000);
        await new Promise((r) => setTimeout(r, espera));
        continue;
      }
      return res;
    } catch (e) {
      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 900));
        continue;
      }
      throw e;
    }
  }
  throw new Error("unreachable");
}

/**
 * Consulta o CNPJ (14 dígitos, já validado pelo módulo-11 antes de chamar).
 * Lança `ErroConsultaCnpj` — `status` 404 = não encontrado, demais = indisponível.
 */
export async function consultarCnpjReceita(cnpjDigitos: string): Promise<DadosCnpjReceita> {
  const hit = cache.get(cnpjDigitos);
  if (hit && Date.now() - hit.quando < CACHE_TTL_MS) return hit.dados;

  const res = await consultarComRetry(cnpjDigitos);

  if (res.status === 404) {
    throw new ErroConsultaCnpj(404, "CNPJ não encontrado na base da Receita.");
  }
  if (!res.ok) {
    throw new ErroConsultaCnpj(res.status, `BrasilAPI respondeu ${res.status}.`);
  }

  const dados = mapearResposta((await res.json()) as RespostaBrasilApi);
  cache.set(cnpjDigitos, { quando: Date.now(), dados });
  return dados;
}
