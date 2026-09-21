import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Duas saídas:
 *
 * 1. `src/server/graphql/generated/resolvers-types.ts`
 *    Tipos dos resolvers do BFF. `mappers` aponta cada tipo GraphQL para o
 *    shape REST correspondente (snake_case): resolvers devolvem o JSON cru
 *    da API e a ponte em `bridge.ts` projeta os nomes camelCase.
 *
 * 2. `src/graphql/generated/graphql.ts`
 *    Tipos + `TypedDocumentNode` das operações `.graphql` do cliente —
 *    consumidos por `useQuery`/`useMutation` do Apollo com type inference.
 */

const REST = "@/server/rest/types";
const MAP = "@/server/graphql/mappers";

const scalars = {
  Decimal: "string",
  Date: "string",
  DateTime: "string",
  UUID: "string",
  JSON: "unknown",
};

// Tipos REST com o mesmo nome do tipo GraphQL precisam de alias no import
// gerado (`X as RestX`) — senão colidem com a declaração local do schema.
const mappers: Record<string, string> = {
  Saude: `${REST}#Saude as RestSaude`,
  Tokens: `${REST}#TokensResp`,
  ContatoSessao: `${REST}#ContatoSessao as RestContatoSessao`,
  LoginPortalPayload: `${REST}#PortalLoginResp`,

  Usuario: `${REST}#Usuario as RestUsuario`,
  UsuarioPagina: `${MAP}#UsuarioPaginaRest`,

  Empresa: `${REST}#Empresa as RestEmpresa`,
  EmpresaPagina: `${MAP}#EmpresaPaginaRest`,
  Contato: `${REST}#Contato as RestContato`,
  ContatoPagina: `${MAP}#ContatoPaginaRest`,
  Endereco: `${REST}#Endereco as RestEndereco`,
  Oportunidade: `${REST}#Oportunidade as RestOportunidade`,
  OportunidadePagina: `${MAP}#OportunidadePaginaRest`,
  Interacao: `${REST}#Interacao as RestInteracao`,
  InteracaoPagina: `${MAP}#InteracaoPaginaRest`,

  Categoria: `${REST}#Categoria as RestCategoria`,
  Produto: `${REST}#Produto as RestProduto`,
  ProdutoImagem: `${REST}#ProdutoImagem as RestProdutoImagem`,
  ProdutoDetalhe: `${REST}#ProdutoDetalhe as RestProdutoDetalhe`,
  ProdutoPagina: `${MAP}#ProdutoPaginaRest`,
  TabelaPreco: `${REST}#TabelaPreco as RestTabelaPreco`,
  TabelaPrecoItem: `${REST}#TabelaPrecoItem as RestTabelaPrecoItem`,
  TabelaPrecoDetalhe: `${REST}#TabelaDetalhe`,
  TabelaPrecoPagina: `${MAP}#TabelaPrecoPaginaRest`,

  Orcamento: `${REST}#Orcamento as RestOrcamento`,
  OrcamentoItem: `${REST}#OrcamentoItem as RestOrcamentoItem`,
  OrcamentoDetalhe: `${REST}#OrcamentoDetalhe as RestOrcamentoDetalhe`,
  OrcamentoPagina: `${MAP}#OrcamentoPaginaRest`,
  Pedido: `${REST}#Pedido as RestPedido`,
  PedidoItem: `${REST}#PedidoItem as RestPedidoItem`,
  PedidoDetalhe: `${REST}#PedidoDetalhe as RestPedidoDetalhe`,
  PedidoPagina: `${MAP}#PedidoPaginaRest`,

  EstoqueSaldo: `${REST}#EstoqueSaldo as RestEstoqueSaldo`,
  EstoqueMovimentacao: `${REST}#EstoqueMovimentacao as RestEstoqueMovimentacao`,
  EstoqueMovimentacaoPagina: `${MAP}#EstoqueMovimentacaoPaginaRest`,
  SaldoAbaixoMinimo: `${REST}#SaldoAbaixoMinimo as RestSaldoAbaixoMinimo`,

  OrdemServico: `${REST}#OrdemServico as RestOrdemServico`,
  OsItem: `${REST}#OsItem as RestOsItem`,
  OsHistorico: `${REST}#OsHistorico as RestOsHistorico`,
  OrdemServicoDetalhe: `${REST}#OsDetalhe`,
  OrdemServicoPagina: `${MAP}#OrdemServicoPaginaRest`,

  NotaFiscal: `${REST}#NotaFiscal as RestNotaFiscal`,
  NotaFiscalItem: `${REST}#NotaFiscalItem as RestNotaFiscalItem`,
  NotaFiscalDetalhe: `${REST}#NotaDetalhe`,
  NotaFiscalPagina: `${MAP}#NotaFiscalPaginaRest`,

  Pagamento: `${REST}#Pagamento as RestPagamento`,
  PagamentoPagina: `${MAP}#PagamentoPaginaRest`,
  Caixa: `${REST}#Caixa as RestCaixa`,
  CaixaMovimentacao: `${REST}#CaixaMovimentacao as RestCaixaMovimentacao`,
  CaixaPagina: `${MAP}#CaixaPaginaRest`,

  FacetaContagem: `${REST}#FacetaContagem as RestFacetaContagem`,
  Facetas: `${REST}#Facetas as RestFacetas`,
  ItemCatalogoPortal: `${REST}#ItemCatalogoPortal as RestItemCatalogoPortal`,
  CatalogoPortalPagina: `${MAP}#CatalogoPortalPaginaRest`,
  ItemBuscaPortal: `${REST}#ItemBuscaPortal as RestItemBuscaPortal`,
  ItemBuscaStaff: `${REST}#ItemBuscaStaff as RestItemBuscaStaff`,
  BuscaPortalResultado: `${MAP}#BuscaPortalResultadoRest`,
  BuscaStaffResultado: `${MAP}#BuscaStaffResultadoRest`,
  SugestaoProduto: `${REST}#SugestaoProduto as RestSugestaoProduto`,
  ReindexResultado: `${REST}#ReindexResultado as RestReindexResultado`,
  Carrinho: `${MAP}#CarrinhoRest`,
  CarrinhoItem: `${REST}#CarrinhoItem as RestCarrinhoItem`,

  LogAuditoria: `${REST}#LogAuditoria as RestLogAuditoria`,
  LogAuditoriaPagina: `${MAP}#LogAuditoriaPaginaRest`,
};

const config: CodegenConfig = {
  schema: "src/server/graphql/schema/**/*.graphql",
  generates: {
    "src/server/graphql/generated/resolvers-types.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        contextType: "@/server/graphql/context#GraphQLContext",
        scalars,
        mappers,
        defaultMapper: "Partial<{T}>",
      },
    },
    "src/graphql/generated/graphql.ts": {
      documents: "src/graphql/operations/**/*.graphql",
      plugins: ["typescript-operations", "typed-document-node"],
      config: {
        scalars,
        dedupeFragments: true,
      },
    },
  },
};

export default config;
