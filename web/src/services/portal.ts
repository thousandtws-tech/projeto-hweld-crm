import { apiFetch } from "@/lib/api";
import {
  AdicionarItemRequest,
  AtualizarItemRequest,
  BuscaProdutosResultado,
  BuscarProdutosFiltros,
  Carrinho,
  CatalogoFiltros,
  CatalogoResultado,
  CheckoutRequest,
  PedidoCheckout,
  SugestaoProduto,
  SugestoesFiltros,
} from "@/types/portal";

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function buscarProdutos(
  filtros: BuscarProdutosFiltros = {}
): Promise<BuscaProdutosResultado> {
  return apiFetch<BuscaProdutosResultado>(
    `/api/v1/portal/busca/produtos${buildQueryString(filtros as unknown as Record<string, string | number | boolean | undefined>)}`
  );
}

export async function sugerirProdutos(
  filtros: SugestoesFiltros
): Promise<SugestaoProduto[]> {
  return apiFetch<SugestaoProduto[]>(
    `/api/v1/portal/busca/sugestoes${buildQueryString(filtros as unknown as Record<string, string | number | boolean | undefined>)}`
  );
}

export async function listarCatalogo(
  filtros: CatalogoFiltros = {}
): Promise<CatalogoResultado> {
  return apiFetch<CatalogoResultado>(
    `/api/v1/portal/catalogo${buildQueryString(filtros as unknown as Record<string, string | number | boolean | undefined>)}`
  );
}

export async function obterCarrinho(): Promise<Carrinho> {
  return apiFetch<Carrinho>("/api/v1/portal/carrinho");
}

export async function adicionarItemCarrinho(
  payload: AdicionarItemRequest
): Promise<Carrinho> {
  return apiFetch<Carrinho>("/api/v1/portal/carrinho/itens", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function atualizarItemCarrinho(
  produto_id: number,
  payload: AtualizarItemRequest
): Promise<Carrinho> {
  return apiFetch<Carrinho>(`/api/v1/portal/carrinho/itens/${produto_id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removerItemCarrinho(produto_id: number): Promise<Carrinho> {
  return apiFetch<Carrinho>(`/api/v1/portal/carrinho/itens/${produto_id}`, {
    method: "DELETE",
  });
}

export async function checkout(payload: CheckoutRequest): Promise<PedidoCheckout> {
  return apiFetch<PedidoCheckout>("/api/v1/portal/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
