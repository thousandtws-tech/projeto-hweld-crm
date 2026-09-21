"use client";

import { useCallback, useState } from "react";
import {
  adicionarItemCarrinho,
  atualizarItemCarrinho,
  buscarProdutos,
  checkout,
  listarCatalogo,
  obterCarrinho,
  removerItemCarrinho,
  sugerirProdutos,
} from "@/services/portal";
import {
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

export function usePortal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const message = (err as { message: string }).message || "Erro no portal";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const buscar = useCallback(
    (filtros: BuscarProdutosFiltros = {}) =>
      withLoading<BuscaProdutosResultado>(() => buscarProdutos(filtros)),
    [withLoading]
  );

  const sugerir = useCallback(
    (filtros: SugestoesFiltros) =>
      withLoading<SugestaoProduto[]>(() => sugerirProdutos(filtros)),
    [withLoading]
  );

  const catalogo = useCallback(
    (filtros: CatalogoFiltros = {}) =>
      withLoading<CatalogoResultado>(() => listarCatalogo(filtros)),
    [withLoading]
  );

  const carrinho = useCallback(
    () => withLoading<Carrinho>(() => obterCarrinho()),
    [withLoading]
  );

  const adicionar = useCallback(
    (produto_id: number, quantidade: string) =>
      withLoading<Carrinho>(() => adicionarItemCarrinho({ produto_id, quantidade })),
    [withLoading]
  );

  const atualizar = useCallback(
    (produto_id: number, quantidade: string) =>
      withLoading<Carrinho>(() => atualizarItemCarrinho(produto_id, { produto_id, quantidade })),
    [withLoading]
  );

  const remover = useCallback(
    (produto_id: number) => withLoading<Carrinho>(() => removerItemCarrinho(produto_id)),
    [withLoading]
  );

  const finalizar = useCallback(
    (payload: CheckoutRequest) =>
      withLoading<PedidoCheckout>(() => checkout(payload)),
    [withLoading]
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
