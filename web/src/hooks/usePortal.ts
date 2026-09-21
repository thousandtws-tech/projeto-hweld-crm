"use client";

import { useApolloClient } from "@apollo/client/react";
import { useCallback, useState } from "react";

import {
  AdicionarItemCarrinhoDocument,
  AtualizarItemCarrinhoDocument,
  BuscarProdutosPortalDocument,
  CarrinhoPortalDocument,
  CatalogoPortalDocument,
  CheckoutPortalDocument,
  RemoverItemCarrinhoDocument,
  SugerirProdutosPortalDocument,
  type AdicionarItemCarrinhoMutationVariables,
  type BuscarProdutosPortalQueryVariables,
  type CatalogoPortalQueryVariables,
  type CheckoutInput,
  type SugerirProdutosPortalQueryVariables,
} from "@/graphql/generated/graphql";

export type CatalogoFiltros = CatalogoPortalQueryVariables;
export type BuscarProdutosFiltros = BuscarProdutosPortalQueryVariables;
export type SugestoesFiltros = SugerirProdutosPortalQueryVariables;
type ProdutoId = AdicionarItemCarrinhoMutationVariables["produtoId"];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message || fallback : fallback;
}

/**
 * Portal B2B — catálogo precificado, busca, carrinho e checkout via GraphQL.
 * O Bearer token do contato é injetado pelo auth link do Apollo.
 */
export function usePortal() {
  const client = useApolloClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        setError(errorMessage(err, "Erro no portal"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const buscar = useCallback(
    (filtros: BuscarProdutosFiltros = {}) =>
      withLoading(async () => {
        const { data } = await client.query({
          query: BuscarProdutosPortalDocument,
          variables: filtros,
          fetchPolicy: "network-only",
        });
        return data.buscarProdutosPortal;
      }),
    [client, withLoading],
  );

  const sugerir = useCallback(
    (filtros: SugestoesFiltros) =>
      withLoading(async () => {
        const { data } = await client.query({
          query: SugerirProdutosPortalDocument,
          variables: filtros,
          fetchPolicy: "network-only",
        });
        return data.sugerirProdutosPortal;
      }),
    [client, withLoading],
  );

  const catalogo = useCallback(
    (filtros: CatalogoFiltros = {}) =>
      withLoading(async () => {
        const { data } = await client.query({
          query: CatalogoPortalDocument,
          variables: filtros,
          fetchPolicy: "network-only",
        });
        return data.catalogoPortal;
      }),
    [client, withLoading],
  );

  const carrinho = useCallback(
    () =>
      withLoading(async () => {
        const { data } = await client.query({
          query: CarrinhoPortalDocument,
          fetchPolicy: "network-only",
        });
        return data.carrinhoPortal;
      }),
    [client, withLoading],
  );

  const adicionar = useCallback(
    (produtoId: ProdutoId, quantidade: string) =>
      withLoading(async () => {
        const { data } = await client.mutate({
          mutation: AdicionarItemCarrinhoDocument,
          variables: { produtoId, quantidade },
        });
        if (!data?.adicionarItemCarrinho) {
          throw new Error("Resposta inválida do carrinho");
        }
        return data.adicionarItemCarrinho;
      }),
    [client, withLoading],
  );

  const atualizar = useCallback(
    (produtoId: ProdutoId, quantidade: string) =>
      withLoading(async () => {
        const { data } = await client.mutate({
          mutation: AtualizarItemCarrinhoDocument,
          variables: { produtoId, quantidade },
        });
        if (!data?.atualizarItemCarrinho) {
          throw new Error("Resposta inválida do carrinho");
        }
        return data.atualizarItemCarrinho;
      }),
    [client, withLoading],
  );

  const remover = useCallback(
    (produtoId: ProdutoId) =>
      withLoading(async () => {
        const { data } = await client.mutate({
          mutation: RemoverItemCarrinhoDocument,
          variables: { produtoId },
        });
        if (!data?.removerItemCarrinho) {
          throw new Error("Resposta inválida do carrinho");
        }
        return data.removerItemCarrinho;
      }),
    [client, withLoading],
  );

  const finalizar = useCallback(
    (input: CheckoutInput) =>
      withLoading(async () => {
        const { data } = await client.mutate({
          mutation: CheckoutPortalDocument,
          variables: { input },
        });
        if (!data?.checkoutPortal) {
          throw new Error("Resposta inválida do checkout");
        }
        await client.refetchQueries({ include: [CarrinhoPortalDocument] });
        return data.checkoutPortal;
      }),
    [client, withLoading],
  );

  return {
    loading,
    error,
    buscar,
    sugerir,
    catalogo,
    carrinho,
    adicionar,
    atualizar,
    remover,
    finalizar,
  };
}
