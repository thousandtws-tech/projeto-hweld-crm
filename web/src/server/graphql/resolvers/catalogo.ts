import { toRestInput, toRestQuery } from "@/server/graphql/bridge";
import type { Resolvers } from "@/server/graphql/generated/resolvers-types";
import type { QueryParams } from "@/server/rest/client";

const body = (input: unknown) => toRestInput(input) as Record<string, unknown>;
const query = (args: unknown) => toRestQuery(args) as QueryParams;

export const catalogoResolvers: Resolvers = {
  Query: {
    categorias: (_p, { somenteAtivas }, ctx) =>
      ctx.api.categorias.listar(somenteAtivas ?? undefined),

    produtos: (_p, args, ctx) => ctx.api.produtos.listar(query(args)),
    produto: (_p, { id }, ctx) => ctx.api.produtos.buscar(id),

    tabelasPreco: (_p, args, ctx) => ctx.api.tabelasPreco.listar(query(args)),
    tabelaPreco: (_p, { id }, ctx) => ctx.api.tabelasPreco.buscar(id),
  },
  Mutation: {
    criarCategoria: (_p, { input }, ctx) =>
      ctx.api.categorias.criar(body(input)),
    atualizarCategoria: (_p, { id, input }, ctx) =>
      ctx.api.categorias.atualizar(id, body(input)),

    criarProduto: (_p, { input }, ctx) => ctx.api.produtos.criar(body(input)),
    atualizarProduto: (_p, { id, input }, ctx) =>
      ctx.api.produtos.atualizar(id, body(input)),
    arquivarProduto: async (_p, { id }, ctx) => {
      await ctx.api.produtos.arquivar(id);
      return true;
    },

    criarTabelaPreco: (_p, { input }, ctx) =>
      ctx.api.tabelasPreco.criar(body(input)),
    atualizarTabelaPreco: (_p, { id, input }, ctx) =>
      ctx.api.tabelasPreco.atualizar(id, body(input)),
    definirPrecoTabela: (_p, { tabelaId, produtoId, preco }, ctx) =>
      ctx.api.tabelasPreco.definirPreco(
        tabelaId,
        body({ produtoId, preco }),
      ),
    removerItemTabela: async (_p, { tabelaId, produtoId }, ctx) => {
      await ctx.api.tabelasPreco.removerItem(tabelaId, produtoId);
      return true;
    },
  },
};
