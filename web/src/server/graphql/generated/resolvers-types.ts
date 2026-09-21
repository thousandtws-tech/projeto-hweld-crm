import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { Saude as RestSaude, TokensResp, ContatoSessao as RestContatoSessao, PortalLoginResp, Usuario as RestUsuario, Empresa as RestEmpresa, Contato as RestContato, Endereco as RestEndereco, Oportunidade as RestOportunidade, Interacao as RestInteracao, Categoria as RestCategoria, Produto as RestProduto, ProdutoImagem as RestProdutoImagem, ProdutoDetalhe as RestProdutoDetalhe, TabelaPreco as RestTabelaPreco, TabelaPrecoItem as RestTabelaPrecoItem, TabelaDetalhe, Orcamento as RestOrcamento, OrcamentoItem as RestOrcamentoItem, OrcamentoDetalhe as RestOrcamentoDetalhe, Pedido as RestPedido, PedidoItem as RestPedidoItem, PedidoDetalhe as RestPedidoDetalhe, EstoqueSaldo as RestEstoqueSaldo, EstoqueMovimentacao as RestEstoqueMovimentacao, SaldoAbaixoMinimo as RestSaldoAbaixoMinimo, OrdemServico as RestOrdemServico, OsItem as RestOsItem, OsHistorico as RestOsHistorico, OsDetalhe, NotaFiscal as RestNotaFiscal, NotaFiscalItem as RestNotaFiscalItem, NotaDetalhe, Pagamento as RestPagamento, Caixa as RestCaixa, CaixaMovimentacao as RestCaixaMovimentacao, FacetaContagem as RestFacetaContagem, Facetas as RestFacetas, ItemCatalogoPortal as RestItemCatalogoPortal, ItemBuscaPortal as RestItemBuscaPortal, ItemBuscaStaff as RestItemBuscaStaff, SugestaoProduto as RestSugestaoProduto, ReindexResultado as RestReindexResultado, CarrinhoItem as RestCarrinhoItem, LogAuditoria as RestLogAuditoria } from '@/server/rest/types';
import { UsuarioPaginaRest, EmpresaPaginaRest, ContatoPaginaRest, OportunidadePaginaRest, InteracaoPaginaRest, ProdutoPaginaRest, TabelaPrecoPaginaRest, OrcamentoPaginaRest, PedidoPaginaRest, EstoqueMovimentacaoPaginaRest, OrdemServicoPaginaRest, NotaFiscalPaginaRest, PagamentoPaginaRest, CaixaPaginaRest, CatalogoPortalPaginaRest, BuscaPortalResultadoRest, BuscaStaffResultadoRest, CarrinhoRest, LogAuditoriaPaginaRest } from '@/server/graphql/mappers';
import { GraphQLContext } from '@/server/graphql/context';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Date: { input: string; output: string; }
  DateTime: { input: string; output: string; }
  Decimal: { input: string; output: string; }
  JSON: { input: unknown; output: unknown; }
  UUID: { input: string; output: string; }
};

export enum AcaoAuditoria {
  Delete = 'delete',
  Insert = 'insert',
  Update = 'update'
}

export type AtualizarUsuarioInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  nome?: InputMaybe<Scalars['String']['input']>;
  perfil?: InputMaybe<Perfil>;
};

export type BaixarPagamentoInput = {
  formaPagamentoId: Scalars['ID']['input'];
  observacao?: InputMaybe<Scalars['String']['input']>;
};

export type BuscaPortalResultado = {
  __typename?: 'BuscaPortalResultado';
  facetas: Facetas;
  itens: Array<ItemBuscaPortal>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type BuscaStaffResultado = {
  __typename?: 'BuscaStaffResultado';
  facetas: Facetas;
  itens: Array<ItemBuscaStaff>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Caixa = {
  __typename?: 'Caixa';
  abertoEm: Scalars['DateTime']['output'];
  abertoPor: Scalars['ID']['output'];
  diferenca?: Maybe<Scalars['Decimal']['output']>;
  fechadoEm?: Maybe<Scalars['DateTime']['output']>;
  fechadoPor?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  status: StatusCaixa;
  valorAbertura: Scalars['Decimal']['output'];
  valorFechamentoCalculado?: Maybe<Scalars['Decimal']['output']>;
  valorFechamentoInformado?: Maybe<Scalars['Decimal']['output']>;
};

export type CaixaMovimentacao = {
  __typename?: 'CaixaMovimentacao';
  caixaId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  descricao?: Maybe<Scalars['String']['output']>;
  formaPagamentoId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  pagamentoId?: Maybe<Scalars['ID']['output']>;
  tipo: TipoCaixaMovimentacao;
  usuarioId?: Maybe<Scalars['ID']['output']>;
  valor: Scalars['Decimal']['output'];
};

export type CaixaPagina = {
  __typename?: 'CaixaPagina';
  itens: Array<Caixa>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Carrinho = {
  __typename?: 'Carrinho';
  contatoId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  empresaId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  itens: Array<CarrinhoItem>;
  sessionId?: Maybe<Scalars['String']['output']>;
  status: StatusCarrinho;
  total: Scalars['Decimal']['output'];
  updatedAt: Scalars['DateTime']['output'];
  uuid: Scalars['UUID']['output'];
};

export type CarrinhoItem = {
  __typename?: 'CarrinhoItem';
  carrinhoId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  precoUnitario: Scalars['Decimal']['output'];
  produtoId: Scalars['ID']['output'];
  quantidade: Scalars['Decimal']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CatalogoPortalPagina = {
  __typename?: 'CatalogoPortalPagina';
  itens: Array<ItemCatalogoPortal>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Categoria = {
  __typename?: 'Categoria';
  ativa: Scalars['Boolean']['output'];
  categoriaPaiId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  descricao?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  imagemUrl?: Maybe<Scalars['String']['output']>;
  nome: Scalars['String']['output'];
  ordem: Scalars['Int']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CategoriaInput = {
  ativa: Scalars['Boolean']['input'];
  categoriaPaiId?: InputMaybe<Scalars['ID']['input']>;
  descricao?: InputMaybe<Scalars['String']['input']>;
  imagemUrl?: InputMaybe<Scalars['String']['input']>;
  nome: Scalars['String']['input'];
  ordem: Scalars['Int']['input'];
  slug?: InputMaybe<Scalars['String']['input']>;
};

export type CheckoutInput = {
  condicaoPagamento?: InputMaybe<Scalars['String']['input']>;
  enderecoEntregaId: Scalars['ID']['input'];
  enderecoFaturamentoId: Scalars['ID']['input'];
  observacoes?: InputMaybe<Scalars['String']['input']>;
};

export type Contato = {
  __typename?: 'Contato';
  acessoPortal: Scalars['Boolean']['output'];
  cargo?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  empresaId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  isPrincipal: Scalars['Boolean']['output'];
  nome: Scalars['String']['output'];
  observacoes?: Maybe<Scalars['String']['output']>;
  telefone?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  whatsapp?: Maybe<Scalars['String']['output']>;
};

export type ContatoInput = {
  acessoPortal: Scalars['Boolean']['input'];
  cargo?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  empresaId: Scalars['ID']['input'];
  isPrincipal: Scalars['Boolean']['input'];
  nome: Scalars['String']['input'];
  observacoes?: InputMaybe<Scalars['String']['input']>;
  telefone?: InputMaybe<Scalars['String']['input']>;
  whatsapp?: InputMaybe<Scalars['String']['input']>;
};

export type ContatoPagina = {
  __typename?: 'ContatoPagina';
  itens: Array<Contato>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type ContatoSessao = {
  __typename?: 'ContatoSessao';
  empresaId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  nome: Scalars['String']['output'];
};

export type CriarUsuarioInput = {
  email: Scalars['String']['input'];
  nome: Scalars['String']['input'];
  perfil: Perfil;
  senha: Scalars['String']['input'];
};

export type Empresa = {
  __typename?: 'Empresa';
  cnpj?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  inscricaoEstadual?: Maybe<Scalars['String']['output']>;
  nomeFantasia?: Maybe<Scalars['String']['output']>;
  observacoes?: Maybe<Scalars['String']['output']>;
  razaoSocial: Scalars['String']['output'];
  segmento?: Maybe<Scalars['String']['output']>;
  site?: Maybe<Scalars['String']['output']>;
  status: StatusEmpresa;
  tabelaPrecoId?: Maybe<Scalars['ID']['output']>;
  telefone?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type EmpresaInput = {
  cnpj?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  inscricaoEstadual?: InputMaybe<Scalars['String']['input']>;
  nomeFantasia?: InputMaybe<Scalars['String']['input']>;
  observacoes?: InputMaybe<Scalars['String']['input']>;
  razaoSocial: Scalars['String']['input'];
  segmento?: InputMaybe<Scalars['String']['input']>;
  site?: InputMaybe<Scalars['String']['input']>;
  status: StatusEmpresa;
  tabelaPrecoId?: InputMaybe<Scalars['ID']['input']>;
  telefone?: InputMaybe<Scalars['String']['input']>;
};

export type EmpresaPagina = {
  __typename?: 'EmpresaPagina';
  itens: Array<Empresa>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Endereco = {
  __typename?: 'Endereco';
  bairro?: Maybe<Scalars['String']['output']>;
  cep: Scalars['String']['output'];
  cidade: Scalars['String']['output'];
  complemento?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  empresaId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  logradouro?: Maybe<Scalars['String']['output']>;
  numero?: Maybe<Scalars['String']['output']>;
  pais: Scalars['String']['output'];
  principal: Scalars['Boolean']['output'];
  tipo: TipoEndereco;
  uf: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type EnderecoInput = {
  bairro?: InputMaybe<Scalars['String']['input']>;
  cep: Scalars['String']['input'];
  cidade: Scalars['String']['input'];
  complemento?: InputMaybe<Scalars['String']['input']>;
  empresaId: Scalars['ID']['input'];
  logradouro?: InputMaybe<Scalars['String']['input']>;
  numero?: InputMaybe<Scalars['String']['input']>;
  pais?: InputMaybe<Scalars['String']['input']>;
  principal: Scalars['Boolean']['input'];
  tipo: TipoEndereco;
  uf: Scalars['String']['input'];
};

export enum EstagioOportunidade {
  Ganha = 'ganha',
  Lead = 'lead',
  Negociacao = 'negociacao',
  Perdida = 'perdida',
  Proposta = 'proposta',
  Qualificacao = 'qualificacao'
}

export type EstoqueMovimentacao = {
  __typename?: 'EstoqueMovimentacao';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  motivo?: Maybe<Scalars['String']['output']>;
  ordemServicoId?: Maybe<Scalars['ID']['output']>;
  pedidoId?: Maybe<Scalars['ID']['output']>;
  produtoId: Scalars['ID']['output'];
  quantidade: Scalars['Decimal']['output'];
  saldoAntes: Scalars['Decimal']['output'];
  saldoDepois: Scalars['Decimal']['output'];
  tipo: TipoMovimentacao;
  usuarioId?: Maybe<Scalars['ID']['output']>;
};

export type EstoqueMovimentacaoPagina = {
  __typename?: 'EstoqueMovimentacaoPagina';
  itens: Array<EstoqueMovimentacao>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type EstoqueSaldo = {
  __typename?: 'EstoqueSaldo';
  produtoId: Scalars['ID']['output'];
  quantidadeDisponivel: Scalars['Decimal']['output'];
  quantidadeReservada: Scalars['Decimal']['output'];
};

export type FacetaContagem = {
  __typename?: 'FacetaContagem';
  contagem: Scalars['Int']['output'];
  rotulo?: Maybe<Scalars['String']['output']>;
  valor: Scalars['String']['output'];
};

export type Facetas = {
  __typename?: 'Facetas';
  categorias: Array<FacetaContagem>;
  marcas: Array<FacetaContagem>;
  precoMax?: Maybe<Scalars['Decimal']['output']>;
  precoMin?: Maybe<Scalars['Decimal']['output']>;
};

export type GerarParcelasInput = {
  formaPagamentoId?: InputMaybe<Scalars['ID']['input']>;
  intervaloDias?: InputMaybe<Scalars['Int']['input']>;
  pedidoId: Scalars['ID']['input'];
  primeiroVencimento: Scalars['Date']['input'];
  quantidade: Scalars['Int']['input'];
};

export type Interacao = {
  __typename?: 'Interacao';
  assunto?: Maybe<Scalars['String']['output']>;
  contatoId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  descricao?: Maybe<Scalars['String']['output']>;
  empresaId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  ocorridoEm: Scalars['DateTime']['output'];
  oportunidadeId?: Maybe<Scalars['ID']['output']>;
  proximaAcao?: Maybe<Scalars['String']['output']>;
  proximaAcaoEm?: Maybe<Scalars['DateTime']['output']>;
  tipo: TipoInteracao;
  usuarioId?: Maybe<Scalars['ID']['output']>;
};

export type InteracaoInput = {
  assunto?: InputMaybe<Scalars['String']['input']>;
  contatoId?: InputMaybe<Scalars['ID']['input']>;
  descricao?: InputMaybe<Scalars['String']['input']>;
  empresaId: Scalars['ID']['input'];
  ocorridoEm?: InputMaybe<Scalars['DateTime']['input']>;
  oportunidadeId?: InputMaybe<Scalars['ID']['input']>;
  proximaAcao?: InputMaybe<Scalars['String']['input']>;
  proximaAcaoEm?: InputMaybe<Scalars['DateTime']['input']>;
  tipo: TipoInteracao;
};

export type InteracaoPagina = {
  __typename?: 'InteracaoPagina';
  itens: Array<Interacao>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

/** Hit de busca do portal — produto + precoEfetivo + score de relevância. */
export type ItemBuscaPortal = {
  __typename?: 'ItemBuscaPortal';
  alturaCm?: Maybe<Scalars['Decimal']['output']>;
  ativo: Scalars['Boolean']['output'];
  categoriaId: Scalars['ID']['output'];
  comprimentoCm?: Maybe<Scalars['Decimal']['output']>;
  controlaEstoque: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  descricaoCurta?: Maybe<Scalars['String']['output']>;
  descricaoTecnica?: Maybe<Scalars['String']['output']>;
  destaque: Scalars['Boolean']['output'];
  estoqueMinimo?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['ID']['output'];
  larguraCm?: Maybe<Scalars['Decimal']['output']>;
  marca?: Maybe<Scalars['String']['output']>;
  ncm?: Maybe<Scalars['String']['output']>;
  nome: Scalars['String']['output'];
  origemMercadoria: Scalars['String']['output'];
  pesoKg?: Maybe<Scalars['Decimal']['output']>;
  precoCusto?: Maybe<Scalars['Decimal']['output']>;
  precoEfetivo: Scalars['Decimal']['output'];
  precoVenda: Scalars['Decimal']['output'];
  score: Scalars['Float']['output'];
  sku: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  unidadeMedida?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Hit de busca do backoffice — produto (inclui inativos) + score. */
export type ItemBuscaStaff = {
  __typename?: 'ItemBuscaStaff';
  alturaCm?: Maybe<Scalars['Decimal']['output']>;
  ativo: Scalars['Boolean']['output'];
  categoriaId: Scalars['ID']['output'];
  comprimentoCm?: Maybe<Scalars['Decimal']['output']>;
  controlaEstoque: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  descricaoCurta?: Maybe<Scalars['String']['output']>;
  descricaoTecnica?: Maybe<Scalars['String']['output']>;
  destaque: Scalars['Boolean']['output'];
  estoqueMinimo?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['ID']['output'];
  larguraCm?: Maybe<Scalars['Decimal']['output']>;
  marca?: Maybe<Scalars['String']['output']>;
  ncm?: Maybe<Scalars['String']['output']>;
  nome: Scalars['String']['output'];
  origemMercadoria: Scalars['String']['output'];
  pesoKg?: Maybe<Scalars['Decimal']['output']>;
  precoCusto?: Maybe<Scalars['Decimal']['output']>;
  precoVenda: Scalars['Decimal']['output'];
  score: Scalars['Float']['output'];
  sku: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  unidadeMedida?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Item do catálogo B2B — produto com o preço efetivo da empresa do contato. */
export type ItemCatalogoPortal = {
  __typename?: 'ItemCatalogoPortal';
  alturaCm?: Maybe<Scalars['Decimal']['output']>;
  ativo: Scalars['Boolean']['output'];
  categoriaId: Scalars['ID']['output'];
  comprimentoCm?: Maybe<Scalars['Decimal']['output']>;
  controlaEstoque: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  descricaoCurta?: Maybe<Scalars['String']['output']>;
  descricaoTecnica?: Maybe<Scalars['String']['output']>;
  destaque: Scalars['Boolean']['output'];
  estoqueMinimo?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['ID']['output'];
  larguraCm?: Maybe<Scalars['Decimal']['output']>;
  marca?: Maybe<Scalars['String']['output']>;
  ncm?: Maybe<Scalars['String']['output']>;
  nome: Scalars['String']['output'];
  origemMercadoria: Scalars['String']['output'];
  pesoKg?: Maybe<Scalars['Decimal']['output']>;
  precoCusto?: Maybe<Scalars['Decimal']['output']>;
  precoEfetivo: Scalars['Decimal']['output'];
  precoVenda: Scalars['Decimal']['output'];
  sku: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  unidadeMedida?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ItemOrcamentoInput = {
  desconto: Scalars['Decimal']['input'];
  descricao: Scalars['String']['input'];
  precoUnitario: Scalars['Decimal']['input'];
  produtoId: Scalars['ID']['input'];
  quantidade: Scalars['Decimal']['input'];
};

export type ItemPedidoInput = {
  desconto: Scalars['Decimal']['input'];
  descricao: Scalars['String']['input'];
  precoUnitario: Scalars['Decimal']['input'];
  produtoId: Scalars['ID']['input'];
  quantidade: Scalars['Decimal']['input'];
  sku: Scalars['String']['input'];
};

export type ItensOrcamentoInput = {
  desconto: Scalars['Decimal']['input'];
  frete: Scalars['Decimal']['input'];
  itens: Array<ItemOrcamentoInput>;
};

export type LancarCaixaInput = {
  descricao?: InputMaybe<Scalars['String']['input']>;
  formaPagamentoId?: InputMaybe<Scalars['ID']['input']>;
  tipo: TipoCaixaMovimentacao;
  valor: Scalars['Decimal']['input'];
};

export type LogAuditoria = {
  __typename?: 'LogAuditoria';
  acao: AcaoAuditoria;
  createdAt: Scalars['DateTime']['output'];
  dadosAntes?: Maybe<Scalars['JSON']['output']>;
  dadosDepois?: Maybe<Scalars['JSON']['output']>;
  entidade: Scalars['String']['output'];
  entidadeId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  ip?: Maybe<Scalars['String']['output']>;
  usuarioId?: Maybe<Scalars['ID']['output']>;
};

export type LogAuditoriaPagina = {
  __typename?: 'LogAuditoriaPagina';
  itens: Array<LogAuditoria>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type LoginPortalPayload = {
  __typename?: 'LoginPortalPayload';
  accessExpiraEm: Scalars['Int']['output'];
  accessToken: Scalars['String']['output'];
  contato: ContatoSessao;
  refreshExpiraEm: Scalars['Int']['output'];
  refreshToken: Scalars['String']['output'];
  tokenType: Scalars['String']['output'];
};

export type MovimentacaoEstoqueInput = {
  motivo?: InputMaybe<Scalars['String']['input']>;
  produtoId: Scalars['ID']['input'];
  quantidade: Scalars['Decimal']['input'];
  tipo: TipoMovimentacao;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Abre sessão de caixa com fundo de troco. */
  abrirCaixa: Caixa;
  /** Adiciona item ao carrinho (ou soma a quantidade se já existe). */
  adicionarItemCarrinho: Carrinho;
  arquivarContato?: Maybe<Scalars['Boolean']['output']>;
  /** Soft-delete da empresa. */
  arquivarEmpresa?: Maybe<Scalars['Boolean']['output']>;
  /** Soft-delete do produto (desindexa do motor de busca). */
  arquivarProduto?: Maybe<Scalars['Boolean']['output']>;
  /** Ativa acesso ao portal B2B definindo a senha do contato. */
  ativarPortalContato?: Maybe<Scalars['Boolean']['output']>;
  atualizarCategoria: Categoria;
  atualizarContato: Contato;
  atualizarEmpresa: Empresa;
  atualizarEndereco: Endereco;
  /** Altera a quantidade de um item do carrinho. */
  atualizarItemCarrinho: Carrinho;
  /** Substitui os itens do orçamento (somente em elaboração/rascunho). */
  atualizarItensOrcamento: Orcamento;
  atualizarOportunidade: Oportunidade;
  atualizarProduto: Produto;
  atualizarTabelaPreco: TabelaPreco;
  atualizarUsuario: Usuario;
  /** Envia ao gateway fiscal — grava chave/protocolo ou marca rejeição. */
  autorizarNotaFiscal: NotaFiscal;
  /** Baixa de parcela — recebimento no caixa aberto na mesma transação. */
  baixarPagamento: Pagamento;
  /** Cancela nota autorizada — evento fiscal com motivo obrigatório. */
  cancelarNotaFiscal: NotaFiscal;
  /** Carrinho → pedido aguardando_pagamento (transação única). */
  checkoutPortal: Pedido;
  /** Consome material na OS — baixa de estoque na mesma transação. */
  consumirMaterialOs: OsItem;
  /** Orçamento aprovado → pedido aguardando_pagamento (uma única vez). */
  converterOrcamento: Pedido;
  criarCategoria: Categoria;
  criarContato: Contato;
  criarEmpresa: Empresa;
  criarEndereco: Endereco;
  criarOportunidade: Oportunidade;
  criarOrcamento: Orcamento;
  criarOrdemServico: OrdemServico;
  /** Pedido manual (balcão/telefone) — origem manual. */
  criarPedidoManual: Pedido;
  criarProduto: Produto;
  criarTabelaPreco: TabelaPreco;
  criarUsuario: Usuario;
  /** Define/atualiza o preço de um produto na tabela. */
  definirPrecoTabela: TabelaPrecoItem;
  definirUsuarioAtivo?: Maybe<Scalars['Boolean']['output']>;
  desativarPortalContato?: Maybe<Scalars['Boolean']['output']>;
  /** Monta a NF a partir do pedido faturável — rascunho até autorizar. */
  emitirNotaFiscal: NotaFiscal;
  /** Estorno — lançamento compensatório no caixa aberto. */
  estornarPagamento: Pagamento;
  /** Fecha o caixa — o serviço confere calculado × informado (quebra). */
  fecharCaixa: Caixa;
  /** Plano de parcelas do pedido — a última absorve o arredondamento. */
  gerarParcelas: Array<Pagamento>;
  /** Suprimento, sangria ou despesa no caixa aberto. */
  lancarCaixa: CaixaMovimentacao;
  /** Entrada (reposição) ou ajuste (correção ±) de estoque. */
  lancarMovimentacaoEstoque: EstoqueMovimentacao;
  /** Login de contato do portal B2B — tokens + dados do contato/empresa. */
  loginPortal: LoginPortalPayload;
  /** Login de usuário interno (vendedor/admin/...). Retorna par de tokens JWT. */
  loginStaff: Tokens;
  /** Revoga o refresh token (logout). */
  logout?: Maybe<Scalars['Boolean']['output']>;
  /** Move oportunidade de estágio no funil (ganha/perdida exige motivoPerda). */
  moverEstagioOportunidade: Oportunidade;
  /** Rotaciona o refresh token — o anterior é revogado. */
  refreshSession: Tokens;
  registrarInteracao: Interacao;
  /** Reconstrução completa do índice de busca (somente admin). */
  reindexarBusca: ReindexResultado;
  removerEndereco?: Maybe<Scalars['Boolean']['output']>;
  removerItemCarrinho: Carrinho;
  removerItemTabela?: Maybe<Scalars['Boolean']['output']>;
  /** Transição de status do orçamento (enviar/aprovar/rejeitar). */
  transicionarOrcamento: Orcamento;
  /** Transição de status com observação (trilha de histórico imutável). */
  transicionarOrdemServico: OrdemServico;
  /** Transição de status — confirmação reserva estoque, faturamento baixa. */
  transicionarPedido: Pedido;
  /** Troca a senha do usuário staff autenticado. */
  trocarSenha?: Maybe<Scalars['Boolean']['output']>;
};


export type MutationAbrirCaixaArgs = {
  valorAbertura: Scalars['Decimal']['input'];
};


export type MutationAdicionarItemCarrinhoArgs = {
  produtoId: Scalars['ID']['input'];
  quantidade: Scalars['Decimal']['input'];
};


export type MutationArquivarContatoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationArquivarEmpresaArgs = {
  id: Scalars['ID']['input'];
};


export type MutationArquivarProdutoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationAtivarPortalContatoArgs = {
  id: Scalars['ID']['input'];
  senha: Scalars['String']['input'];
};


export type MutationAtualizarCategoriaArgs = {
  id: Scalars['ID']['input'];
  input: CategoriaInput;
};


export type MutationAtualizarContatoArgs = {
  id: Scalars['ID']['input'];
  input: ContatoInput;
};


export type MutationAtualizarEmpresaArgs = {
  id: Scalars['ID']['input'];
  input: EmpresaInput;
};


export type MutationAtualizarEnderecoArgs = {
  id: Scalars['ID']['input'];
  input: EnderecoInput;
};


export type MutationAtualizarItemCarrinhoArgs = {
  produtoId: Scalars['ID']['input'];
  quantidade: Scalars['Decimal']['input'];
};


export type MutationAtualizarItensOrcamentoArgs = {
  id: Scalars['ID']['input'];
  input: ItensOrcamentoInput;
};


export type MutationAtualizarOportunidadeArgs = {
  id: Scalars['ID']['input'];
  input: OportunidadeInput;
};


export type MutationAtualizarProdutoArgs = {
  id: Scalars['ID']['input'];
  input: ProdutoInput;
};


export type MutationAtualizarTabelaPrecoArgs = {
  id: Scalars['ID']['input'];
  input: TabelaPrecoInput;
};


export type MutationAtualizarUsuarioArgs = {
  id: Scalars['ID']['input'];
  input: AtualizarUsuarioInput;
};


export type MutationAutorizarNotaFiscalArgs = {
  id: Scalars['ID']['input'];
};


export type MutationBaixarPagamentoArgs = {
  id: Scalars['ID']['input'];
  input: BaixarPagamentoInput;
};


export type MutationCancelarNotaFiscalArgs = {
  id: Scalars['ID']['input'];
  motivo: Scalars['String']['input'];
};


export type MutationCheckoutPortalArgs = {
  input: CheckoutInput;
};


export type MutationConsumirMaterialOsArgs = {
  id: Scalars['ID']['input'];
  produtoId: Scalars['ID']['input'];
  quantidade: Scalars['Decimal']['input'];
};


export type MutationConverterOrcamentoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCriarCategoriaArgs = {
  input: CategoriaInput;
};


export type MutationCriarContatoArgs = {
  input: ContatoInput;
};


export type MutationCriarEmpresaArgs = {
  input: EmpresaInput;
};


export type MutationCriarEnderecoArgs = {
  input: EnderecoInput;
};


export type MutationCriarOportunidadeArgs = {
  input: OportunidadeInput;
};


export type MutationCriarOrcamentoArgs = {
  input: OrcamentoInput;
};


export type MutationCriarOrdemServicoArgs = {
  input: OrdemServicoInput;
};


export type MutationCriarPedidoManualArgs = {
  input: PedidoManualInput;
};


export type MutationCriarProdutoArgs = {
  input: ProdutoInput;
};


export type MutationCriarTabelaPrecoArgs = {
  input: TabelaPrecoInput;
};


export type MutationCriarUsuarioArgs = {
  input: CriarUsuarioInput;
};


export type MutationDefinirPrecoTabelaArgs = {
  preco: Scalars['Decimal']['input'];
  produtoId: Scalars['ID']['input'];
  tabelaId: Scalars['ID']['input'];
};


export type MutationDefinirUsuarioAtivoArgs = {
  ativo: Scalars['Boolean']['input'];
  id: Scalars['ID']['input'];
};


export type MutationDesativarPortalContatoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationEmitirNotaFiscalArgs = {
  pedidoId: Scalars['ID']['input'];
};


export type MutationEstornarPagamentoArgs = {
  id: Scalars['ID']['input'];
  motivo: Scalars['String']['input'];
};


export type MutationFecharCaixaArgs = {
  valorInformado: Scalars['Decimal']['input'];
};


export type MutationGerarParcelasArgs = {
  input: GerarParcelasInput;
};


export type MutationLancarCaixaArgs = {
  input: LancarCaixaInput;
};


export type MutationLancarMovimentacaoEstoqueArgs = {
  input: MovimentacaoEstoqueInput;
};


export type MutationLoginPortalArgs = {
  email: Scalars['String']['input'];
  senha: Scalars['String']['input'];
};


export type MutationLoginStaffArgs = {
  email: Scalars['String']['input'];
  senha: Scalars['String']['input'];
};


export type MutationLogoutArgs = {
  refreshToken: Scalars['String']['input'];
};


export type MutationMoverEstagioOportunidadeArgs = {
  estagio: EstagioOportunidade;
  id: Scalars['ID']['input'];
  motivoPerda?: InputMaybe<Scalars['String']['input']>;
};


export type MutationRefreshSessionArgs = {
  refreshToken: Scalars['String']['input'];
};


export type MutationRegistrarInteracaoArgs = {
  input: InteracaoInput;
};


export type MutationRemoverEnderecoArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRemoverItemCarrinhoArgs = {
  produtoId: Scalars['ID']['input'];
};


export type MutationRemoverItemTabelaArgs = {
  produtoId: Scalars['ID']['input'];
  tabelaId: Scalars['ID']['input'];
};


export type MutationTransicionarOrcamentoArgs = {
  id: Scalars['ID']['input'];
  status: StatusOrcamento;
};


export type MutationTransicionarOrdemServicoArgs = {
  id: Scalars['ID']['input'];
  observacao?: InputMaybe<Scalars['String']['input']>;
  status: StatusOs;
};


export type MutationTransicionarPedidoArgs = {
  id: Scalars['ID']['input'];
  status: StatusPedido;
};


export type MutationTrocarSenhaArgs = {
  novaSenha: Scalars['String']['input'];
  senhaAtual: Scalars['String']['input'];
};

export type NotaFiscal = {
  __typename?: 'NotaFiscal';
  cfop?: Maybe<Scalars['String']['output']>;
  chaveAcesso?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  emitidaEm?: Maybe<Scalars['DateTime']['output']>;
  empresaId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  motivoCancelamento?: Maybe<Scalars['String']['output']>;
  naturezaOperacao?: Maybe<Scalars['String']['output']>;
  numero: Scalars['String']['output'];
  pdfPath?: Maybe<Scalars['String']['output']>;
  pedidoId: Scalars['ID']['output'];
  protocoloAutorizacao?: Maybe<Scalars['String']['output']>;
  serie?: Maybe<Scalars['String']['output']>;
  status: StatusNotaFiscal;
  tipo: TipoNotaFiscal;
  updatedAt: Scalars['DateTime']['output'];
  valorDesconto?: Maybe<Scalars['Decimal']['output']>;
  valorFrete?: Maybe<Scalars['Decimal']['output']>;
  valorProdutos?: Maybe<Scalars['Decimal']['output']>;
  valorTotal?: Maybe<Scalars['Decimal']['output']>;
  xmlPath?: Maybe<Scalars['String']['output']>;
};

export type NotaFiscalDetalhe = {
  __typename?: 'NotaFiscalDetalhe';
  itens: Array<NotaFiscalItem>;
  nota: NotaFiscal;
};

export type NotaFiscalItem = {
  __typename?: 'NotaFiscalItem';
  cfop?: Maybe<Scalars['String']['output']>;
  codigo?: Maybe<Scalars['String']['output']>;
  cofinsValor?: Maybe<Scalars['Decimal']['output']>;
  descricao?: Maybe<Scalars['String']['output']>;
  icmsAliquota?: Maybe<Scalars['Decimal']['output']>;
  icmsValor?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['ID']['output'];
  ipiAliquota?: Maybe<Scalars['Decimal']['output']>;
  ipiValor?: Maybe<Scalars['Decimal']['output']>;
  ncm?: Maybe<Scalars['String']['output']>;
  nfId: Scalars['ID']['output'];
  pisValor?: Maybe<Scalars['Decimal']['output']>;
  produtoId?: Maybe<Scalars['ID']['output']>;
  quantidade?: Maybe<Scalars['Decimal']['output']>;
  unidade?: Maybe<Scalars['String']['output']>;
  valorTotal?: Maybe<Scalars['Decimal']['output']>;
  valorUnitario?: Maybe<Scalars['Decimal']['output']>;
};

export type NotaFiscalPagina = {
  __typename?: 'NotaFiscalPagina';
  itens: Array<NotaFiscal>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Oportunidade = {
  __typename?: 'Oportunidade';
  contatoId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  dataPrevistaFechamento?: Maybe<Scalars['Date']['output']>;
  descricao?: Maybe<Scalars['String']['output']>;
  empresaId: Scalars['ID']['output'];
  estagio: EstagioOportunidade;
  id: Scalars['ID']['output'];
  motivoPerda?: Maybe<Scalars['String']['output']>;
  origem?: Maybe<OrigemOportunidade>;
  responsavelId: Scalars['ID']['output'];
  titulo: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  valorEstimado?: Maybe<Scalars['Decimal']['output']>;
};

export type OportunidadeInput = {
  contatoId?: InputMaybe<Scalars['ID']['input']>;
  dataPrevistaFechamento?: InputMaybe<Scalars['Date']['input']>;
  descricao?: InputMaybe<Scalars['String']['input']>;
  empresaId: Scalars['ID']['input'];
  origem?: InputMaybe<OrigemOportunidade>;
  responsavelId: Scalars['ID']['input'];
  titulo: Scalars['String']['input'];
  valorEstimado?: InputMaybe<Scalars['Decimal']['input']>;
};

export type OportunidadePagina = {
  __typename?: 'OportunidadePagina';
  itens: Array<Oportunidade>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Orcamento = {
  __typename?: 'Orcamento';
  condicaoPagamento?: Maybe<Scalars['String']['output']>;
  contatoId?: Maybe<Scalars['ID']['output']>;
  convertidoPedidoId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  desconto: Scalars['Decimal']['output'];
  emitidoEm: Scalars['DateTime']['output'];
  empresaId: Scalars['ID']['output'];
  frete: Scalars['Decimal']['output'];
  id: Scalars['ID']['output'];
  numero: Scalars['String']['output'];
  observacoes?: Maybe<Scalars['String']['output']>;
  oportunidadeId?: Maybe<Scalars['ID']['output']>;
  status: StatusOrcamento;
  subtotal: Scalars['Decimal']['output'];
  total: Scalars['Decimal']['output'];
  updatedAt: Scalars['DateTime']['output'];
  validoAte?: Maybe<Scalars['Date']['output']>;
  vendedorId: Scalars['ID']['output'];
};

export type OrcamentoDetalhe = {
  __typename?: 'OrcamentoDetalhe';
  itens: Array<OrcamentoItem>;
  orcamento: Orcamento;
};

export type OrcamentoInput = {
  condicaoPagamento?: InputMaybe<Scalars['String']['input']>;
  contatoId?: InputMaybe<Scalars['ID']['input']>;
  desconto: Scalars['Decimal']['input'];
  empresaId: Scalars['ID']['input'];
  frete: Scalars['Decimal']['input'];
  itens: Array<ItemOrcamentoInput>;
  observacoes?: InputMaybe<Scalars['String']['input']>;
  oportunidadeId?: InputMaybe<Scalars['ID']['input']>;
  validoAte?: InputMaybe<Scalars['Date']['input']>;
  vendedorId: Scalars['ID']['input'];
};

export type OrcamentoItem = {
  __typename?: 'OrcamentoItem';
  desconto: Scalars['Decimal']['output'];
  descricao: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  orcamentoId: Scalars['ID']['output'];
  precoUnitario: Scalars['Decimal']['output'];
  produtoId: Scalars['ID']['output'];
  quantidade: Scalars['Decimal']['output'];
  total: Scalars['Decimal']['output'];
};

export type OrcamentoPagina = {
  __typename?: 'OrcamentoPagina';
  itens: Array<Orcamento>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type OrdemServico = {
  __typename?: 'OrdemServico';
  abertaEm: Scalars['DateTime']['output'];
  concluidaEm?: Maybe<Scalars['DateTime']['output']>;
  contatoId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  descricao?: Maybe<Scalars['String']['output']>;
  empresaId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  numero: Scalars['String']['output'];
  observacoes?: Maybe<Scalars['String']['output']>;
  pedidoId?: Maybe<Scalars['ID']['output']>;
  previstaEm?: Maybe<Scalars['Date']['output']>;
  prioridade: PrioridadeOs;
  responsavelId?: Maybe<Scalars['ID']['output']>;
  status: StatusOs;
  updatedAt: Scalars['DateTime']['output'];
  valorMaoObra?: Maybe<Scalars['Decimal']['output']>;
  valorTotal?: Maybe<Scalars['Decimal']['output']>;
};

export type OrdemServicoDetalhe = {
  __typename?: 'OrdemServicoDetalhe';
  historico: Array<OsHistorico>;
  itens: Array<OsItem>;
  ordem: OrdemServico;
};

export type OrdemServicoInput = {
  contatoId?: InputMaybe<Scalars['ID']['input']>;
  descricao?: InputMaybe<Scalars['String']['input']>;
  empresaId: Scalars['ID']['input'];
  observacoes?: InputMaybe<Scalars['String']['input']>;
  pedidoId?: InputMaybe<Scalars['ID']['input']>;
  previstaEm?: InputMaybe<Scalars['Date']['input']>;
  prioridade: PrioridadeOs;
  responsavelId?: InputMaybe<Scalars['ID']['input']>;
  valorMaoObra?: InputMaybe<Scalars['Decimal']['input']>;
};

export type OrdemServicoPagina = {
  __typename?: 'OrdemServicoPagina';
  itens: Array<OrdemServico>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export enum OrigemOportunidade {
  Ecommerce = 'ecommerce',
  Indicacao = 'indicacao',
  Outro = 'outro',
  Prospeccao = 'prospeccao',
  Site = 'site',
  Telefone = 'telefone'
}

export enum OrigemPedido {
  Ecommerce = 'ecommerce',
  Manual = 'manual',
  Orcamento = 'orcamento'
}

export type OsHistorico = {
  __typename?: 'OsHistorico';
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  observacao?: Maybe<Scalars['String']['output']>;
  osId: Scalars['ID']['output'];
  statusAnterior?: Maybe<Scalars['String']['output']>;
  statusNovo: Scalars['String']['output'];
  usuarioId?: Maybe<Scalars['ID']['output']>;
};

export type OsItem = {
  __typename?: 'OsItem';
  id: Scalars['ID']['output'];
  osId: Scalars['ID']['output'];
  precoUnitario: Scalars['Decimal']['output'];
  produtoId: Scalars['ID']['output'];
  quantidade: Scalars['Decimal']['output'];
  total: Scalars['Decimal']['output'];
};

export type Pagamento = {
  __typename?: 'Pagamento';
  caixaMovimentacaoId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  formaPagamentoId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  observacao?: Maybe<Scalars['String']['output']>;
  pagoEm?: Maybe<Scalars['DateTime']['output']>;
  parcelaNum: Scalars['Int']['output'];
  pedidoId: Scalars['ID']['output'];
  status: StatusPagamento;
  updatedAt: Scalars['DateTime']['output'];
  valor: Scalars['Decimal']['output'];
  vencimento: Scalars['Date']['output'];
};

export type PagamentoPagina = {
  __typename?: 'PagamentoPagina';
  itens: Array<Pagamento>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Pedido = {
  __typename?: 'Pedido';
  carrinhoId?: Maybe<Scalars['ID']['output']>;
  condicaoPagamento?: Maybe<Scalars['String']['output']>;
  contatoId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  desconto: Scalars['Decimal']['output'];
  empresaId: Scalars['ID']['output'];
  enderecoEntregaId: Scalars['ID']['output'];
  enderecoFaturamentoId: Scalars['ID']['output'];
  frete: Scalars['Decimal']['output'];
  id: Scalars['ID']['output'];
  numero: Scalars['String']['output'];
  observacoes?: Maybe<Scalars['String']['output']>;
  orcamentoId?: Maybe<Scalars['ID']['output']>;
  origem: OrigemPedido;
  status: StatusPedido;
  subtotal: Scalars['Decimal']['output'];
  total: Scalars['Decimal']['output'];
  updatedAt: Scalars['DateTime']['output'];
  vendedorId?: Maybe<Scalars['ID']['output']>;
};

export type PedidoDetalhe = {
  __typename?: 'PedidoDetalhe';
  itens: Array<PedidoItem>;
  pedido: Pedido;
};

export type PedidoItem = {
  __typename?: 'PedidoItem';
  desconto: Scalars['Decimal']['output'];
  descricao: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  pedidoId: Scalars['ID']['output'];
  precoUnitario: Scalars['Decimal']['output'];
  produtoId: Scalars['ID']['output'];
  quantidade: Scalars['Decimal']['output'];
  sku: Scalars['String']['output'];
  total: Scalars['Decimal']['output'];
};

export type PedidoManualInput = {
  condicaoPagamento?: InputMaybe<Scalars['String']['input']>;
  contatoId: Scalars['ID']['input'];
  empresaId: Scalars['ID']['input'];
  enderecoEntregaId: Scalars['ID']['input'];
  enderecoFaturamentoId: Scalars['ID']['input'];
  itens: Array<ItemPedidoInput>;
  observacoes?: InputMaybe<Scalars['String']['input']>;
};

export type PedidoPagina = {
  __typename?: 'PedidoPagina';
  itens: Array<Pedido>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export enum Perfil {
  Admin = 'admin',
  Estoque = 'estoque',
  Financeiro = 'financeiro',
  Tecnico = 'tecnico',
  Vendedor = 'vendedor'
}

export enum PrioridadeOs {
  Alta = 'alta',
  Baixa = 'baixa',
  Normal = 'normal',
  Urgente = 'urgente'
}

export type Produto = {
  __typename?: 'Produto';
  alturaCm?: Maybe<Scalars['Decimal']['output']>;
  ativo: Scalars['Boolean']['output'];
  categoriaId: Scalars['ID']['output'];
  comprimentoCm?: Maybe<Scalars['Decimal']['output']>;
  controlaEstoque: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  deletedAt?: Maybe<Scalars['DateTime']['output']>;
  descricaoCurta?: Maybe<Scalars['String']['output']>;
  descricaoTecnica?: Maybe<Scalars['String']['output']>;
  destaque: Scalars['Boolean']['output'];
  estoqueMinimo?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['ID']['output'];
  larguraCm?: Maybe<Scalars['Decimal']['output']>;
  marca?: Maybe<Scalars['String']['output']>;
  ncm?: Maybe<Scalars['String']['output']>;
  nome: Scalars['String']['output'];
  origemMercadoria: Scalars['String']['output'];
  pesoKg?: Maybe<Scalars['Decimal']['output']>;
  precoCusto?: Maybe<Scalars['Decimal']['output']>;
  precoVenda: Scalars['Decimal']['output'];
  sku: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  unidadeMedida?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ProdutoDetalhe = {
  __typename?: 'ProdutoDetalhe';
  imagens: Array<ProdutoImagem>;
  produto: Produto;
};

export type ProdutoImagem = {
  __typename?: 'ProdutoImagem';
  altText?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isPrincipal: Scalars['Boolean']['output'];
  ordem: Scalars['Int']['output'];
  produtoId: Scalars['ID']['output'];
  url: Scalars['String']['output'];
};

export type ProdutoInput = {
  alturaCm?: InputMaybe<Scalars['Decimal']['input']>;
  ativo: Scalars['Boolean']['input'];
  categoriaId: Scalars['ID']['input'];
  comprimentoCm?: InputMaybe<Scalars['Decimal']['input']>;
  controlaEstoque: Scalars['Boolean']['input'];
  descricaoCurta?: InputMaybe<Scalars['String']['input']>;
  descricaoTecnica?: InputMaybe<Scalars['String']['input']>;
  destaque: Scalars['Boolean']['input'];
  estoqueMinimo?: InputMaybe<Scalars['Decimal']['input']>;
  larguraCm?: InputMaybe<Scalars['Decimal']['input']>;
  marca?: InputMaybe<Scalars['String']['input']>;
  ncm?: InputMaybe<Scalars['String']['input']>;
  nome: Scalars['String']['input'];
  origemMercadoria?: InputMaybe<Scalars['String']['input']>;
  pesoKg?: InputMaybe<Scalars['Decimal']['input']>;
  precoCusto?: InputMaybe<Scalars['Decimal']['input']>;
  precoVenda: Scalars['Decimal']['input'];
  sku: Scalars['String']['input'];
  slug?: InputMaybe<Scalars['String']['input']>;
  unidadeMedida?: InputMaybe<Scalars['String']['input']>;
};

export type ProdutoPagina = {
  __typename?: 'ProdutoPagina';
  itens: Array<Produto>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** Trilha de auditoria (append-only) — somente admin. */
  auditoria: LogAuditoriaPagina;
  /** Busca do portal — fuzzy + filtros + facetas, preço efetivo B2B. */
  buscarProdutosPortal: BuscaPortalResultado;
  /** Busca do backoffice — inclui produtos inativos, preço de catálogo. */
  buscarProdutosStaff: BuscaStaffResultado;
  /** Sessão de caixa aberta no momento (ou null). */
  caixaAberto?: Maybe<Caixa>;
  caixaMovimentacoes: Array<CaixaMovimentacao>;
  caixas: CaixaPagina;
  /** Carrinho atual do contato autenticado (itens + total). */
  carrinhoPortal: Carrinho;
  /** Catálogo B2B com o preço efetivo da empresa do contato autenticado. */
  catalogoPortal: CatalogoPortalPagina;
  /** Árvore de categorias (somenteAtivas filtra inativas). */
  categorias: Array<Categoria>;
  contato?: Maybe<Contato>;
  contatos: ContatoPagina;
  empresa?: Maybe<Empresa>;
  empresas: EmpresaPagina;
  /** Endereços da empresa (filtro opcional por tipo). */
  enderecos: Array<Endereco>;
  /** Produtos com saldo disponível abaixo do mínimo configurado. */
  estoqueAbaixoDoMinimo: Array<SaldoAbaixoMinimo>;
  estoqueMovimentacoes: EstoqueMovimentacaoPagina;
  /** Saldo projetado do produto (disponível = físico − reservado). */
  estoqueSaldo: EstoqueSaldo;
  /** Liveness do backend (sem autenticação). */
  health: Saude;
  /** Timeline de interações (ligações, e-mails, visitas...). */
  interacoes: InteracaoPagina;
  /** Nota fiscal + itens. */
  notaFiscal?: Maybe<NotaFiscalDetalhe>;
  notasFiscais: NotaFiscalPagina;
  oportunidade?: Maybe<Oportunidade>;
  oportunidades: OportunidadePagina;
  /** Orçamento + itens. */
  orcamento?: Maybe<OrcamentoDetalhe>;
  orcamentos: OrcamentoPagina;
  /** OS + itens consumidos + histórico de status. */
  ordemServico?: Maybe<OrdemServicoDetalhe>;
  ordensServico: OrdemServicoPagina;
  pagamentos: PagamentoPagina;
  /** Pedido + itens. */
  pedido?: Maybe<PedidoDetalhe>;
  pedidos: PedidoPagina;
  /** Produto + imagens. */
  produto?: Maybe<ProdutoDetalhe>;
  produtos: ProdutoPagina;
  /** Readiness do backend + banco (sem autenticação). */
  ready: Saude;
  /** Autocomplete do portal — sugestões leves (mínimo 2 caracteres). */
  sugerirProdutosPortal: Array<SugestaoProduto>;
  /** Tabela de preço + itens. */
  tabelaPreco?: Maybe<TabelaPrecoDetalhe>;
  tabelasPreco: TabelaPrecoPagina;
  /** Busca usuário por id (somente admin). */
  usuario?: Maybe<Usuario>;
  /** Lista usuários staff (somente admin). */
  usuarios: UsuarioPagina;
};


export type QueryAuditoriaArgs = {
  entidade?: InputMaybe<Scalars['String']['input']>;
  entidadeId?: InputMaybe<Scalars['ID']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  usuarioId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryBuscarProdutosPortalArgs = {
  categoriaId?: InputMaybe<Scalars['ID']['input']>;
  marca?: InputMaybe<Scalars['String']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  precoMax?: InputMaybe<Scalars['Decimal']['input']>;
  precoMin?: InputMaybe<Scalars['Decimal']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
};


export type QueryBuscarProdutosStaffArgs = {
  categoriaId?: InputMaybe<Scalars['ID']['input']>;
  marca?: InputMaybe<Scalars['String']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  precoMax?: InputMaybe<Scalars['Decimal']['input']>;
  precoMin?: InputMaybe<Scalars['Decimal']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCaixaMovimentacoesArgs = {
  caixaId: Scalars['ID']['input'];
};


export type QueryCaixasArgs = {
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryCatalogoPortalArgs = {
  busca?: InputMaybe<Scalars['String']['input']>;
  categoriaId?: InputMaybe<Scalars['ID']['input']>;
  destaque?: InputMaybe<Scalars['Boolean']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryCategoriasArgs = {
  somenteAtivas?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryContatoArgs = {
  id: Scalars['ID']['input'];
};


export type QueryContatosArgs = {
  busca?: InputMaybe<Scalars['String']['input']>;
  empresaId?: InputMaybe<Scalars['ID']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryEmpresaArgs = {
  id: Scalars['ID']['input'];
};


export type QueryEmpresasArgs = {
  busca?: InputMaybe<Scalars['String']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<StatusEmpresa>;
};


export type QueryEnderecosArgs = {
  empresaId: Scalars['ID']['input'];
  tipo?: InputMaybe<TipoEndereco>;
};


export type QueryEstoqueAbaixoDoMinimoArgs = {
  limite?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryEstoqueMovimentacoesArgs = {
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  produtoId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryEstoqueSaldoArgs = {
  produtoId: Scalars['ID']['input'];
};


export type QueryInteracoesArgs = {
  contatoId?: InputMaybe<Scalars['ID']['input']>;
  empresaId?: InputMaybe<Scalars['ID']['input']>;
  oportunidadeId?: InputMaybe<Scalars['ID']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryNotaFiscalArgs = {
  id: Scalars['ID']['input'];
};


export type QueryNotasFiscaisArgs = {
  empresaId?: InputMaybe<Scalars['ID']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  pedidoId?: InputMaybe<Scalars['ID']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<StatusNotaFiscal>;
};


export type QueryOportunidadeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOportunidadesArgs = {
  empresaId?: InputMaybe<Scalars['ID']['input']>;
  estagio?: InputMaybe<EstagioOportunidade>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  responsavelId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryOrcamentoArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOrcamentosArgs = {
  empresaId?: InputMaybe<Scalars['ID']['input']>;
  oportunidadeId?: InputMaybe<Scalars['ID']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<StatusOrcamento>;
  vendedorId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryOrdemServicoArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOrdensServicoArgs = {
  empresaId?: InputMaybe<Scalars['ID']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  pedidoId?: InputMaybe<Scalars['ID']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  responsavelId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<StatusOs>;
};


export type QueryPagamentosArgs = {
  pagina?: InputMaybe<Scalars['Int']['input']>;
  pedidoId?: InputMaybe<Scalars['ID']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<StatusPagamento>;
  vencidosEm?: InputMaybe<Scalars['Date']['input']>;
};


export type QueryPedidoArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPedidosArgs = {
  contatoId?: InputMaybe<Scalars['ID']['input']>;
  empresaId?: InputMaybe<Scalars['ID']['input']>;
  origem?: InputMaybe<OrigemPedido>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<StatusPedido>;
};


export type QueryProdutoArgs = {
  id: Scalars['ID']['input'];
};


export type QueryProdutosArgs = {
  ativo?: InputMaybe<Scalars['Boolean']['input']>;
  busca?: InputMaybe<Scalars['String']['input']>;
  categoriaId?: InputMaybe<Scalars['ID']['input']>;
  destaque?: InputMaybe<Scalars['Boolean']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
};


export type QuerySugerirProdutosPortalArgs = {
  limite?: InputMaybe<Scalars['Int']['input']>;
  q: Scalars['String']['input'];
};


export type QueryTabelaPrecoArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTabelasPrecoArgs = {
  ativa?: InputMaybe<Scalars['Boolean']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryUsuarioArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUsuariosArgs = {
  ativo?: InputMaybe<Scalars['Boolean']['input']>;
  busca?: InputMaybe<Scalars['String']['input']>;
  pagina?: InputMaybe<Scalars['Int']['input']>;
  perfil?: InputMaybe<Perfil>;
  porPagina?: InputMaybe<Scalars['Int']['input']>;
};

export type ReindexResultado = {
  __typename?: 'ReindexResultado';
  indexados: Scalars['Int']['output'];
};

export type SaldoAbaixoMinimo = {
  __typename?: 'SaldoAbaixoMinimo';
  produto: Produto;
  saldo: EstoqueSaldo;
};

export type Saude = {
  __typename?: 'Saude';
  status: Scalars['String']['output'];
  versao: Scalars['String']['output'];
};

export enum StatusCaixa {
  Aberto = 'aberto',
  Fechado = 'fechado'
}

export enum StatusCarrinho {
  Abandonado = 'abandonado',
  Aberto = 'aberto',
  Convertido = 'convertido'
}

export enum StatusEmpresa {
  Ativo = 'ativo',
  Inativo = 'inativo',
  Prospecto = 'prospecto'
}

export enum StatusNotaFiscal {
  Autorizada = 'autorizada',
  Cancelada = 'cancelada',
  Denegada = 'denegada',
  Rascunho = 'rascunho',
  Rejeitada = 'rejeitada'
}

export enum StatusOrcamento {
  Aprovado = 'aprovado',
  Convertido = 'convertido',
  EmAnalise = 'em_analise',
  Enviado = 'enviado',
  Expirado = 'expirado',
  Rascunho = 'rascunho',
  Recusado = 'recusado'
}

export enum StatusOs {
  Aberta = 'aberta',
  AguardandoMaterial = 'aguardando_material',
  Cancelada = 'cancelada',
  Concluida = 'concluida',
  EmAndamento = 'em_andamento'
}

export enum StatusPagamento {
  Cancelado = 'cancelado',
  Estornado = 'estornado',
  Pago = 'pago',
  Pendente = 'pendente',
  Vencido = 'vencido'
}

export enum StatusPedido {
  AguardandoPagamento = 'aguardando_pagamento',
  Cancelado = 'cancelado',
  Concluido = 'concluido',
  Confirmado = 'confirmado',
  EmSeparacao = 'em_separacao',
  Entregue = 'entregue',
  Enviado = 'enviado',
  Faturado = 'faturado'
}

export type SugestaoProduto = {
  __typename?: 'SugestaoProduto';
  nome: Scalars['String']['output'];
  produtoId: Scalars['ID']['output'];
  sku: Scalars['String']['output'];
};

export type TabelaPreco = {
  __typename?: 'TabelaPreco';
  ativa: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  descricao?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  nome: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type TabelaPrecoDetalhe = {
  __typename?: 'TabelaPrecoDetalhe';
  itens: Array<TabelaPrecoItem>;
  tabela: TabelaPreco;
};

export type TabelaPrecoInput = {
  ativa: Scalars['Boolean']['input'];
  descricao?: InputMaybe<Scalars['String']['input']>;
  nome: Scalars['String']['input'];
};

export type TabelaPrecoItem = {
  __typename?: 'TabelaPrecoItem';
  id: Scalars['ID']['output'];
  preco: Scalars['Decimal']['output'];
  produtoId: Scalars['ID']['output'];
  tabelaPrecoId: Scalars['ID']['output'];
};

export type TabelaPrecoPagina = {
  __typename?: 'TabelaPrecoPagina';
  itens: Array<TabelaPreco>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};

export enum TipoCaixaMovimentacao {
  Despesa = 'despesa',
  Estorno = 'estorno',
  Recebimento = 'recebimento',
  Sangria = 'sangria',
  Suprimento = 'suprimento',
  Venda = 'venda'
}

export enum TipoEndereco {
  Correspondencia = 'correspondencia',
  Entrega = 'entrega',
  Fiscal = 'fiscal'
}

export enum TipoInteracao {
  Email = 'email',
  Ligacao = 'ligacao',
  NotaInterna = 'nota_interna',
  Outro = 'outro',
  Reuniao = 'reuniao',
  Visita = 'visita',
  Whatsapp = 'whatsapp'
}

export enum TipoMovimentacao {
  Ajuste = 'ajuste',
  Entrada = 'entrada',
  LiberacaoReserva = 'liberacao_reserva',
  Reserva = 'reserva',
  Saida = 'saida'
}

export enum TipoNotaFiscal {
  Complementar = 'complementar',
  Devolucao = 'devolucao',
  Saida = 'saida'
}

export type Tokens = {
  __typename?: 'Tokens';
  accessExpiraEm: Scalars['Int']['output'];
  accessToken: Scalars['String']['output'];
  refreshExpiraEm: Scalars['Int']['output'];
  refreshToken: Scalars['String']['output'];
  tokenType: Scalars['String']['output'];
};

export type Usuario = {
  __typename?: 'Usuario';
  ativo: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  nome: Scalars['String']['output'];
  perfil: Perfil;
  updatedAt: Scalars['DateTime']['output'];
};

export type UsuarioPagina = {
  __typename?: 'UsuarioPagina';
  itens: Array<Usuario>;
  pagina: Scalars['Int']['output'];
  porPagina: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  totalPaginas: Scalars['Int']['output'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AcaoAuditoria: ResolverTypeWrapper<Partial<AcaoAuditoria>>;
  AtualizarUsuarioInput: ResolverTypeWrapper<Partial<AtualizarUsuarioInput>>;
  BaixarPagamentoInput: ResolverTypeWrapper<Partial<BaixarPagamentoInput>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']['output']>>;
  BuscaPortalResultado: ResolverTypeWrapper<BuscaPortalResultadoRest>;
  BuscaStaffResultado: ResolverTypeWrapper<BuscaStaffResultadoRest>;
  Caixa: ResolverTypeWrapper<RestCaixa>;
  CaixaMovimentacao: ResolverTypeWrapper<RestCaixaMovimentacao>;
  CaixaPagina: ResolverTypeWrapper<CaixaPaginaRest>;
  Carrinho: ResolverTypeWrapper<CarrinhoRest>;
  CarrinhoItem: ResolverTypeWrapper<RestCarrinhoItem>;
  CatalogoPortalPagina: ResolverTypeWrapper<CatalogoPortalPaginaRest>;
  Categoria: ResolverTypeWrapper<RestCategoria>;
  CategoriaInput: ResolverTypeWrapper<Partial<CategoriaInput>>;
  CheckoutInput: ResolverTypeWrapper<Partial<CheckoutInput>>;
  Contato: ResolverTypeWrapper<RestContato>;
  ContatoInput: ResolverTypeWrapper<Partial<ContatoInput>>;
  ContatoPagina: ResolverTypeWrapper<ContatoPaginaRest>;
  ContatoSessao: ResolverTypeWrapper<RestContatoSessao>;
  CriarUsuarioInput: ResolverTypeWrapper<Partial<CriarUsuarioInput>>;
  Date: ResolverTypeWrapper<Partial<Scalars['Date']['output']>>;
  DateTime: ResolverTypeWrapper<Partial<Scalars['DateTime']['output']>>;
  Decimal: ResolverTypeWrapper<Partial<Scalars['Decimal']['output']>>;
  Empresa: ResolverTypeWrapper<RestEmpresa>;
  EmpresaInput: ResolverTypeWrapper<Partial<EmpresaInput>>;
  EmpresaPagina: ResolverTypeWrapper<EmpresaPaginaRest>;
  Endereco: ResolverTypeWrapper<RestEndereco>;
  EnderecoInput: ResolverTypeWrapper<Partial<EnderecoInput>>;
  EstagioOportunidade: ResolverTypeWrapper<Partial<EstagioOportunidade>>;
  EstoqueMovimentacao: ResolverTypeWrapper<RestEstoqueMovimentacao>;
  EstoqueMovimentacaoPagina: ResolverTypeWrapper<EstoqueMovimentacaoPaginaRest>;
  EstoqueSaldo: ResolverTypeWrapper<RestEstoqueSaldo>;
  FacetaContagem: ResolverTypeWrapper<RestFacetaContagem>;
  Facetas: ResolverTypeWrapper<RestFacetas>;
  Float: ResolverTypeWrapper<Partial<Scalars['Float']['output']>>;
  GerarParcelasInput: ResolverTypeWrapper<Partial<GerarParcelasInput>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']['output']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']['output']>>;
  Interacao: ResolverTypeWrapper<RestInteracao>;
  InteracaoInput: ResolverTypeWrapper<Partial<InteracaoInput>>;
  InteracaoPagina: ResolverTypeWrapper<InteracaoPaginaRest>;
  ItemBuscaPortal: ResolverTypeWrapper<RestItemBuscaPortal>;
  ItemBuscaStaff: ResolverTypeWrapper<RestItemBuscaStaff>;
  ItemCatalogoPortal: ResolverTypeWrapper<RestItemCatalogoPortal>;
  ItemOrcamentoInput: ResolverTypeWrapper<Partial<ItemOrcamentoInput>>;
  ItemPedidoInput: ResolverTypeWrapper<Partial<ItemPedidoInput>>;
  ItensOrcamentoInput: ResolverTypeWrapper<Partial<ItensOrcamentoInput>>;
  JSON: ResolverTypeWrapper<Partial<Scalars['JSON']['output']>>;
  LancarCaixaInput: ResolverTypeWrapper<Partial<LancarCaixaInput>>;
  LogAuditoria: ResolverTypeWrapper<RestLogAuditoria>;
  LogAuditoriaPagina: ResolverTypeWrapper<LogAuditoriaPaginaRest>;
  LoginPortalPayload: ResolverTypeWrapper<PortalLoginResp>;
  MovimentacaoEstoqueInput: ResolverTypeWrapper<Partial<MovimentacaoEstoqueInput>>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  NotaFiscal: ResolverTypeWrapper<RestNotaFiscal>;
  NotaFiscalDetalhe: ResolverTypeWrapper<NotaDetalhe>;
  NotaFiscalItem: ResolverTypeWrapper<RestNotaFiscalItem>;
  NotaFiscalPagina: ResolverTypeWrapper<NotaFiscalPaginaRest>;
  Oportunidade: ResolverTypeWrapper<RestOportunidade>;
  OportunidadeInput: ResolverTypeWrapper<Partial<OportunidadeInput>>;
  OportunidadePagina: ResolverTypeWrapper<OportunidadePaginaRest>;
  Orcamento: ResolverTypeWrapper<RestOrcamento>;
  OrcamentoDetalhe: ResolverTypeWrapper<RestOrcamentoDetalhe>;
  OrcamentoInput: ResolverTypeWrapper<Partial<OrcamentoInput>>;
  OrcamentoItem: ResolverTypeWrapper<RestOrcamentoItem>;
  OrcamentoPagina: ResolverTypeWrapper<OrcamentoPaginaRest>;
  OrdemServico: ResolverTypeWrapper<RestOrdemServico>;
  OrdemServicoDetalhe: ResolverTypeWrapper<OsDetalhe>;
  OrdemServicoInput: ResolverTypeWrapper<Partial<OrdemServicoInput>>;
  OrdemServicoPagina: ResolverTypeWrapper<OrdemServicoPaginaRest>;
  OrigemOportunidade: ResolverTypeWrapper<Partial<OrigemOportunidade>>;
  OrigemPedido: ResolverTypeWrapper<Partial<OrigemPedido>>;
  OsHistorico: ResolverTypeWrapper<RestOsHistorico>;
  OsItem: ResolverTypeWrapper<RestOsItem>;
  Pagamento: ResolverTypeWrapper<RestPagamento>;
  PagamentoPagina: ResolverTypeWrapper<PagamentoPaginaRest>;
  Pedido: ResolverTypeWrapper<RestPedido>;
  PedidoDetalhe: ResolverTypeWrapper<RestPedidoDetalhe>;
  PedidoItem: ResolverTypeWrapper<RestPedidoItem>;
  PedidoManualInput: ResolverTypeWrapper<Partial<PedidoManualInput>>;
  PedidoPagina: ResolverTypeWrapper<PedidoPaginaRest>;
  Perfil: ResolverTypeWrapper<Partial<Perfil>>;
  PrioridadeOs: ResolverTypeWrapper<Partial<PrioridadeOs>>;
  Produto: ResolverTypeWrapper<RestProduto>;
  ProdutoDetalhe: ResolverTypeWrapper<RestProdutoDetalhe>;
  ProdutoImagem: ResolverTypeWrapper<RestProdutoImagem>;
  ProdutoInput: ResolverTypeWrapper<Partial<ProdutoInput>>;
  ProdutoPagina: ResolverTypeWrapper<ProdutoPaginaRest>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  ReindexResultado: ResolverTypeWrapper<RestReindexResultado>;
  SaldoAbaixoMinimo: ResolverTypeWrapper<RestSaldoAbaixoMinimo>;
  Saude: ResolverTypeWrapper<RestSaude>;
  StatusCaixa: ResolverTypeWrapper<Partial<StatusCaixa>>;
  StatusCarrinho: ResolverTypeWrapper<Partial<StatusCarrinho>>;
  StatusEmpresa: ResolverTypeWrapper<Partial<StatusEmpresa>>;
  StatusNotaFiscal: ResolverTypeWrapper<Partial<StatusNotaFiscal>>;
  StatusOrcamento: ResolverTypeWrapper<Partial<StatusOrcamento>>;
  StatusOs: ResolverTypeWrapper<Partial<StatusOs>>;
  StatusPagamento: ResolverTypeWrapper<Partial<StatusPagamento>>;
  StatusPedido: ResolverTypeWrapper<Partial<StatusPedido>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']['output']>>;
  SugestaoProduto: ResolverTypeWrapper<RestSugestaoProduto>;
  TabelaPreco: ResolverTypeWrapper<RestTabelaPreco>;
  TabelaPrecoDetalhe: ResolverTypeWrapper<TabelaDetalhe>;
  TabelaPrecoInput: ResolverTypeWrapper<Partial<TabelaPrecoInput>>;
  TabelaPrecoItem: ResolverTypeWrapper<RestTabelaPrecoItem>;
  TabelaPrecoPagina: ResolverTypeWrapper<TabelaPrecoPaginaRest>;
  TipoCaixaMovimentacao: ResolverTypeWrapper<Partial<TipoCaixaMovimentacao>>;
  TipoEndereco: ResolverTypeWrapper<Partial<TipoEndereco>>;
  TipoInteracao: ResolverTypeWrapper<Partial<TipoInteracao>>;
  TipoMovimentacao: ResolverTypeWrapper<Partial<TipoMovimentacao>>;
  TipoNotaFiscal: ResolverTypeWrapper<Partial<TipoNotaFiscal>>;
  Tokens: ResolverTypeWrapper<TokensResp>;
  UUID: ResolverTypeWrapper<Partial<Scalars['UUID']['output']>>;
  Usuario: ResolverTypeWrapper<RestUsuario>;
  UsuarioPagina: ResolverTypeWrapper<UsuarioPaginaRest>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AtualizarUsuarioInput: Partial<AtualizarUsuarioInput>;
  BaixarPagamentoInput: Partial<BaixarPagamentoInput>;
  Boolean: Partial<Scalars['Boolean']['output']>;
  BuscaPortalResultado: BuscaPortalResultadoRest;
  BuscaStaffResultado: BuscaStaffResultadoRest;
  Caixa: RestCaixa;
  CaixaMovimentacao: RestCaixaMovimentacao;
  CaixaPagina: CaixaPaginaRest;
  Carrinho: CarrinhoRest;
  CarrinhoItem: RestCarrinhoItem;
  CatalogoPortalPagina: CatalogoPortalPaginaRest;
  Categoria: RestCategoria;
  CategoriaInput: Partial<CategoriaInput>;
  CheckoutInput: Partial<CheckoutInput>;
  Contato: RestContato;
  ContatoInput: Partial<ContatoInput>;
  ContatoPagina: ContatoPaginaRest;
  ContatoSessao: RestContatoSessao;
  CriarUsuarioInput: Partial<CriarUsuarioInput>;
  Date: Partial<Scalars['Date']['output']>;
  DateTime: Partial<Scalars['DateTime']['output']>;
  Decimal: Partial<Scalars['Decimal']['output']>;
  Empresa: RestEmpresa;
  EmpresaInput: Partial<EmpresaInput>;
  EmpresaPagina: EmpresaPaginaRest;
  Endereco: RestEndereco;
  EnderecoInput: Partial<EnderecoInput>;
  EstoqueMovimentacao: RestEstoqueMovimentacao;
  EstoqueMovimentacaoPagina: EstoqueMovimentacaoPaginaRest;
  EstoqueSaldo: RestEstoqueSaldo;
  FacetaContagem: RestFacetaContagem;
  Facetas: RestFacetas;
  Float: Partial<Scalars['Float']['output']>;
  GerarParcelasInput: Partial<GerarParcelasInput>;
  ID: Partial<Scalars['ID']['output']>;
  Int: Partial<Scalars['Int']['output']>;
  Interacao: RestInteracao;
  InteracaoInput: Partial<InteracaoInput>;
  InteracaoPagina: InteracaoPaginaRest;
  ItemBuscaPortal: RestItemBuscaPortal;
  ItemBuscaStaff: RestItemBuscaStaff;
  ItemCatalogoPortal: RestItemCatalogoPortal;
  ItemOrcamentoInput: Partial<ItemOrcamentoInput>;
  ItemPedidoInput: Partial<ItemPedidoInput>;
  ItensOrcamentoInput: Partial<ItensOrcamentoInput>;
  JSON: Partial<Scalars['JSON']['output']>;
  LancarCaixaInput: Partial<LancarCaixaInput>;
  LogAuditoria: RestLogAuditoria;
  LogAuditoriaPagina: LogAuditoriaPaginaRest;
  LoginPortalPayload: PortalLoginResp;
  MovimentacaoEstoqueInput: Partial<MovimentacaoEstoqueInput>;
  Mutation: Record<PropertyKey, never>;
  NotaFiscal: RestNotaFiscal;
  NotaFiscalDetalhe: NotaDetalhe;
  NotaFiscalItem: RestNotaFiscalItem;
  NotaFiscalPagina: NotaFiscalPaginaRest;
  Oportunidade: RestOportunidade;
  OportunidadeInput: Partial<OportunidadeInput>;
  OportunidadePagina: OportunidadePaginaRest;
  Orcamento: RestOrcamento;
  OrcamentoDetalhe: RestOrcamentoDetalhe;
  OrcamentoInput: Partial<OrcamentoInput>;
  OrcamentoItem: RestOrcamentoItem;
  OrcamentoPagina: OrcamentoPaginaRest;
  OrdemServico: RestOrdemServico;
  OrdemServicoDetalhe: OsDetalhe;
  OrdemServicoInput: Partial<OrdemServicoInput>;
  OrdemServicoPagina: OrdemServicoPaginaRest;
  OsHistorico: RestOsHistorico;
  OsItem: RestOsItem;
  Pagamento: RestPagamento;
  PagamentoPagina: PagamentoPaginaRest;
  Pedido: RestPedido;
  PedidoDetalhe: RestPedidoDetalhe;
  PedidoItem: RestPedidoItem;
  PedidoManualInput: Partial<PedidoManualInput>;
  PedidoPagina: PedidoPaginaRest;
  Produto: RestProduto;
  ProdutoDetalhe: RestProdutoDetalhe;
  ProdutoImagem: RestProdutoImagem;
  ProdutoInput: Partial<ProdutoInput>;
  ProdutoPagina: ProdutoPaginaRest;
  Query: Record<PropertyKey, never>;
  ReindexResultado: RestReindexResultado;
  SaldoAbaixoMinimo: RestSaldoAbaixoMinimo;
  Saude: RestSaude;
  String: Partial<Scalars['String']['output']>;
  SugestaoProduto: RestSugestaoProduto;
  TabelaPreco: RestTabelaPreco;
  TabelaPrecoDetalhe: TabelaDetalhe;
  TabelaPrecoInput: Partial<TabelaPrecoInput>;
  TabelaPrecoItem: RestTabelaPrecoItem;
  TabelaPrecoPagina: TabelaPrecoPaginaRest;
  Tokens: TokensResp;
  UUID: Partial<Scalars['UUID']['output']>;
  Usuario: RestUsuario;
  UsuarioPagina: UsuarioPaginaRest;
};

export type BuscaPortalResultadoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BuscaPortalResultado'] = ResolversParentTypes['BuscaPortalResultado']> = {
  facetas?: Resolver<ResolversTypes['Facetas'], ParentType, ContextType>;
  itens?: Resolver<Array<ResolversTypes['ItemBuscaPortal']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type BuscaStaffResultadoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BuscaStaffResultado'] = ResolversParentTypes['BuscaStaffResultado']> = {
  facetas?: Resolver<ResolversTypes['Facetas'], ParentType, ContextType>;
  itens?: Resolver<Array<ResolversTypes['ItemBuscaStaff']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CaixaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Caixa'] = ResolversParentTypes['Caixa']> = {
  abertoEm?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  abertoPor?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  diferenca?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  fechadoEm?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  fechadoPor?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusCaixa'], ParentType, ContextType>;
  valorAbertura?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  valorFechamentoCalculado?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  valorFechamentoInformado?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
};

export type CaixaMovimentacaoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CaixaMovimentacao'] = ResolversParentTypes['CaixaMovimentacao']> = {
  caixaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  descricao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  formaPagamentoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  pagamentoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  tipo?: Resolver<ResolversTypes['TipoCaixaMovimentacao'], ParentType, ContextType>;
  usuarioId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  valor?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
};

export type CaixaPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CaixaPagina'] = ResolversParentTypes['CaixaPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Caixa']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CarrinhoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Carrinho'] = ResolversParentTypes['Carrinho']> = {
  contatoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  empresaId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  itens?: Resolver<Array<ResolversTypes['CarrinhoItem']>, ParentType, ContextType>;
  sessionId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusCarrinho'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  uuid?: Resolver<ResolversTypes['UUID'], ParentType, ContextType>;
};

export type CarrinhoItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CarrinhoItem'] = ResolversParentTypes['CarrinhoItem']> = {
  carrinhoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  precoUnitario?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quantidade?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type CatalogoPortalPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CatalogoPortalPagina'] = ResolversParentTypes['CatalogoPortalPagina']> = {
  itens?: Resolver<Array<ResolversTypes['ItemCatalogoPortal']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CategoriaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Categoria'] = ResolversParentTypes['Categoria']> = {
  ativa?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  categoriaPaiId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  descricao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imagemUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ordem?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ContatoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Contato'] = ResolversParentTypes['Contato']> = {
  acessoPortal?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  cargo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isPrincipal?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  observacoes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  telefone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  whatsapp?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ContatoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ContatoPagina'] = ResolversParentTypes['ContatoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Contato']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ContatoSessaoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ContatoSessao'] = ResolversParentTypes['ContatoSessao']> = {
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export interface DateScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Date'], any> {
  name: 'Date';
}

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface DecimalScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Decimal'], any> {
  name: 'Decimal';
}

export type EmpresaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Empresa'] = ResolversParentTypes['Empresa']> = {
  cnpj?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  inscricaoEstadual?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nomeFantasia?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  observacoes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  razaoSocial?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  segmento?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  site?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusEmpresa'], ParentType, ContextType>;
  tabelaPrecoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  telefone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type EmpresaPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['EmpresaPagina'] = ResolversParentTypes['EmpresaPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Empresa']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type EnderecoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Endereco'] = ResolversParentTypes['Endereco']> = {
  bairro?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  cep?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  cidade?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  complemento?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logradouro?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  numero?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  pais?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  principal?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  tipo?: Resolver<ResolversTypes['TipoEndereco'], ParentType, ContextType>;
  uf?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type EstoqueMovimentacaoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['EstoqueMovimentacao'] = ResolversParentTypes['EstoqueMovimentacao']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  motivo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ordemServicoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  pedidoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quantidade?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  saldoAntes?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  saldoDepois?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  tipo?: Resolver<ResolversTypes['TipoMovimentacao'], ParentType, ContextType>;
  usuarioId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type EstoqueMovimentacaoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['EstoqueMovimentacaoPagina'] = ResolversParentTypes['EstoqueMovimentacaoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['EstoqueMovimentacao']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type EstoqueSaldoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['EstoqueSaldo'] = ResolversParentTypes['EstoqueSaldo']> = {
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quantidadeDisponivel?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  quantidadeReservada?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
};

export type FacetaContagemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['FacetaContagem'] = ResolversParentTypes['FacetaContagem']> = {
  contagem?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  rotulo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  valor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type FacetasResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Facetas'] = ResolversParentTypes['Facetas']> = {
  categorias?: Resolver<Array<ResolversTypes['FacetaContagem']>, ParentType, ContextType>;
  marcas?: Resolver<Array<ResolversTypes['FacetaContagem']>, ParentType, ContextType>;
  precoMax?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoMin?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
};

export type InteracaoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Interacao'] = ResolversParentTypes['Interacao']> = {
  assunto?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contatoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  descricao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ocorridoEm?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  oportunidadeId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  proximaAcao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  proximaAcaoEm?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  tipo?: Resolver<ResolversTypes['TipoInteracao'], ParentType, ContextType>;
  usuarioId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type InteracaoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['InteracaoPagina'] = ResolversParentTypes['InteracaoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Interacao']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ItemBuscaPortalResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ItemBuscaPortal'] = ResolversParentTypes['ItemBuscaPortal']> = {
  alturaCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  ativo?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  categoriaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  comprimentoCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  controlaEstoque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  descricaoCurta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  descricaoTecnica?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  destaque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  estoqueMinimo?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  larguraCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marca?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ncm?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  origemMercadoria?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  pesoKg?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoCusto?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoEfetivo?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  precoVenda?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  score?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  sku?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  unidadeMedida?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ItemBuscaStaffResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ItemBuscaStaff'] = ResolversParentTypes['ItemBuscaStaff']> = {
  alturaCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  ativo?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  categoriaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  comprimentoCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  controlaEstoque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  descricaoCurta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  descricaoTecnica?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  destaque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  estoqueMinimo?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  larguraCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marca?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ncm?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  origemMercadoria?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  pesoKg?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoCusto?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoVenda?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  score?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  sku?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  unidadeMedida?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ItemCatalogoPortalResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ItemCatalogoPortal'] = ResolversParentTypes['ItemCatalogoPortal']> = {
  alturaCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  ativo?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  categoriaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  comprimentoCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  controlaEstoque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  descricaoCurta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  descricaoTecnica?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  destaque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  estoqueMinimo?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  larguraCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marca?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ncm?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  origemMercadoria?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  pesoKg?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoCusto?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoEfetivo?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  precoVenda?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  sku?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  unidadeMedida?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type LogAuditoriaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['LogAuditoria'] = ResolversParentTypes['LogAuditoria']> = {
  acao?: Resolver<ResolversTypes['AcaoAuditoria'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  dadosAntes?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  dadosDepois?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  entidade?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  entidadeId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ip?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  usuarioId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type LogAuditoriaPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['LogAuditoriaPagina'] = ResolversParentTypes['LogAuditoriaPagina']> = {
  itens?: Resolver<Array<ResolversTypes['LogAuditoria']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type LoginPortalPayloadResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['LoginPortalPayload'] = ResolversParentTypes['LoginPortalPayload']> = {
  accessExpiraEm?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  accessToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  contato?: Resolver<ResolversTypes['ContatoSessao'], ParentType, ContextType>;
  refreshExpiraEm?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  refreshToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  abrirCaixa?: Resolver<ResolversTypes['Caixa'], ParentType, ContextType, RequireFields<MutationAbrirCaixaArgs, 'valorAbertura'>>;
  adicionarItemCarrinho?: Resolver<ResolversTypes['Carrinho'], ParentType, ContextType, RequireFields<MutationAdicionarItemCarrinhoArgs, 'produtoId' | 'quantidade'>>;
  arquivarContato?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationArquivarContatoArgs, 'id'>>;
  arquivarEmpresa?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationArquivarEmpresaArgs, 'id'>>;
  arquivarProduto?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationArquivarProdutoArgs, 'id'>>;
  ativarPortalContato?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationAtivarPortalContatoArgs, 'id' | 'senha'>>;
  atualizarCategoria?: Resolver<ResolversTypes['Categoria'], ParentType, ContextType, RequireFields<MutationAtualizarCategoriaArgs, 'id' | 'input'>>;
  atualizarContato?: Resolver<ResolversTypes['Contato'], ParentType, ContextType, RequireFields<MutationAtualizarContatoArgs, 'id' | 'input'>>;
  atualizarEmpresa?: Resolver<ResolversTypes['Empresa'], ParentType, ContextType, RequireFields<MutationAtualizarEmpresaArgs, 'id' | 'input'>>;
  atualizarEndereco?: Resolver<ResolversTypes['Endereco'], ParentType, ContextType, RequireFields<MutationAtualizarEnderecoArgs, 'id' | 'input'>>;
  atualizarItemCarrinho?: Resolver<ResolversTypes['Carrinho'], ParentType, ContextType, RequireFields<MutationAtualizarItemCarrinhoArgs, 'produtoId' | 'quantidade'>>;
  atualizarItensOrcamento?: Resolver<ResolversTypes['Orcamento'], ParentType, ContextType, RequireFields<MutationAtualizarItensOrcamentoArgs, 'id' | 'input'>>;
  atualizarOportunidade?: Resolver<ResolversTypes['Oportunidade'], ParentType, ContextType, RequireFields<MutationAtualizarOportunidadeArgs, 'id' | 'input'>>;
  atualizarProduto?: Resolver<ResolversTypes['Produto'], ParentType, ContextType, RequireFields<MutationAtualizarProdutoArgs, 'id' | 'input'>>;
  atualizarTabelaPreco?: Resolver<ResolversTypes['TabelaPreco'], ParentType, ContextType, RequireFields<MutationAtualizarTabelaPrecoArgs, 'id' | 'input'>>;
  atualizarUsuario?: Resolver<ResolversTypes['Usuario'], ParentType, ContextType, RequireFields<MutationAtualizarUsuarioArgs, 'id' | 'input'>>;
  autorizarNotaFiscal?: Resolver<ResolversTypes['NotaFiscal'], ParentType, ContextType, RequireFields<MutationAutorizarNotaFiscalArgs, 'id'>>;
  baixarPagamento?: Resolver<ResolversTypes['Pagamento'], ParentType, ContextType, RequireFields<MutationBaixarPagamentoArgs, 'id' | 'input'>>;
  cancelarNotaFiscal?: Resolver<ResolversTypes['NotaFiscal'], ParentType, ContextType, RequireFields<MutationCancelarNotaFiscalArgs, 'id' | 'motivo'>>;
  checkoutPortal?: Resolver<ResolversTypes['Pedido'], ParentType, ContextType, RequireFields<MutationCheckoutPortalArgs, 'input'>>;
  consumirMaterialOs?: Resolver<ResolversTypes['OsItem'], ParentType, ContextType, RequireFields<MutationConsumirMaterialOsArgs, 'id' | 'produtoId' | 'quantidade'>>;
  converterOrcamento?: Resolver<ResolversTypes['Pedido'], ParentType, ContextType, RequireFields<MutationConverterOrcamentoArgs, 'id'>>;
  criarCategoria?: Resolver<ResolversTypes['Categoria'], ParentType, ContextType, RequireFields<MutationCriarCategoriaArgs, 'input'>>;
  criarContato?: Resolver<ResolversTypes['Contato'], ParentType, ContextType, RequireFields<MutationCriarContatoArgs, 'input'>>;
  criarEmpresa?: Resolver<ResolversTypes['Empresa'], ParentType, ContextType, RequireFields<MutationCriarEmpresaArgs, 'input'>>;
  criarEndereco?: Resolver<ResolversTypes['Endereco'], ParentType, ContextType, RequireFields<MutationCriarEnderecoArgs, 'input'>>;
  criarOportunidade?: Resolver<ResolversTypes['Oportunidade'], ParentType, ContextType, RequireFields<MutationCriarOportunidadeArgs, 'input'>>;
  criarOrcamento?: Resolver<ResolversTypes['Orcamento'], ParentType, ContextType, RequireFields<MutationCriarOrcamentoArgs, 'input'>>;
  criarOrdemServico?: Resolver<ResolversTypes['OrdemServico'], ParentType, ContextType, RequireFields<MutationCriarOrdemServicoArgs, 'input'>>;
  criarPedidoManual?: Resolver<ResolversTypes['Pedido'], ParentType, ContextType, RequireFields<MutationCriarPedidoManualArgs, 'input'>>;
  criarProduto?: Resolver<ResolversTypes['Produto'], ParentType, ContextType, RequireFields<MutationCriarProdutoArgs, 'input'>>;
  criarTabelaPreco?: Resolver<ResolversTypes['TabelaPreco'], ParentType, ContextType, RequireFields<MutationCriarTabelaPrecoArgs, 'input'>>;
  criarUsuario?: Resolver<ResolversTypes['Usuario'], ParentType, ContextType, RequireFields<MutationCriarUsuarioArgs, 'input'>>;
  definirPrecoTabela?: Resolver<ResolversTypes['TabelaPrecoItem'], ParentType, ContextType, RequireFields<MutationDefinirPrecoTabelaArgs, 'preco' | 'produtoId' | 'tabelaId'>>;
  definirUsuarioAtivo?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDefinirUsuarioAtivoArgs, 'ativo' | 'id'>>;
  desativarPortalContato?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDesativarPortalContatoArgs, 'id'>>;
  emitirNotaFiscal?: Resolver<ResolversTypes['NotaFiscal'], ParentType, ContextType, RequireFields<MutationEmitirNotaFiscalArgs, 'pedidoId'>>;
  estornarPagamento?: Resolver<ResolversTypes['Pagamento'], ParentType, ContextType, RequireFields<MutationEstornarPagamentoArgs, 'id' | 'motivo'>>;
  fecharCaixa?: Resolver<ResolversTypes['Caixa'], ParentType, ContextType, RequireFields<MutationFecharCaixaArgs, 'valorInformado'>>;
  gerarParcelas?: Resolver<Array<ResolversTypes['Pagamento']>, ParentType, ContextType, RequireFields<MutationGerarParcelasArgs, 'input'>>;
  lancarCaixa?: Resolver<ResolversTypes['CaixaMovimentacao'], ParentType, ContextType, RequireFields<MutationLancarCaixaArgs, 'input'>>;
  lancarMovimentacaoEstoque?: Resolver<ResolversTypes['EstoqueMovimentacao'], ParentType, ContextType, RequireFields<MutationLancarMovimentacaoEstoqueArgs, 'input'>>;
  loginPortal?: Resolver<ResolversTypes['LoginPortalPayload'], ParentType, ContextType, RequireFields<MutationLoginPortalArgs, 'email' | 'senha'>>;
  loginStaff?: Resolver<ResolversTypes['Tokens'], ParentType, ContextType, RequireFields<MutationLoginStaffArgs, 'email' | 'senha'>>;
  logout?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationLogoutArgs, 'refreshToken'>>;
  moverEstagioOportunidade?: Resolver<ResolversTypes['Oportunidade'], ParentType, ContextType, RequireFields<MutationMoverEstagioOportunidadeArgs, 'estagio' | 'id'>>;
  refreshSession?: Resolver<ResolversTypes['Tokens'], ParentType, ContextType, RequireFields<MutationRefreshSessionArgs, 'refreshToken'>>;
  registrarInteracao?: Resolver<ResolversTypes['Interacao'], ParentType, ContextType, RequireFields<MutationRegistrarInteracaoArgs, 'input'>>;
  reindexarBusca?: Resolver<ResolversTypes['ReindexResultado'], ParentType, ContextType>;
  removerEndereco?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationRemoverEnderecoArgs, 'id'>>;
  removerItemCarrinho?: Resolver<ResolversTypes['Carrinho'], ParentType, ContextType, RequireFields<MutationRemoverItemCarrinhoArgs, 'produtoId'>>;
  removerItemTabela?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationRemoverItemTabelaArgs, 'produtoId' | 'tabelaId'>>;
  transicionarOrcamento?: Resolver<ResolversTypes['Orcamento'], ParentType, ContextType, RequireFields<MutationTransicionarOrcamentoArgs, 'id' | 'status'>>;
  transicionarOrdemServico?: Resolver<ResolversTypes['OrdemServico'], ParentType, ContextType, RequireFields<MutationTransicionarOrdemServicoArgs, 'id' | 'status'>>;
  transicionarPedido?: Resolver<ResolversTypes['Pedido'], ParentType, ContextType, RequireFields<MutationTransicionarPedidoArgs, 'id' | 'status'>>;
  trocarSenha?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationTrocarSenhaArgs, 'novaSenha' | 'senhaAtual'>>;
};

export type NotaFiscalResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['NotaFiscal'] = ResolversParentTypes['NotaFiscal']> = {
  cfop?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  chaveAcesso?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  emitidaEm?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  motivoCancelamento?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  naturezaOperacao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  numero?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  pdfPath?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  pedidoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  protocoloAutorizacao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  serie?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusNotaFiscal'], ParentType, ContextType>;
  tipo?: Resolver<ResolversTypes['TipoNotaFiscal'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  valorDesconto?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  valorFrete?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  valorProdutos?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  valorTotal?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  xmlPath?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type NotaFiscalDetalheResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['NotaFiscalDetalhe'] = ResolversParentTypes['NotaFiscalDetalhe']> = {
  itens?: Resolver<Array<ResolversTypes['NotaFiscalItem']>, ParentType, ContextType>;
  nota?: Resolver<ResolversTypes['NotaFiscal'], ParentType, ContextType>;
};

export type NotaFiscalItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['NotaFiscalItem'] = ResolversParentTypes['NotaFiscalItem']> = {
  cfop?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  codigo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  cofinsValor?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  descricao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  icmsAliquota?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  icmsValor?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ipiAliquota?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  ipiValor?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  ncm?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nfId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  pisValor?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  produtoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  quantidade?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  unidade?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  valorTotal?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  valorUnitario?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
};

export type NotaFiscalPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['NotaFiscalPagina'] = ResolversParentTypes['NotaFiscalPagina']> = {
  itens?: Resolver<Array<ResolversTypes['NotaFiscal']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type OportunidadeResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Oportunidade'] = ResolversParentTypes['Oportunidade']> = {
  contatoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  dataPrevistaFechamento?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  descricao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  estagio?: Resolver<ResolversTypes['EstagioOportunidade'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  motivoPerda?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  origem?: Resolver<Maybe<ResolversTypes['OrigemOportunidade']>, ParentType, ContextType>;
  responsavelId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  titulo?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  valorEstimado?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
};

export type OportunidadePaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OportunidadePagina'] = ResolversParentTypes['OportunidadePagina']> = {
  itens?: Resolver<Array<ResolversTypes['Oportunidade']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type OrcamentoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Orcamento'] = ResolversParentTypes['Orcamento']> = {
  condicaoPagamento?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contatoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  convertidoPedidoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  desconto?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  emitidoEm?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  frete?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  numero?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  observacoes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  oportunidadeId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusOrcamento'], ParentType, ContextType>;
  subtotal?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  validoAte?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  vendedorId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type OrcamentoDetalheResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrcamentoDetalhe'] = ResolversParentTypes['OrcamentoDetalhe']> = {
  itens?: Resolver<Array<ResolversTypes['OrcamentoItem']>, ParentType, ContextType>;
  orcamento?: Resolver<ResolversTypes['Orcamento'], ParentType, ContextType>;
};

export type OrcamentoItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrcamentoItem'] = ResolversParentTypes['OrcamentoItem']> = {
  desconto?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  descricao?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  orcamentoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  precoUnitario?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quantidade?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
};

export type OrcamentoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrcamentoPagina'] = ResolversParentTypes['OrcamentoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Orcamento']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type OrdemServicoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrdemServico'] = ResolversParentTypes['OrdemServico']> = {
  abertaEm?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  concluidaEm?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  contatoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  descricao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  numero?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  observacoes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  pedidoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  previstaEm?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  prioridade?: Resolver<ResolversTypes['PrioridadeOs'], ParentType, ContextType>;
  responsavelId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusOs'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  valorMaoObra?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  valorTotal?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
};

export type OrdemServicoDetalheResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrdemServicoDetalhe'] = ResolversParentTypes['OrdemServicoDetalhe']> = {
  historico?: Resolver<Array<ResolversTypes['OsHistorico']>, ParentType, ContextType>;
  itens?: Resolver<Array<ResolversTypes['OsItem']>, ParentType, ContextType>;
  ordem?: Resolver<ResolversTypes['OrdemServico'], ParentType, ContextType>;
};

export type OrdemServicoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OrdemServicoPagina'] = ResolversParentTypes['OrdemServicoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['OrdemServico']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type OsHistoricoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OsHistorico'] = ResolversParentTypes['OsHistorico']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  observacao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  osId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  statusAnterior?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  statusNovo?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  usuarioId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type OsItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['OsItem'] = ResolversParentTypes['OsItem']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  osId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  precoUnitario?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quantidade?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
};

export type PagamentoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Pagamento'] = ResolversParentTypes['Pagamento']> = {
  caixaMovimentacaoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  formaPagamentoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  observacao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  pagoEm?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  parcelaNum?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  pedidoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusPagamento'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  valor?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  vencimento?: Resolver<ResolversTypes['Date'], ParentType, ContextType>;
};

export type PagamentoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PagamentoPagina'] = ResolversParentTypes['PagamentoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Pagamento']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type PedidoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Pedido'] = ResolversParentTypes['Pedido']> = {
  carrinhoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  condicaoPagamento?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contatoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  desconto?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  empresaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  enderecoEntregaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  enderecoFaturamentoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  frete?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  numero?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  observacoes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  orcamentoId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  origem?: Resolver<ResolversTypes['OrigemPedido'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['StatusPedido'], ParentType, ContextType>;
  subtotal?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  vendedorId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type PedidoDetalheResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PedidoDetalhe'] = ResolversParentTypes['PedidoDetalhe']> = {
  itens?: Resolver<Array<ResolversTypes['PedidoItem']>, ParentType, ContextType>;
  pedido?: Resolver<ResolversTypes['Pedido'], ParentType, ContextType>;
};

export type PedidoItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PedidoItem'] = ResolversParentTypes['PedidoItem']> = {
  desconto?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  descricao?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  pedidoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  precoUnitario?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quantidade?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  sku?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
};

export type PedidoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PedidoPagina'] = ResolversParentTypes['PedidoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Pedido']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ProdutoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Produto'] = ResolversParentTypes['Produto']> = {
  alturaCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  ativo?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  categoriaId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  comprimentoCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  controlaEstoque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deletedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  descricaoCurta?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  descricaoTecnica?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  destaque?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  estoqueMinimo?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  larguraCm?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  marca?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ncm?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  origemMercadoria?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  pesoKg?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoCusto?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  precoVenda?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  sku?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  unidadeMedida?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ProdutoDetalheResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ProdutoDetalhe'] = ResolversParentTypes['ProdutoDetalhe']> = {
  imagens?: Resolver<Array<ResolversTypes['ProdutoImagem']>, ParentType, ContextType>;
  produto?: Resolver<ResolversTypes['Produto'], ParentType, ContextType>;
};

export type ProdutoImagemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ProdutoImagem'] = ResolversParentTypes['ProdutoImagem']> = {
  altText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isPrincipal?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  ordem?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ProdutoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ProdutoPagina'] = ResolversParentTypes['ProdutoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Produto']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  auditoria?: Resolver<ResolversTypes['LogAuditoriaPagina'], ParentType, ContextType, Partial<QueryAuditoriaArgs>>;
  buscarProdutosPortal?: Resolver<ResolversTypes['BuscaPortalResultado'], ParentType, ContextType, Partial<QueryBuscarProdutosPortalArgs>>;
  buscarProdutosStaff?: Resolver<ResolversTypes['BuscaStaffResultado'], ParentType, ContextType, Partial<QueryBuscarProdutosStaffArgs>>;
  caixaAberto?: Resolver<Maybe<ResolversTypes['Caixa']>, ParentType, ContextType>;
  caixaMovimentacoes?: Resolver<Array<ResolversTypes['CaixaMovimentacao']>, ParentType, ContextType, RequireFields<QueryCaixaMovimentacoesArgs, 'caixaId'>>;
  caixas?: Resolver<ResolversTypes['CaixaPagina'], ParentType, ContextType, Partial<QueryCaixasArgs>>;
  carrinhoPortal?: Resolver<ResolversTypes['Carrinho'], ParentType, ContextType>;
  catalogoPortal?: Resolver<ResolversTypes['CatalogoPortalPagina'], ParentType, ContextType, Partial<QueryCatalogoPortalArgs>>;
  categorias?: Resolver<Array<ResolversTypes['Categoria']>, ParentType, ContextType, Partial<QueryCategoriasArgs>>;
  contato?: Resolver<Maybe<ResolversTypes['Contato']>, ParentType, ContextType, RequireFields<QueryContatoArgs, 'id'>>;
  contatos?: Resolver<ResolversTypes['ContatoPagina'], ParentType, ContextType, Partial<QueryContatosArgs>>;
  empresa?: Resolver<Maybe<ResolversTypes['Empresa']>, ParentType, ContextType, RequireFields<QueryEmpresaArgs, 'id'>>;
  empresas?: Resolver<ResolversTypes['EmpresaPagina'], ParentType, ContextType, Partial<QueryEmpresasArgs>>;
  enderecos?: Resolver<Array<ResolversTypes['Endereco']>, ParentType, ContextType, RequireFields<QueryEnderecosArgs, 'empresaId'>>;
  estoqueAbaixoDoMinimo?: Resolver<Array<ResolversTypes['SaldoAbaixoMinimo']>, ParentType, ContextType, Partial<QueryEstoqueAbaixoDoMinimoArgs>>;
  estoqueMovimentacoes?: Resolver<ResolversTypes['EstoqueMovimentacaoPagina'], ParentType, ContextType, Partial<QueryEstoqueMovimentacoesArgs>>;
  estoqueSaldo?: Resolver<ResolversTypes['EstoqueSaldo'], ParentType, ContextType, RequireFields<QueryEstoqueSaldoArgs, 'produtoId'>>;
  health?: Resolver<ResolversTypes['Saude'], ParentType, ContextType>;
  interacoes?: Resolver<ResolversTypes['InteracaoPagina'], ParentType, ContextType, Partial<QueryInteracoesArgs>>;
  notaFiscal?: Resolver<Maybe<ResolversTypes['NotaFiscalDetalhe']>, ParentType, ContextType, RequireFields<QueryNotaFiscalArgs, 'id'>>;
  notasFiscais?: Resolver<ResolversTypes['NotaFiscalPagina'], ParentType, ContextType, Partial<QueryNotasFiscaisArgs>>;
  oportunidade?: Resolver<Maybe<ResolversTypes['Oportunidade']>, ParentType, ContextType, RequireFields<QueryOportunidadeArgs, 'id'>>;
  oportunidades?: Resolver<ResolversTypes['OportunidadePagina'], ParentType, ContextType, Partial<QueryOportunidadesArgs>>;
  orcamento?: Resolver<Maybe<ResolversTypes['OrcamentoDetalhe']>, ParentType, ContextType, RequireFields<QueryOrcamentoArgs, 'id'>>;
  orcamentos?: Resolver<ResolversTypes['OrcamentoPagina'], ParentType, ContextType, Partial<QueryOrcamentosArgs>>;
  ordemServico?: Resolver<Maybe<ResolversTypes['OrdemServicoDetalhe']>, ParentType, ContextType, RequireFields<QueryOrdemServicoArgs, 'id'>>;
  ordensServico?: Resolver<ResolversTypes['OrdemServicoPagina'], ParentType, ContextType, Partial<QueryOrdensServicoArgs>>;
  pagamentos?: Resolver<ResolversTypes['PagamentoPagina'], ParentType, ContextType, Partial<QueryPagamentosArgs>>;
  pedido?: Resolver<Maybe<ResolversTypes['PedidoDetalhe']>, ParentType, ContextType, RequireFields<QueryPedidoArgs, 'id'>>;
  pedidos?: Resolver<ResolversTypes['PedidoPagina'], ParentType, ContextType, Partial<QueryPedidosArgs>>;
  produto?: Resolver<Maybe<ResolversTypes['ProdutoDetalhe']>, ParentType, ContextType, RequireFields<QueryProdutoArgs, 'id'>>;
  produtos?: Resolver<ResolversTypes['ProdutoPagina'], ParentType, ContextType, Partial<QueryProdutosArgs>>;
  ready?: Resolver<ResolversTypes['Saude'], ParentType, ContextType>;
  sugerirProdutosPortal?: Resolver<Array<ResolversTypes['SugestaoProduto']>, ParentType, ContextType, RequireFields<QuerySugerirProdutosPortalArgs, 'q'>>;
  tabelaPreco?: Resolver<Maybe<ResolversTypes['TabelaPrecoDetalhe']>, ParentType, ContextType, RequireFields<QueryTabelaPrecoArgs, 'id'>>;
  tabelasPreco?: Resolver<ResolversTypes['TabelaPrecoPagina'], ParentType, ContextType, Partial<QueryTabelasPrecoArgs>>;
  usuario?: Resolver<Maybe<ResolversTypes['Usuario']>, ParentType, ContextType, RequireFields<QueryUsuarioArgs, 'id'>>;
  usuarios?: Resolver<ResolversTypes['UsuarioPagina'], ParentType, ContextType, Partial<QueryUsuariosArgs>>;
};

export type ReindexResultadoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ReindexResultado'] = ResolversParentTypes['ReindexResultado']> = {
  indexados?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type SaldoAbaixoMinimoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SaldoAbaixoMinimo'] = ResolversParentTypes['SaldoAbaixoMinimo']> = {
  produto?: Resolver<ResolversTypes['Produto'], ParentType, ContextType>;
  saldo?: Resolver<ResolversTypes['EstoqueSaldo'], ParentType, ContextType>;
};

export type SaudeResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Saude'] = ResolversParentTypes['Saude']> = {
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  versao?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type SugestaoProdutoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SugestaoProduto'] = ResolversParentTypes['SugestaoProduto']> = {
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  sku?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type TabelaPrecoResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TabelaPreco'] = ResolversParentTypes['TabelaPreco']> = {
  ativa?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  descricao?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type TabelaPrecoDetalheResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TabelaPrecoDetalhe'] = ResolversParentTypes['TabelaPrecoDetalhe']> = {
  itens?: Resolver<Array<ResolversTypes['TabelaPrecoItem']>, ParentType, ContextType>;
  tabela?: Resolver<ResolversTypes['TabelaPreco'], ParentType, ContextType>;
};

export type TabelaPrecoItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TabelaPrecoItem'] = ResolversParentTypes['TabelaPrecoItem']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  preco?: Resolver<ResolversTypes['Decimal'], ParentType, ContextType>;
  produtoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  tabelaPrecoId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type TabelaPrecoPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TabelaPrecoPagina'] = ResolversParentTypes['TabelaPrecoPagina']> = {
  itens?: Resolver<Array<ResolversTypes['TabelaPreco']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type TokensResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Tokens'] = ResolversParentTypes['Tokens']> = {
  accessExpiraEm?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  accessToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  refreshExpiraEm?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  refreshToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export interface UuidScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UUID'], any> {
  name: 'UUID';
}

export type UsuarioResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Usuario'] = ResolversParentTypes['Usuario']> = {
  ativo?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  nome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  perfil?: Resolver<ResolversTypes['Perfil'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type UsuarioPaginaResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['UsuarioPagina'] = ResolversParentTypes['UsuarioPagina']> = {
  itens?: Resolver<Array<ResolversTypes['Usuario']>, ParentType, ContextType>;
  pagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  porPagina?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalPaginas?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type Resolvers<ContextType = GraphQLContext> = {
  BuscaPortalResultado?: BuscaPortalResultadoResolvers<ContextType>;
  BuscaStaffResultado?: BuscaStaffResultadoResolvers<ContextType>;
  Caixa?: CaixaResolvers<ContextType>;
  CaixaMovimentacao?: CaixaMovimentacaoResolvers<ContextType>;
  CaixaPagina?: CaixaPaginaResolvers<ContextType>;
  Carrinho?: CarrinhoResolvers<ContextType>;
  CarrinhoItem?: CarrinhoItemResolvers<ContextType>;
  CatalogoPortalPagina?: CatalogoPortalPaginaResolvers<ContextType>;
  Categoria?: CategoriaResolvers<ContextType>;
  Contato?: ContatoResolvers<ContextType>;
  ContatoPagina?: ContatoPaginaResolvers<ContextType>;
  ContatoSessao?: ContatoSessaoResolvers<ContextType>;
  Date?: GraphQLScalarType;
  DateTime?: GraphQLScalarType;
  Decimal?: GraphQLScalarType;
  Empresa?: EmpresaResolvers<ContextType>;
  EmpresaPagina?: EmpresaPaginaResolvers<ContextType>;
  Endereco?: EnderecoResolvers<ContextType>;
  EstoqueMovimentacao?: EstoqueMovimentacaoResolvers<ContextType>;
  EstoqueMovimentacaoPagina?: EstoqueMovimentacaoPaginaResolvers<ContextType>;
  EstoqueSaldo?: EstoqueSaldoResolvers<ContextType>;
  FacetaContagem?: FacetaContagemResolvers<ContextType>;
  Facetas?: FacetasResolvers<ContextType>;
  Interacao?: InteracaoResolvers<ContextType>;
  InteracaoPagina?: InteracaoPaginaResolvers<ContextType>;
  ItemBuscaPortal?: ItemBuscaPortalResolvers<ContextType>;
  ItemBuscaStaff?: ItemBuscaStaffResolvers<ContextType>;
  ItemCatalogoPortal?: ItemCatalogoPortalResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  LogAuditoria?: LogAuditoriaResolvers<ContextType>;
  LogAuditoriaPagina?: LogAuditoriaPaginaResolvers<ContextType>;
  LoginPortalPayload?: LoginPortalPayloadResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  NotaFiscal?: NotaFiscalResolvers<ContextType>;
  NotaFiscalDetalhe?: NotaFiscalDetalheResolvers<ContextType>;
  NotaFiscalItem?: NotaFiscalItemResolvers<ContextType>;
  NotaFiscalPagina?: NotaFiscalPaginaResolvers<ContextType>;
  Oportunidade?: OportunidadeResolvers<ContextType>;
  OportunidadePagina?: OportunidadePaginaResolvers<ContextType>;
  Orcamento?: OrcamentoResolvers<ContextType>;
  OrcamentoDetalhe?: OrcamentoDetalheResolvers<ContextType>;
  OrcamentoItem?: OrcamentoItemResolvers<ContextType>;
  OrcamentoPagina?: OrcamentoPaginaResolvers<ContextType>;
  OrdemServico?: OrdemServicoResolvers<ContextType>;
  OrdemServicoDetalhe?: OrdemServicoDetalheResolvers<ContextType>;
  OrdemServicoPagina?: OrdemServicoPaginaResolvers<ContextType>;
  OsHistorico?: OsHistoricoResolvers<ContextType>;
  OsItem?: OsItemResolvers<ContextType>;
  Pagamento?: PagamentoResolvers<ContextType>;
  PagamentoPagina?: PagamentoPaginaResolvers<ContextType>;
  Pedido?: PedidoResolvers<ContextType>;
  PedidoDetalhe?: PedidoDetalheResolvers<ContextType>;
  PedidoItem?: PedidoItemResolvers<ContextType>;
  PedidoPagina?: PedidoPaginaResolvers<ContextType>;
  Produto?: ProdutoResolvers<ContextType>;
  ProdutoDetalhe?: ProdutoDetalheResolvers<ContextType>;
  ProdutoImagem?: ProdutoImagemResolvers<ContextType>;
  ProdutoPagina?: ProdutoPaginaResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  ReindexResultado?: ReindexResultadoResolvers<ContextType>;
  SaldoAbaixoMinimo?: SaldoAbaixoMinimoResolvers<ContextType>;
  Saude?: SaudeResolvers<ContextType>;
  SugestaoProduto?: SugestaoProdutoResolvers<ContextType>;
  TabelaPreco?: TabelaPrecoResolvers<ContextType>;
  TabelaPrecoDetalhe?: TabelaPrecoDetalheResolvers<ContextType>;
  TabelaPrecoItem?: TabelaPrecoItemResolvers<ContextType>;
  TabelaPrecoPagina?: TabelaPrecoPaginaResolvers<ContextType>;
  Tokens?: TokensResolvers<ContextType>;
  UUID?: GraphQLScalarType;
  Usuario?: UsuarioResolvers<ContextType>;
  UsuarioPagina?: UsuarioPaginaResolvers<ContextType>;
};

