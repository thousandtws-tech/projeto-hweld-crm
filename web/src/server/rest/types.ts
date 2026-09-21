/**
 * Contratos JSON da API REST (`/api/v1`), em snake_case — espelho fiel do
 * que o backend Actix serializa. Uso exclusivo dentro do BFF
 * (`src/server/**`); a UI só enxerga os tipos GraphQL gerados.
 */

// ── Compartilhados ──────────────────────────────────────────────────────────

export type PaginacaoQuery = { pagina?: number; por_pagina?: number };

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
}

export interface ErroCampoApi {
  campo: string;
  mensagem: string;
}

/** Envelope de erro do backend: `{ "erro": { ... } }`. */
export interface ErroApiBody {
  erro?: {
    codigo?: string;
    mensagem?: string;
    campos?: ErroCampoApi[];
  };
}

// ── Saúde / Auth ────────────────────────────────────────────────────────────

export interface Saude {
  status: string;
  versao: string;
}

export interface TokensResp {
  access_token: string;
  token_type: string;
  access_expira_em: number;
  refresh_token: string;
  refresh_expira_em: number;
}

export interface ContatoSessao {
  id: number;
  nome: string;
  empresa_id: number;
}

export interface PortalLoginResp extends TokensResp {
  contato: ContatoSessao;
}

// ── Usuários ────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// ── CRM ─────────────────────────────────────────────────────────────────────

export interface Empresa {
  id: number;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  segmento: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  status: string;
  tabela_preco_id: number | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Contato {
  id: number;
  empresa_id: number;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  is_principal: boolean;
  acesso_portal: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Endereco {
  id: number;
  empresa_id: number;
  tipo: string;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string;
  pais: string;
  principal: boolean;
  created_at: string;
  updated_at: string;
}

export interface Oportunidade {
  id: number;
  empresa_id: number;
  contato_id: number | null;
  responsavel_id: number;
  titulo: string;
  descricao: string | null;
  origem: string | null;
  estagio: string;
  valor_estimado: string | null;
  data_prevista_fechamento: string | null;
  motivo_perda: string | null;
  created_at: string;
  updated_at: string;
}

export interface Interacao {
  id: number;
  empresa_id: number;
  contato_id: number | null;
  oportunidade_id: number | null;
  usuario_id: number | null;
  tipo: string;
  assunto: string | null;
  descricao: string | null;
  ocorrido_em: string;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  created_at: string;
}

// ── Orçamentos ──────────────────────────────────────────────────────────────

export interface OrcamentoItem {
  id: number;
  orcamento_id: number;
  produto_id: number;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
  desconto: string;
  total: string;
}

export interface Orcamento {
  id: number;
  numero: string;
  empresa_id: number;
  contato_id: number | null;
  oportunidade_id: number | null;
  vendedor_id: number;
  status: string;
  emitido_em: string;
  valido_ate: string | null;
  subtotal: string;
  desconto: string;
  frete: string;
  total: string;
  condicao_pagamento: string | null;
  observacoes: string | null;
  convertido_pedido_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface OrcamentoDetalhe {
  orcamento: Orcamento;
  itens: OrcamentoItem[];
}

// ── Catálogo ────────────────────────────────────────────────────────────────

export interface Categoria {
  id: number;
  categoria_pai_id: number | null;
  nome: string;
  slug: string;
  descricao: string | null;
  imagem_url: string | null;
  ordem: number;
  ativa: boolean;
  created_at: string;
  updated_at: string;
}

export interface Produto {
  id: number;
  sku: string;
  nome: string;
  slug: string;
  categoria_id: number;
  marca: string | null;
  unidade_medida: string | null;
  descricao_curta: string | null;
  descricao_tecnica: string | null;
  ncm: string | null;
  origem_mercadoria: string;
  peso_kg: string | null;
  altura_cm: string | null;
  largura_cm: string | null;
  comprimento_cm: string | null;
  preco_custo: string | null;
  preco_venda: string;
  estoque_minimo: string | null;
  controla_estoque: boolean;
  ativo: boolean;
  destaque: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProdutoImagem {
  id: number;
  produto_id: number;
  url: string;
  alt_text: string | null;
  ordem: number;
  is_principal: boolean;
}

export interface ProdutoDetalhe {
  produto: Produto;
  imagens: ProdutoImagem[];
}

export interface TabelaPreco {
  id: number;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  created_at: string;
  updated_at: string;
}

export interface TabelaPrecoItem {
  id: number;
  tabela_preco_id: number;
  produto_id: number;
  preco: string;
}

export interface TabelaDetalhe {
  tabela: TabelaPreco;
  itens: TabelaPrecoItem[];
}

// ── Pedidos ─────────────────────────────────────────────────────────────────

export interface PedidoItem {
  id: number;
  pedido_id: number;
  produto_id: number;
  descricao: string;
  sku: string;
  quantidade: string;
  preco_unitario: string;
  desconto: string;
  total: string;
}

export interface Pedido {
  id: number;
  numero: string;
  empresa_id: number;
  contato_id: number;
  endereco_faturamento_id: number;
  endereco_entrega_id: number;
  origem: string;
  orcamento_id: number | null;
  carrinho_id: number | null;
  vendedor_id: number | null;
  status: string;
  subtotal: string;
  desconto: string;
  frete: string;
  total: string;
  condicao_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PedidoDetalhe {
  pedido: Pedido;
  itens: PedidoItem[];
}

// ── Estoque ─────────────────────────────────────────────────────────────────

export interface EstoqueSaldo {
  produto_id: number;
  quantidade_disponivel: string;
  quantidade_reservada: string;
}

export interface EstoqueMovimentacao {
  id: number;
  produto_id: number;
  tipo: string;
  quantidade: string;
  saldo_antes: string;
  saldo_depois: string;
  pedido_id: number | null;
  ordem_servico_id: number | null;
  usuario_id: number | null;
  motivo: string | null;
  created_at: string;
}

export interface SaldoAbaixoMinimo {
  produto: Produto;
  saldo: EstoqueSaldo;
}

// ── Ordens de serviço ───────────────────────────────────────────────────────

export interface OrdemServico {
  id: number;
  numero: string;
  pedido_id: number | null;
  empresa_id: number;
  contato_id: number | null;
  responsavel_id: number | null;
  descricao: string | null;
  status: string;
  prioridade: string;
  aberta_em: string;
  prevista_em: string | null;
  concluida_em: string | null;
  valor_mao_obra: string | null;
  valor_total: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OsItem {
  id: number;
  os_id: number;
  produto_id: number;
  quantidade: string;
  preco_unitario: string;
  total: string;
}

export interface OsHistorico {
  id: number;
  os_id: number;
  status_anterior: string | null;
  status_novo: string;
  usuario_id: number | null;
  observacao: string | null;
  created_at: string;
}

export interface OsDetalhe {
  ordem: OrdemServico;
  itens: OsItem[];
  historico: OsHistorico[];
}

// ── Fiscal ──────────────────────────────────────────────────────────────────

export interface NotaFiscal {
  id: number;
  numero: string;
  serie: string | null;
  chave_acesso: string | null;
  pedido_id: number;
  empresa_id: number;
  tipo: string;
  status: string;
  natureza_operacao: string | null;
  cfop: string | null;
  emitida_em: string | null;
  valor_produtos: string | null;
  valor_frete: string | null;
  valor_desconto: string | null;
  valor_total: string | null;
  protocolo_autorizacao: string | null;
  xml_path: string | null;
  pdf_path: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotaFiscalItem {
  id: number;
  nf_id: number;
  produto_id: number | null;
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: string | null;
  valor_unitario: string | null;
  valor_total: string | null;
  icms_aliquota: string | null;
  icms_valor: string | null;
  ipi_aliquota: string | null;
  ipi_valor: string | null;
  pis_valor: string | null;
  cofins_valor: string | null;
}

export interface NotaDetalhe {
  nota: NotaFiscal;
  itens: NotaFiscalItem[];
}

// ── Financeiro ──────────────────────────────────────────────────────────────

export interface Pagamento {
  id: number;
  pedido_id: number;
  parcela_num: number;
  valor: string;
  vencimento: string;
  pago_em: string | null;
  status: string;
  forma_pagamento_id: number | null;
  caixa_movimentacao_id: number | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface Caixa {
  id: number;
  aberto_por: number;
  aberto_em: string;
  valor_abertura: string;
  fechado_por: number | null;
  fechado_em: string | null;
  valor_fechamento_calculado: string | null;
  valor_fechamento_informado: string | null;
  diferenca: string | null;
  status: string;
}

export interface CaixaMovimentacao {
  id: number;
  caixa_id: number;
  tipo: string;
  valor: string;
  forma_pagamento_id: number | null;
  pagamento_id: number | null;
  usuario_id: number | null;
  descricao: string | null;
  created_at: string;
}

// ── Auditoria ───────────────────────────────────────────────────────────────

export interface LogAuditoria {
  id: number;
  usuario_id: number | null;
  entidade: string;
  entidade_id: number;
  acao: string;
  dados_antes: unknown;
  dados_depois: unknown;
  ip: string | null;
  created_at: string;
}

// ── Busca ───────────────────────────────────────────────────────────────────

export interface FacetaContagem {
  valor: string;
  rotulo: string | null;
  contagem: number;
}

export interface Facetas {
  categorias: FacetaContagem[];
  marcas: FacetaContagem[];
  preco_min: string | null;
  preco_max: string | null;
}

export interface ItemBuscaStaff extends Produto {
  score: number;
}

export interface ItemBuscaPortal extends Produto {
  preco_efetivo: string;
  score: number;
}

export interface BuscaPaginada<T> extends Pagina<T> {
  facetas: Facetas;
}

export interface SugestaoProduto {
  produto_id: number;
  nome: string;
  sku: string;
}

export interface ReindexResultado {
  indexados: number;
}

// ── Portal B2B ──────────────────────────────────────────────────────────────

export interface ItemCatalogoPortal extends Produto {
  preco_efetivo: string;
}

export interface CarrinhoItem {
  id: number;
  carrinho_id: number;
  produto_id: number;
  quantidade: string;
  preco_unitario: string;
  created_at: string;
  updated_at: string;
}

/** `CarrinhoDetalhe` é flatten: campos de `Carrinho` + `itens` + `total`. */
export interface CarrinhoDetalhe {
  id: number;
  uuid: string;
  contato_id: number | null;
  empresa_id: number | null;
  session_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  itens: CarrinhoItem[];
  total: string;
}
