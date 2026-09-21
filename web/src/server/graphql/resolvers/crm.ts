import { toRestInput, toRestQuery } from "@/server/graphql/bridge";
import type { Resolvers } from "@/server/graphql/generated/resolvers-types";
import type { QueryParams } from "@/server/rest/client";

const body = (input: unknown) => toRestInput(input) as Record<string, unknown>;
const query = (args: unknown) => toRestQuery(args) as QueryParams;

export const crmResolvers: Resolvers = {
  Query: {
    empresas: (_p, args, ctx) => ctx.api.empresas.listar(query(args)),
    empresa: (_p, { id }, ctx) => ctx.api.empresas.buscar(id),

    contatos: (_p, args, ctx) => ctx.api.contatos.listar(query(args)),
    contato: (_p, { id }, ctx) => ctx.api.contatos.buscar(id),

    enderecos: (_p, { empresaId, tipo }, ctx) =>
      ctx.api.enderecos.listar(empresaId, tipo ?? undefined),

    oportunidades: (_p, args, ctx) =>
      ctx.api.oportunidades.listar(query(args)),
    oportunidade: (_p, { id }, ctx) => ctx.api.oportunidades.buscar(id),

    interacoes: (_p, args, ctx) => ctx.api.interacoes.timeline(query(args)),
  },
  Mutation: {
    criarEmpresa: (_p, { input }, ctx) => ctx.api.empresas.criar(body(input)),
    atualizarEmpresa: (_p, { id, input }, ctx) =>
      ctx.api.empresas.atualizar(id, body(input)),
    arquivarEmpresa: async (_p, { id }, ctx) => {
      await ctx.api.empresas.arquivar(id);
      return true;
    },

    criarContato: (_p, { input }, ctx) => ctx.api.contatos.criar(body(input)),
    atualizarContato: (_p, { id, input }, ctx) =>
      ctx.api.contatos.atualizar(id, body(input)),
    ativarPortalContato: async (_p, { id, senha }, ctx) => {
      await ctx.api.contatos.ativarPortal(id, senha);
      return true;
    },
    desativarPortalContato: async (_p, { id }, ctx) => {
      await ctx.api.contatos.desativarPortal(id);
      return true;
    },
    arquivarContato: async (_p, { id }, ctx) => {
      await ctx.api.contatos.arquivar(id);
      return true;
    },

    criarEndereco: (_p, { input }, ctx) =>
      ctx.api.enderecos.criar(body(input)),
    atualizarEndereco: (_p, { id, input }, ctx) =>
      ctx.api.enderecos.atualizar(id, body(input)),
    removerEndereco: async (_p, { id }, ctx) => {
      await ctx.api.enderecos.remover(id);
      return true;
    },

    criarOportunidade: (_p, { input }, ctx) =>
      ctx.api.oportunidades.criar(body(input)),
    atualizarOportunidade: (_p, { id, input }, ctx) =>
      ctx.api.oportunidades.atualizar(id, body(input)),
    moverEstagioOportunidade: (_p, { id, estagio, motivoPerda }, ctx) =>
      ctx.api.oportunidades.moverEstagio(
        id,
        body({ estagio, motivoPerda }),
      ),

    registrarInteracao: (_p, { input }, ctx) =>
      ctx.api.interacoes.registrar(body(input)),
  },
};
