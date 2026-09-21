import type { Resolvers } from "@/server/graphql/generated/resolvers-types";

export const authResolvers: Resolvers = {
  Query: {
    health: (_p, _a, ctx) => ctx.api.saude.health(),
    ready: (_p, _a, ctx) => ctx.api.saude.ready(),
  },
  Mutation: {
    loginStaff: (_p, { email, senha }, ctx) =>
      ctx.api.auth.loginStaff({ email, senha }),
    loginPortal: (_p, { email, senha }, ctx) =>
      ctx.api.auth.loginPortal({ email, senha }),
    refreshSession: (_p, { refreshToken }, ctx) =>
      ctx.api.auth.refresh(refreshToken),
    logout: async (_p, { refreshToken }, ctx) => {
      await ctx.api.auth.logout(refreshToken);
      return true;
    },
    trocarSenha: async (_p, { senhaAtual, novaSenha }, ctx) => {
      await ctx.api.auth.trocarSenha({
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });
      return true;
    },
  },
};
