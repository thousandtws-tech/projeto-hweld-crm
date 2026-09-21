import { toRestInput, toRestQuery } from "@/server/graphql/bridge";
import type { Resolvers } from "@/server/graphql/generated/resolvers-types";
import type { QueryParams } from "@/server/rest/client";

const body = (input: unknown) => toRestInput(input) as Record<string, unknown>;
const query = (args: unknown) => toRestQuery(args) as QueryParams;

export const financeiroResolvers: Resolvers = {
  Query: {
    notasFiscais: (_p, args, ctx) => ctx.api.notasFiscais.listar(query(args)),
    notaFiscal: (_p, { id }, ctx) => ctx.api.notasFiscais.buscar(id),

    pagamentos: (_p, args, ctx) => ctx.api.pagamentos.listar(query(args)),

    caixaAberto: (_p, _a, ctx) => ctx.api.caixas.aberto(),
    caixas: (_p, args, ctx) => ctx.api.caixas.listar(query(args)),
    caixaMovimentacoes: (_p, { caixaId }, ctx) =>
      ctx.api.caixas.movimentacoes(caixaId),
  },
  Mutation: {
    emitirNotaFiscal: (_p, { pedidoId }, ctx) =>
      ctx.api.notasFiscais.emitir(Number(pedidoId)),
    autorizarNotaFiscal: (_p, { id }, ctx) => ctx.api.notasFiscais.autorizar(id),
    cancelarNotaFiscal: (_p, { id, motivo }, ctx) =>
      ctx.api.notasFiscais.cancelar(id, motivo),

    gerarParcelas: (_p, { input }, ctx) =>
      ctx.api.pagamentos.gerarParcelas(body(input)),
    baixarPagamento: (_p, { id, input }, ctx) =>
      ctx.api.pagamentos.baixar(id, body(input)),
    estornarPagamento: (_p, { id, motivo }, ctx) =>
      ctx.api.pagamentos.estornar(id, motivo),

    abrirCaixa: (_p, { valorAbertura }, ctx) =>
      ctx.api.caixas.abrir(valorAbertura),
    lancarCaixa: (_p, { input }, ctx) => ctx.api.caixas.lancar(body(input)),
    fecharCaixa: (_p, { valorInformado }, ctx) =>
      ctx.api.caixas.fechar(valorInformado),
  },
};
