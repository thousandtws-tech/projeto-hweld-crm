import { toRestInput, toRestQuery } from "@/server/graphql/bridge";
import type { Resolvers } from "@/server/graphql/generated/resolvers-types";
import type { QueryParams } from "@/server/rest/client";

export const usuariosResolvers: Resolvers = {
  Query: {
    usuarios: (_p, args, ctx) =>
      ctx.api.usuarios.listar(toRestQuery(args) as QueryParams),
    usuario: (_p, { id }, ctx) => ctx.api.usuarios.buscar(id),
  },
  Mutation: {
    criarUsuario: (_p, { input }, ctx) =>
      ctx.api.usuarios.criar(
        toRestInput(input) as Record<string, unknown>,
      ),
    atualizarUsuario: (_p, { id, input }, ctx) =>
      ctx.api.usuarios.atualizar(
        id,
        toRestInput(input) as Record<string, unknown>,
      ),
    definirUsuarioAtivo: async (_p, { id, ativo }, ctx) => {
      await ctx.api.usuarios.definirAtivo(id, ativo);
      return true;
    },
  },
};
