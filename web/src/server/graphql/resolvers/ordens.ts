import { toRestInput, toRestQuery } from "@/server/graphql/bridge";
import type { Resolvers } from "@/server/graphql/generated/resolvers-types";
import type { QueryParams } from "@/server/rest/client";

const body = (input: unknown) => toRestInput(input) as Record<string, unknown>;
const query = (args: unknown) => toRestQuery(args) as QueryParams;

export const ordensResolvers: Resolvers = {
  Query: {
    ordensServico: (_p, args, ctx) =>
      ctx.api.ordensServico.listar(query(args)),
    ordemServico: (_p, { id }, ctx) => ctx.api.ordensServico.buscar(id),
  },
  Mutation: {
    criarOrdemServico: (_p, { input }, ctx) =>
      ctx.api.ordensServico.criar(body(input)),
    consumirMaterialOs: (_p, { id, produtoId, quantidade }, ctx) =>
      ctx.api.ordensServico.consumirMaterial(
        id,
        body({ produtoId, quantidade }),
      ),
    transicionarOrdemServico: (_p, { id, status, observacao }, ctx) =>
      ctx.api.ordensServico.transicionar(id, body({ status, observacao })),
  },
};
