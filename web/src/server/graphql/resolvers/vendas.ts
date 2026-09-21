import { toRestInput, toRestQuery } from "@/server/graphql/bridge";
import type { Resolvers } from "@/server/graphql/generated/resolvers-types";
import type { QueryParams } from "@/server/rest/client";

const body = (input: unknown) => toRestInput(input) as Record<string, unknown>;
const query = (args: unknown) => toRestQuery(args) as QueryParams;

export const vendasResolvers: Resolvers = {
  Query: {
    orcamentos: (_p, args, ctx) => ctx.api.orcamentos.listar(query(args)),
    orcamento: (_p, { id }, ctx) => ctx.api.orcamentos.buscar(id),

    pedidos: (_p, args, ctx) => ctx.api.pedidos.listar(query(args)),
    pedido: (_p, { id }, ctx) => ctx.api.pedidos.buscar(id),

    estoqueSaldo: (_p, { produtoId }, ctx) => ctx.api.estoque.saldo(produtoId),
    estoqueMovimentacoes: (_p, args, ctx) =>
      ctx.api.estoque.movimentacoes(query(args)),
    estoqueAbaixoDoMinimo: (_p, { limite }, ctx) =>
      ctx.api.estoque.abaixoDoMinimo(limite ?? undefined),
  },
  Mutation: {
    criarOrcamento: (_p, { input }, ctx) =>
      ctx.api.orcamentos.criar(body(input)),
    atualizarItensOrcamento: (_p, { id, input }, ctx) =>
      ctx.api.orcamentos.atualizarItens(id, body(input)),
    transicionarOrcamento: (_p, { id, status }, ctx) =>
      ctx.api.orcamentos.transicionar(id, status),
    converterOrcamento: (_p, { id }, ctx) => ctx.api.orcamentos.converter(id),

    criarPedidoManual: (_p, { input }, ctx) =>
      ctx.api.pedidos.criarManual(body(input)),
    transicionarPedido: (_p, { id, status }, ctx) =>
      ctx.api.pedidos.transicionar(id, status),

    lancarMovimentacaoEstoque: (_p, { input }, ctx) =>
      ctx.api.estoque.lancar(body(input)),
  },
};
