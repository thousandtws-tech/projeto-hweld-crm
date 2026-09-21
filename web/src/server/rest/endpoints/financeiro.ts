import type { RestCall, QueryParams } from "@/server/rest/client";
import type {
  Caixa,
  CaixaMovimentacao,
  NotaDetalhe,
  NotaFiscal,
  Pagina,
  Pagamento,
} from "@/server/rest/types";

export function createFiscalApi(call: RestCall) {
  return {
    listar: (query: QueryParams) =>
      call<Pagina<NotaFiscal>>({ path: "/api/v1/notas-fiscais", query }),
    buscar: (id: string | number) =>
      call<NotaDetalhe>({ path: `/api/v1/notas-fiscais/${id}` }),
    emitir: (pedidoId: string | number) =>
      call<NotaFiscal>({
        method: "POST",
        path: "/api/v1/notas-fiscais",
        body: { pedido_id: pedidoId },
      }),
    autorizar: (id: string | number) =>
      call<NotaFiscal>({
        method: "POST",
        path: `/api/v1/notas-fiscais/${id}/autorizar`,
      }),
    cancelar: (id: string | number, motivo: string) =>
      call<NotaFiscal>({
        method: "POST",
        path: `/api/v1/notas-fiscais/${id}/cancelar`,
        body: { motivo },
      }),
  };
}

export function createFinanceiroApi(call: RestCall) {
  return {
    pagamentos: {
      listar: (query: QueryParams) =>
        call<Pagina<Pagamento>>({ path: "/api/v1/pagamentos", query }),
      gerarParcelas: (body: Record<string, unknown>) =>
        call<Pagamento[]>({
          method: "POST",
          path: "/api/v1/pagamentos/parcelas",
          body,
        }),
      baixar: (id: string | number, body: Record<string, unknown>) =>
        call<Pagamento>({
          method: "POST",
          path: `/api/v1/pagamentos/${id}/baixar`,
          body,
        }),
      estornar: (id: string | number, motivo: string) =>
        call<Pagamento>({
          method: "POST",
          path: `/api/v1/pagamentos/${id}/estornar`,
          body: { motivo },
        }),
    },
    caixas: {
      aberto: () => call<Caixa | null>({ path: "/api/v1/caixas/aberto" }),
      listar: (query: QueryParams) =>
        call<Pagina<Caixa>>({ path: "/api/v1/caixas", query }),
      movimentacoes: (id: string | number) =>
        call<CaixaMovimentacao[]>({
          path: `/api/v1/caixas/${id}/movimentacoes`,
        }),
      abrir: (valorAbertura: string) =>
        call<Caixa>({
          method: "POST",
          path: "/api/v1/caixas/abrir",
          body: { valor_abertura: valorAbertura },
        }),
      lancar: (body: Record<string, unknown>) =>
        call<CaixaMovimentacao>({
          method: "POST",
          path: "/api/v1/caixas/lancar",
          body,
        }),
      fechar: (valorInformado: string) =>
        call<Caixa>({
          method: "POST",
          path: "/api/v1/caixas/fechar",
          body: { valor_informado: valorInformado },
        }),
    },
  };
}
