import type { RestCall, QueryParams } from "@/server/rest/client";
import type {
  BuscaPaginada,
  CarrinhoDetalhe,
  ItemBuscaPortal,
  ItemBuscaStaff,
  ItemCatalogoPortal,
  LogAuditoria,
  Pagina,
  Pedido,
  ReindexResultado,
  Saude,
  SugestaoProduto,
} from "@/server/rest/types";

export function createPortalApi(call: RestCall) {
  return {
    catalogo: (query: QueryParams) =>
      call<Pagina<ItemCatalogoPortal>>({
        path: "/api/v1/portal/catalogo",
        query,
      }),
    buscarProdutos: (query: QueryParams) =>
      call<BuscaPaginada<ItemBuscaPortal>>({
        path: "/api/v1/portal/busca/produtos",
        query,
      }),
    sugerirProdutos: (query: QueryParams) =>
      call<SugestaoProduto[]>({
        path: "/api/v1/portal/busca/sugestoes",
        query,
      }),
    carrinho: {
      atual: () => call<CarrinhoDetalhe>({ path: "/api/v1/portal/carrinho" }),
      adicionar: (body: { produto_id: number; quantidade: string }) =>
        call<CarrinhoDetalhe>({
          method: "POST",
          path: "/api/v1/portal/carrinho/itens",
          body,
        }),
      atualizarItem: (
        produtoId: string | number,
        body: { produto_id: number; quantidade: string },
      ) =>
        call<CarrinhoDetalhe>({
          method: "PUT",
          path: `/api/v1/portal/carrinho/itens/${produtoId}`,
          body,
        }),
      removerItem: (produtoId: string | number) =>
        call<CarrinhoDetalhe>({
          method: "DELETE",
          path: `/api/v1/portal/carrinho/itens/${produtoId}`,
        }),
    },
    checkout: (body: Record<string, unknown>) =>
      call<Pedido>({ method: "POST", path: "/api/v1/portal/checkout", body }),
  };
}

export function createBuscaApi(call: RestCall) {
  return {
    buscarStaff: (query: QueryParams) =>
      call<BuscaPaginada<ItemBuscaStaff>>({
        path: "/api/v1/busca/produtos",
        query,
      }),
    reindexar: () =>
      call<ReindexResultado>({
        method: "POST",
        path: "/api/v1/busca/reindexar",
      }),
  };
}

export function createAuditoriaApi(call: RestCall) {
  return {
    listar: (query: QueryParams) =>
      call<Pagina<LogAuditoria>>({ path: "/api/v1/auditoria", query }),
  };
}

export function createSaudeApi(call: RestCall) {
  return {
    health: () => call<Saude>({ path: "/health" }),
    ready: () => call<Saude>({ path: "/ready" }),
  };
}
