import type { RestCall, QueryParams } from "@/server/rest/client";
import type {
  EstoqueMovimentacao,
  EstoqueSaldo,
  OrdemServico,
  Orcamento,
  OrcamentoDetalhe,
  OsDetalhe,
  OsItem,
  Pagina,
  Pedido,
  PedidoDetalhe,
  SaldoAbaixoMinimo,
} from "@/server/rest/types";

export function createOrcamentosApi(call: RestCall) {
  return {
    listar: (query: QueryParams) =>
      call<Pagina<Orcamento>>({ path: "/api/v1/orcamentos", query }),
    buscar: (id: string | number) =>
      call<OrcamentoDetalhe>({ path: `/api/v1/orcamentos/${id}` }),
    criar: (body: Record<string, unknown>) =>
      call<Orcamento>({ method: "POST", path: "/api/v1/orcamentos", body }),
    atualizarItens: (id: string | number, body: Record<string, unknown>) =>
      call<Orcamento>({
        method: "PUT",
        path: `/api/v1/orcamentos/${id}/itens`,
        body,
      }),
    transicionar: (id: string | number, status: string) =>
      call<Orcamento>({
        method: "PATCH",
        path: `/api/v1/orcamentos/${id}/status`,
        body: { status },
      }),
    converter: (id: string | number) =>
      call<Pedido>({
        method: "POST",
        path: `/api/v1/orcamentos/${id}/converter`,
      }),
  };
}

export function createPedidosApi(call: RestCall) {
  return {
    listar: (query: QueryParams) =>
      call<Pagina<Pedido>>({ path: "/api/v1/pedidos", query }),
    buscar: (id: string | number) =>
      call<PedidoDetalhe>({ path: `/api/v1/pedidos/${id}` }),
    criarManual: (body: Record<string, unknown>) =>
      call<Pedido>({ method: "POST", path: "/api/v1/pedidos", body }),
    transicionar: (id: string | number, status: string) =>
      call<Pedido>({
        method: "PATCH",
        path: `/api/v1/pedidos/${id}/status`,
        body: { status },
      }),
  };
}

export function createEstoqueApi(call: RestCall) {
  return {
    saldo: (produtoId: string | number) =>
      call<EstoqueSaldo>({ path: `/api/v1/estoque/saldo/${produtoId}` }),
    movimentacoes: (query: QueryParams) =>
      call<Pagina<EstoqueMovimentacao>>({
        path: "/api/v1/estoque/movimentacoes",
        query,
      }),
    lancar: (body: Record<string, unknown>) =>
      call<EstoqueMovimentacao>({
        method: "POST",
        path: "/api/v1/estoque/movimentacoes",
        body,
      }),
    abaixoDoMinimo: (limite?: number) =>
      call<SaldoAbaixoMinimo[]>({
        path: "/api/v1/estoque/abaixo-do-minimo",
        query: { limite },
      }),
  };
}

export function createOrdensApi(call: RestCall) {
  return {
    listar: (query: QueryParams) =>
      call<Pagina<OrdemServico>>({ path: "/api/v1/ordens-servico", query }),
    buscar: (id: string | number) =>
      call<OsDetalhe>({ path: `/api/v1/ordens-servico/${id}` }),
    criar: (body: Record<string, unknown>) =>
      call<OrdemServico>({
        method: "POST",
        path: "/api/v1/ordens-servico",
        body,
      }),
    consumirMaterial: (id: string | number, body: Record<string, unknown>) =>
      call<OsItem>({
        method: "POST",
        path: `/api/v1/ordens-servico/${id}/materiais`,
        body,
      }),
    transicionar: (id: string | number, body: Record<string, unknown>) =>
      call<OrdemServico>({
        method: "PATCH",
        path: `/api/v1/ordens-servico/${id}/status`,
        body,
      }),
  };
}
