import { toRestInput, toRestQuery } from "@/server/graphql/bridge";
import type { Resolvers } from "@/server/graphql/generated/resolvers-types";
import type { QueryParams } from "@/server/rest/client";

const body = (input: unknown) => toRestInput(input) as Record<string, unknown>;
const query = (args: unknown) => toRestQuery(args) as QueryParams;

export const portalResolvers: Resolvers = {
  Query: {
    catalogoPortal: (_p, args, ctx) => ctx.api.portal.catalogo(query(args)),
    buscarProdutosPortal: (_p, args, ctx) =>
      ctx.api.portal.buscarProdutos(query(args)),
    sugerirProdutosPortal: (_p, { q, limite }, ctx) =>
      ctx.api.portal.sugerirProdutos({ q, limite: limite ?? undefined }),
    carrinhoPortal: (_p, _a, ctx) => ctx.api.portal.carrinho.atual(),

    buscarProdutosStaff: (_p, args, ctx) =>
      ctx.api.busca.buscarStaff(query(args)),

    auditoria: (_p, args, ctx) => ctx.api.auditoria.listar(query(args)),
  },
  Mutation: {
    adicionarItemCarrinho: (_p, { produtoId, quantidade }, ctx) =>
      ctx.api.portal.carrinho.adicionar(body({ produtoId, quantidade }) as {
        produto_id: number;
        quantidade: string;
      }),
    atualizarItemCarrinho: (_p, { produtoId, quantidade }, ctx) =>
      ctx.api.portal.carrinho.atualizarItem(
        produtoId,
        body({ produtoId, quantidade }) as {
          produto_id: number;
          quantidade: string;
        },
      ),
    removerItemCarrinho: (_p, { produtoId }, ctx) =>
      ctx.api.portal.carrinho.removerItem(produtoId),
    checkoutPortal: (_p, { input }, ctx) =>
      ctx.api.portal.checkout(body(input)),

    reindexarBusca: (_p, _a, ctx) => ctx.api.busca.reindexar(),
  },
};
