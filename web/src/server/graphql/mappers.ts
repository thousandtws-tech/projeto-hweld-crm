/**
 * Aliases de tipos REST para os `mappers` do codegen — o codegen referencia
 * estes nomes como tipo "fonte" (parent) dos resolvers: resolvers devolvem
 * o JSON cru da API e a ponte `bridge.ts` projeta camelCase↔snake_case.
 */
import type {
  BuscaPaginada,
  Caixa,
  CarrinhoDetalhe,
  Contato,
  Empresa,
  EstoqueMovimentacao,
  Interacao,
  ItemBuscaPortal,
  ItemBuscaStaff,
  ItemCatalogoPortal,
  LogAuditoria,
  NotaFiscal,
  Oportunidade,
  Orcamento,
  OrdemServico,
  Pagamento,
  Pagina,
  Pedido,
  Produto,
  TabelaPreco,
  Usuario,
} from "@/server/rest/types";

export type UsuarioPaginaRest = Pagina<Usuario>;
export type EmpresaPaginaRest = Pagina<Empresa>;
export type OportunidadePaginaRest = Pagina<Oportunidade>;
export type InteracaoPaginaRest = Pagina<Interacao>;
export type ProdutoPaginaRest = Pagina<Produto>;
export type TabelaPrecoPaginaRest = Pagina<TabelaPreco>;
export type OrcamentoPaginaRest = Pagina<Orcamento>;
export type PedidoPaginaRest = Pagina<Pedido>;
export type OrdemServicoPaginaRest = Pagina<OrdemServico>;
export type EstoqueMovimentacaoPaginaRest = Pagina<EstoqueMovimentacao>;
export type NotaFiscalPaginaRest = Pagina<NotaFiscal>;
export type PagamentoPaginaRest = Pagina<Pagamento>;
export type CaixaPaginaRest = Pagina<Caixa>;
export type LogAuditoriaPaginaRest = Pagina<LogAuditoria>;
export type CatalogoPortalPaginaRest = Pagina<ItemCatalogoPortal>;
export type BuscaPortalResultadoRest = BuscaPaginada<ItemBuscaPortal>;
export type BuscaStaffResultadoRest = BuscaPaginada<ItemBuscaStaff>;
export type CarrinhoRest = CarrinhoDetalhe;
export type ContatoPaginaRest = Pagina<Contato>;
