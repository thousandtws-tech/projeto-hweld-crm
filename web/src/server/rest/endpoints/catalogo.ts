import type { RestCall, QueryParams } from "@/server/rest/client";
import type {
  Categoria,
  Pagina,
  Produto,
  ProdutoDetalhe,
  TabelaDetalhe,
  TabelaPreco,
  TabelaPrecoItem,
} from "@/server/rest/types";

export function createCatalogoApi(call: RestCall) {
  return {
    categorias: {
      listar: (somenteAtivas?: boolean) =>
        call<Categoria[]>({
          path: "/api/v1/categorias",
          query: { somente_ativas: somenteAtivas },
        }),
      criar: (body: Record<string, unknown>) =>
        call<Categoria>({ method: "POST", path: "/api/v1/categorias", body }),
      atualizar: (id: string | number, body: Record<string, unknown>) =>
        call<Categoria>({
          method: "PATCH",
          path: `/api/v1/categorias/${id}`,
          body,
        }),
    },
    produtos: {
      listar: (query: QueryParams) =>
        call<Pagina<Produto>>({ path: "/api/v1/produtos", query }),
      buscar: (id: string | number) =>
        call<ProdutoDetalhe>({ path: `/api/v1/produtos/${id}` }),
      criar: (body: Record<string, unknown>) =>
        call<Produto>({ method: "POST", path: "/api/v1/produtos", body }),
      atualizar: (id: string | number, body: Record<string, unknown>) =>
        call<Produto>({
          method: "PATCH",
          path: `/api/v1/produtos/${id}`,
          body,
        }),
      arquivar: (id: string | number) =>
        call<void>({ method: "DELETE", path: `/api/v1/produtos/${id}` }),
    },
    tabelasPreco: {
      listar: (query: QueryParams) =>
        call<Pagina<TabelaPreco>>({ path: "/api/v1/tabelas-preco", query }),
      buscar: (id: string | number) =>
        call<TabelaDetalhe>({ path: `/api/v1/tabelas-preco/${id}` }),
      criar: (body: Record<string, unknown>) =>
        call<TabelaPreco>({
          method: "POST",
          path: "/api/v1/tabelas-preco",
          body,
        }),
      atualizar: (id: string | number, body: Record<string, unknown>) =>
        call<TabelaPreco>({
          method: "PATCH",
          path: `/api/v1/tabelas-preco/${id}`,
          body,
        }),
      definirPreco: (id: string | number, body: Record<string, unknown>) =>
        call<TabelaPrecoItem>({
          method: "POST",
          path: `/api/v1/tabelas-preco/${id}/itens`,
          body,
        }),
      removerItem: (id: string | number, produtoId: string | number) =>
        call<void>({
          method: "DELETE",
          path: `/api/v1/tabelas-preco/${id}/itens/${produtoId}`,
        }),
    },
  };
}
