import { portalToken, req, staffToken, type PortalCreds } from "./api";
import { CFG } from "./env";

/**
 * Fábricas de dados de teste — cada spec semeia o próprio cenário via API
 * (mesmo caminho do smoke_test.py), com identificadores únicos por execução.
 * Nada é apagado depois: unicidade torna re-runs seguras em base compartilhada.
 */

const rand = (n: number) => Math.floor(Math.random() * n);

/** Tag única por CHAMADA — nomes com slug_uk (categoria/produto) não podem repetir. */
const novoTag = () => `${Date.now().toString(36)}${rand(1e9).toString(36)}`;

/** Sufixo único por chamada — nomes de entidades buscáveis e dedup-safe. */
export function sufixoTeste(): string {
  return novoTag();
}

export function emailUnico(prefixo = "e2e"): string {
  return `${prefixo}.${novoTag()}@hweld.dev`;
}

export function skuUnico(): string {
  return `E2E-${novoTag().toUpperCase()}`;
}

/** CNPJ válido (dígitos verificadores reais) — o backend valida checksum. */
export function cnpjValido(): string {
  const base = Array.from({ length: 8 }, () => rand(10)).concat([0, 0, 0, 1]);
  const dv1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = dv([...base, dv1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d = [...base, dv1, dv2];
  return `${d.slice(0, 2).join("")}.${d.slice(2, 5).join("")}.${d.slice(5, 8).join("")}/${d.slice(8, 12).join("")}-${d.slice(12).join("")}`;

  function dv(digitos: number[], pesos: number[]): number {
    const soma = digitos.reduce((acc, n, i) => acc + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }
}

export interface Cenario {
  empresaId: number;
  enderecoId: number;
  contatoId: number;
  portal: PortalCreds;
  categoriaId: number;
  produtoId: number;
  produtoNome: string;
  sku: string;
}

interface IdResp {
  id: number;
}

/**
 * Semeia o cenário mínimo para jornadas de compra:
 * empresa → endereço → contato c/ acesso portal → categoria → produto → estoque.
 * Tudo via API staff — sem SQL, sem fixture externa.
 */
export async function seedCenario(opts: { preco?: string; estoque?: string } = {}): Promise<Cenario> {
  const staff = await staffToken();
  const tag = novoTag();

  const emp = await req<IdResp>(CFG.coreApi, "POST", "/api/v1/empresas", {
    token: staff,
    body: {
      razao_social: `E2E Metalúrgica ${tag} LTDA`,
      cnpj: cnpjValido(),
      status: "ativo",
    },
  });
  if (emp.status !== 201) throw new Error(`seed empresa: ${emp.status} ${JSON.stringify(emp.body)}`);

  const end = await req<IdResp>(CFG.coreApi, "POST", "/api/v1/enderecos", {
    token: staff,
    body: {
      empresa_id: emp.body.id,
      tipo: "fiscal",
      cidade: "São Paulo",
      uf: "SP",
      cep: "01310-100",
      logradouro: "Av. Paulista",
      numero: "1000",
      principal: true,
    },
  });
  if (end.status !== 201) throw new Error(`seed endereco: ${end.status} ${JSON.stringify(end.body)}`);

  const portal: PortalCreds = { email: emailUnico("comprador"), senha: "e2e#portal123" };
  const ct = await req<IdResp>(CFG.coreApi, "POST", "/api/v1/contatos", {
    token: staff,
    body: {
      empresa_id: emp.body.id,
      nome: "Comprador E2E",
      email: portal.email,
      is_principal: true,
      acesso_portal: true,
    },
  });
  if (ct.status !== 201) throw new Error(`seed contato: ${ct.status} ${JSON.stringify(ct.body)}`);

  const ativar = await req(CFG.coreApi, "POST", `/api/v1/contatos/${ct.body.id}/portal`, {
    token: staff,
    body: { senha: portal.senha },
  });
  if (ativar.status !== 204) {
    throw new Error(`seed portal: ${ativar.status} ${JSON.stringify(ativar.body)}`);
  }

  const cat = await req<IdResp>(CFG.coreApi, "POST", "/api/v1/categorias", {
    token: staff,
    body: { nome: `E2E Categoria ${tag}`, ordem: 99, ativa: true },
  });
  if (cat.status !== 201) throw new Error(`seed categoria: ${cat.status} ${JSON.stringify(cat.body)}`);

  const sku = skuUnico();
  const prod = await req<IdResp>(CFG.coreApi, "POST", "/api/v1/produtos", {
    token: staff,
    body: {
      sku,
      nome: `Eletrodo E2E ${tag}`,
      categoria_id: cat.body.id,
      preco_venda: opts.preco ?? "25.90",
      controla_estoque: true,
      ativo: true,
      destaque: false,
    },
  });
  if (prod.status !== 201) throw new Error(`seed produto: ${prod.status} ${JSON.stringify(prod.body)}`);

  const est = await req(CFG.coreApi, "POST", "/api/v1/estoque/movimentacoes", {
    token: staff,
    body: {
      produto_id: prod.body.id,
      tipo: "entrada",
      quantidade: opts.estoque ?? "100",
      motivo: "carga e2e",
    },
  });
  if (est.status !== 201) throw new Error(`seed estoque: ${est.status} ${JSON.stringify(est.body)}`);

  return {
    empresaId: emp.body.id,
    enderecoId: end.body.id,
    contatoId: ct.body.id,
    portal,
    categoriaId: cat.body.id,
    produtoId: prod.body.id,
    produtoNome: `Eletrodo E2E ${tag}`,
    sku,
  };
}

/**
 * Jornada mínima de compra via API portal: carrinho → checkout.
 * Devolve o pedido criado (`id`, `numero`, `status`, `total`).
 */
export async function comprarPeloPortal(
  cenario: Cenario,
  quantidade = "2",
): Promise<{ id: number; numero: string; status: string; total: string }> {
  const ptoken = await portalToken(cenario.portal);

  const add = await req(CFG.coreApi, "POST", "/api/v1/portal/carrinho/itens", {
    token: ptoken,
    body: { produto_id: cenario.produtoId, quantidade },
  });
  if (add.status !== 200) throw new Error(`carrinho add: ${add.status} ${JSON.stringify(add.body)}`);

  const ped = await req<{ id: number; numero: string; status: string; total: string }>(
    CFG.coreApi,
    "POST",
    "/api/v1/portal/checkout",
    {
      token: ptoken,
      body: {
        endereco_faturamento_id: cenario.enderecoId,
        endereco_entrega_id: cenario.enderecoId,
      },
    },
  );
  if (ped.status !== 201) throw new Error(`checkout: ${ped.status} ${JSON.stringify(ped.body)}`);
  return ped.body;
}
