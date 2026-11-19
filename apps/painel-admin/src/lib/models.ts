/** Modelos do backoffice — mesmos DTOs do OpenAPI. Dinheiro/Quantidade = string. */

export type Dinheiro = string;
export type Quantidade = string;

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

/** Dispositivo resolvido no backend a partir do User-Agent (woothee). */
export interface DispositivoSessao {
  categoria: "desktop" | "smartphone" | "tablet" | "desconhecido";
  navegador: string | null;
  sistema: string | null;
}

/** Sessão ativa em `GET /auth/sessoes` — uma linha por sessão (rotação agrupada). */
export interface Sessao {
  /** sessao_id — UUID estável que identifica a sessão. */
  id: string;
  dispositivo: DispositivoSessao;
  ip: string | null;
  criado_em: string;
  ultimo_acesso_em: string;
  /** true quando é a sessão que emitiu o access token do request. */
  atual: boolean;
}

/** Notificação do sino — o destino nunca vem na resposta (escopo do token). */
export interface Notificacao {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  /** Rota interna do app (ex.: /vendas/pedidos/3) — nunca URL externa. */
  link: string | null;
  lida_em: string | null;
  created_at: string;
}

export type Perfil = "admin" | "vendedor" | "financeiro" | "estoque" | "tecnico";

export const PERFIS: Perfil[] = ["admin", "vendedor", "financeiro", "estoque", "tecnico"];

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

export type StatusPedido =
  | "aguardando_pagamento"
  | "confirmado"
  | "em_separacao"
  | "faturado"
  | "enviado"
  | "entregue"
  | "concluido"
  | "cancelado";

export type StatusOrcamento =
  "rascunho" | "enviado" | "em_analise" | "aprovado" | "recusado" | "expirado" | "convertido";

export type EstagioOportunidade =
  "lead" | "qualificacao" | "proposta" | "negociacao" | "ganha" | "perdida";

export type OrigemOportunidade =
  "ecommerce" | "indicacao" | "prospeccao" | "site" | "telefone" | "outro";

export type TipoInteracao =
  "ligacao" | "email" | "whatsapp" | "reuniao" | "visita" | "nota_interna" | "outro";

export type StatusOs =
  "aberta" | "em_andamento" | "aguardando_material" | "concluida" | "cancelada";
export type PrioridadeOs = "baixa" | "normal" | "alta" | "urgente";
export type StatusNotaFiscal = "rascunho" | "autorizada" | "cancelada" | "rejeitada" | "denegada";
export type StatusPagamento = "pendente" | "pago" | "vencido" | "cancelado" | "estornado";
export type StatusEmpresa = string; // confirmar valores no OpenAPI

export interface Empresa {
  id: number;
  /** Identificador opaco usado em URLs (UUID) — nunca expõe o id sequencial. */
  public_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  segmento: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  status: StatusEmpresa;
  tabela_preco_id: number | null;
  observacoes: string | null;
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
}

export interface Oportunidade {
  id: number;
  empresa_id: number;
  contato_id: number | null;
  responsavel_id: number;
  titulo: string;
  descricao: string | null;
  origem: OrigemOportunidade | string | null;
  valor_estimado: Dinheiro | null;
  data_prevista_fechamento: string | null;
  estagio: EstagioOportunidade;
  motivo_perda: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Interacao {
  id: number;
  empresa_id: number;
  contato_id: number | null;
  oportunidade_id: number | null;
  usuario_id: number | null;
  tipo: TipoInteracao | string;
  assunto: string | null;
  descricao: string | null;
  ocorrido_em: string;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  created_at: string;
}

export interface Produto {
  id: number;
  public_id: string;
  sku: string;
  nome: string;
  slug: string;
  categoria_id: number;
  marca: string | null;
  unidade_medida: string | null;
  descricao_curta?: string | null;
  descricao_tecnica?: string | null;
  ncm?: string | null;
  origem_mercadoria?: string | null;
  peso_kg?: string | null;
  altura_cm?: string | null;
  largura_cm?: string | null;
  comprimento_cm?: string | null;
  preco_venda: Dinheiro;
  preco_custo: Dinheiro | null;
  estoque_minimo: Quantidade | null;
  controla_estoque: boolean;
  ativo: boolean;
  destaque: boolean;
}

export interface ProdutoImagem {
  id: number;
  produto_id: number;
  url: string;
  alt_text: string | null;
  ordem: number;
  is_principal: boolean;
}

/** Item de busca staff — `Produto` flatten + score de relevância. */
export type ItemBuscaStaff = Produto & { score?: number };

export interface Pedido {
  id: number;
  public_id: string;
  numero: string;
  empresa_id: number;
  contato_id: number;
  origem: "ecommerce" | "orcamento" | "manual";
  status: StatusPedido;
  subtotal: Dinheiro;
  desconto: Dinheiro;
  frete: Dinheiro;
  total: Dinheiro;
  condicao_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface SaldoEstoque {
  produto_id: number;
  quantidade_disponivel: Quantidade;
  quantidade_reservada: Quantidade;
}

/** `GET /estoque/abaixo-do-minimo` devolve `[{produto, saldo}]` — array puro. */
export interface SaldoAbaixoMinimo {
  produto: Produto;
  saldo: SaldoEstoque;
}

export interface Caixa {
  id: number;
  aberto_por: number;
  aberto_em: string;
  valor_abertura: Dinheiro;
  fechado_por: number | null;
  fechado_em: string | null;
  valor_fechamento_calculado: Dinheiro | null;
  valor_fechamento_informado: Dinheiro | null;
  diferenca: Dinheiro | null;
  status: "aberto" | "fechado";
}

/** Lançamento imutável de caixa — entrada (suprimento/venda/recebimento) ou saída. */
export interface CaixaMovimentacao {
  id: number;
  caixa_id: number;
  tipo: string;
  valor: Dinheiro;
  forma_pagamento_id: number | null;
  pagamento_id: number | null;
  usuario_id: number | null;
  descricao: string | null;
  created_at: string;
}

export interface LogAuditoria {
  id: number;
  usuario_id: number | null;
  entidade: string;
  entidade_id: number;
  acao: string;
  antes: unknown;
  depois: unknown;
  created_at: string;
}

/* ---- Tipos que o legado declarava junto aos serviços ---- */

export interface ItemOrcamento {
  produto_id: number;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
  desconto: string;
  total: string;
}

export interface Orcamento {
  id: number;
  public_id: string;
  numero?: string;
  empresa_id: number;
  contato_id: number | null;
  oportunidade_id: number | null;
  vendedor_id: number;
  status: string;
  emitido_em?: string;
  valido_ate: string | null;
  subtotal?: string;
  desconto: string;
  frete: string;
  total: string;
  condicao_pagamento: string | null;
  observacoes: string | null;
  convertido_pedido_id?: number | null;
  created_at?: string;
  updated_at?: string;
  itens: ItemOrcamento[];
}

export interface ItemPedido {
  descricao: string;
  sku: string;
  quantidade: string;
  preco_unitario: string;
  desconto: string;
  total: string;
}

export interface Categoria {
  id: number;
  categoria_pai_id: number | null;
  nome: string;
  slug: string;
  descricao: string | null;
  imagem_url?: string | null;
  ordem: number;
  ativa: boolean;
}

export interface TabelaPreco {
  id: number;
  public_id: string;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  itens?: { produto_id: number; preco: string }[];
}

export interface Movimentacao {
  id: number;
  produto_id: number;
  tipo: string;
  quantidade: Quantidade;
  saldo_antes: Quantidade;
  saldo_depois: Quantidade;
  pedido_id: number | null;
  ordem_servico_id: number | null;
  usuario_id: number | null;
  motivo: string | null;
  created_at: string;
}

export interface OrdemServico {
  id: number;
  public_id: string;
  numero?: string;
  empresa_id: number;
  contato_id: number | null;
  pedido_id: number | null;
  responsavel_id: number | null;
  descricao: string | null;
  status: string;
  prioridade: string;
  aberta_em?: string;
  prevista_em: string | null;
  concluida_em?: string | null;
  valor_mao_obra: string | null;
  valor_total?: string | null;
  observacoes: string | null;
  materiais?: {
    id?: number;
    produto_id: number;
    quantidade: string;
    preco_unitario?: string;
    total?: string;
  }[];
  historico?: {
    id: number;
    status_anterior: string | null;
    status_novo: string;
    usuario_id: number | null;
    observacao: string | null;
    created_at: string;
  }[];
}

export interface NotaFiscal {
  id: number;
  pedido_id: number;
  empresa_id: number;
  status: string;
  numero: string | null;
  serie: string | null;
  chave_acesso?: string | null;
  chave: string | null;
  valor_total?: string | null;
  protocolo_autorizacao?: string | null;
  motivo_cancelamento: string | null;
}

/* ---------------------------------------------------------------------------
 * hweld-operations-api — documentos de orquestração fiscal (`/fiscal-documents`).
 * Estado interno do documento + status bruto do provedor (ex.: Spedy).
 * ------------------------------------------------------------------------- */
export type StatusFiscalDocumento =
  | "REQUESTED"
  | "PROCESSING"
  | "AUTHORIZED"
  | "REJECTED"
  | "CANCELLED"
  | "CANCELLATION_PENDING"
  | "REQUIRES_RECONCILIATION"
  | "ERROR";

export interface FiscalDocumento {
  id: string; // UUID
  pedidoId: number;
  empresaId: number;
  billingInvoiceId: string | null;
  notaFiscalId: number | null;
  docType: "NFE" | "NFSE";
  provider: string;
  environment: "homologacao" | "producao";
  status: StatusFiscalDocumento | string;
  providerStatus: string | null;
  statusDetail: string | null;
  externalId: string | null;
  accessKey: string | null;
  protocol: string | null;
  numero: string | null;
  serie: string | null;
  xmlUrl: string | null;
  pdfUrl: string | null;
  rejectionReason: string | null;
  payload: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalDocumentoEvento {
  id: string;
  fiscalDocumentId: string;
  eventType:
    | "REQUESTED"
    | "SUBMITTED"
    | "STATUS_CHANGE"
    | "WEBHOOK"
    | "RECONCILE"
    | "CANCEL"
    | "ERROR"
    | "ARTIFACT"
    | string;
  statusFrom: string | null;
  statusTo: string | null;
  providerStatus: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface Pagamento {
  id: number;
  pedido_id: number;
  parcela_num?: number;
  parcela: number;
  valor: string;
  status: string;
  vencimento: string;
  pago_em: string | null;
  forma_pagamento_id: number | null;
  observacao?: string | null;
}

export interface EventoRealtime {
  tipo: string;
  dados: Record<string, unknown>;
}

export interface MarcaCms {
  id: string;
  nome: string;
  logo: string;
  ativa: boolean;
}

export interface SlideBannerCms {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  price: string;
  button_text: string;
  button_link: string;
  bg_image: string;
  image_mobile: string;
  product_image: string;
  classe: string;
  ativo: boolean;
}

export interface CardTrioCms {
  id: string;
  badge: string;
  titulo: string;
  descricao: string;
  preco_destaque: string;
  botao_texto: string;
  botao_link: string;
  imagem_url: string;
  cor: "orange" | "cyan" | "blue" | string;
  ativo: boolean;
}

export interface CardDuoCms {
  id: string;
  tag: string;
  titulo: string;
  descricao: string;
  destaque: string;
  botao_texto: string;
  botao_link: string;
  imagem_url: string;
  estilo: "plasma" | "combo" | string;
  ativo: boolean;
}

export interface SeloCms {
  id: string;
  titulo: string;
  descricao: string;
  link: string;
  icone_url: string;
  externo: boolean;
  ativo: boolean;
}

export interface CmsLoja {
  marcas: MarcaCms[];
  slides: SlideBannerCms[];
  trio_banners: CardTrioCms[];
  duo_banners: CardDuoCms[];
  selos: SeloCms[];
}

// ── Integrações (hweld-operations-api) ────────────────────────────────────

/**
 * Visão da integração Infobip SMS — `GET /integracoes/infobip`.
 * Segredos são write-only: `segredos.campos` só diz se cada um está
 * configurado. `versao` sustenta o optimistic locking do formulário.
 */
export interface IntegracaoInfobip {
  provedor: string;
  categoria: string;
  ambiente: string;
  /** Provider efetivo do canal — "infobip" com credenciais, senão "log". */
  provider_ativo: string;
  nome_conta: string;
  habilitado: boolean;
  estado: "ativa" | "pendente" | "falha" | "desativada";
  versao: number;
  config: {
    base_url: string;
    remetente: string;
    limite_segmentos: number;
    envio_pausado: boolean;
    eventos: Record<string, boolean>;
    destinatarios_teste: string[];
    callback_url?: string;
  };
  segredos: { campos: { api_key: boolean; webhook_secret: boolean } };
  ultima_verificacao_em: string;
  verificacao_status: "ok" | "falha" | "nunca";
  verificacao_erro: string;
  pendentes: number;
}

/** Relatório de entrega recebido — `GET /integracoes/infobip/eventos`. */
export interface EventoDlr {
  event_id: string;
  status: string;
  recebido_em: string;
  ultimo_erro: string;
}

/** Card Z-API WhatsApp — `GET /integracoes/zapi`. */
export interface IntegracaoZapi {
  provedor: string;
  categoria: string;
  ambiente: string;
  provider_ativo: string;
  nome_conta: string;
  habilitado: boolean;
  estado: "ativa" | "pendente" | "falha" | "desativada" | "conectando";
  versao: number;
  config: {
    instance_id: string;
    envio_pausado: boolean;
    eventos: Record<string, boolean>;
    destinatarios_teste: string[];
    webhook_received?: string;
    webhook_delivery?: string;
    webhook_disconnected?: string;
  };
  conexao: {
    consultado: boolean;
    conectado?: boolean;
    smartphone?: boolean;
    sessao?: string;
    erro?: string;
  };
  segredos: { campos: { instance_token: boolean; client_token: boolean; webhook_secret: boolean } };
  ultima_verificacao_em: string;
  verificacao_status: "ok" | "falha" | "nunca";
  verificacao_erro: string;
  pendentes: number;
}

/** Evento de webhook Z-API — `GET /integracoes/zapi/eventos`. */
export interface EventoZapi {
  id: string;
  tipo: string;
  direcao: "in" | "out" | "sys";
  telefone: string;
  conteudo: string;
  recebido_em: string;
}

/** Entrega da fila transacional (canal SMS) — `notification_deliveries`. */
export interface EntregaSms {
  id: string;
  templateCode: string | null;
  channel: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  segments: number | null;
  remoteStatus: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
  pedidoId: number | null;
  messageId: string | null;
}

export interface IntegracaoSpedy {
  provedor: string;
  categoria: string;
  ambiente: string;
  provider_ativo: string;
  nome_conta: string;
  habilitado: boolean;
  estado: "ativa" | "pendente" | "falha" | "desativada";
  versao: number;
  config: {
    ambiente: string;
    emissao_pausada: boolean;
    empresa_id: string;
    webhook_url?: string;
  };
  segredos: { campos: { api_key: boolean; webhook_secret: boolean } };
  ultima_verificacao_em: string;
  verificacao_status: "ok" | "falha" | "nunca";
  verificacao_erro: string;
  pendentes: number;
}

export interface EventoSpedy {
  id: string;
  evento: string;
  resultado: string;
  documento: string;
  erro: string;
  recebido_em: string;
}

export interface DocumentoSpedy {
  id: string;
  pedido_id: number | null;
  tipo: string;
  status: string;
  status_provedor: string;
  numero: string;
  serie: string;
  motivo_rejeicao: string;
  criado_em: string;
}

export interface IntegracaoPagBank {
  provedor: string;
  categoria: string;
  ambiente: string;
  provider_ativo: string;
  nome_conta: string;
  habilitado: boolean;
  estado: "ativa" | "pendente" | "falha" | "desativada";
  versao: number;
  config: {
    ambiente: string;
    cobrancas_pausadas: boolean;
    webhook_url?: string;
  };
  segredos: { campos: { token: boolean } };
  ultima_verificacao_em: string;
  verificacao_status: "ok" | "falha" | "nunca";
  verificacao_erro: string;
}

export interface EventoPagBank {
  id: string;
  evento: string;
  resultado: string;
  payment_id: string;
  recebido_em: string;
  processado_em: string;
  erro: string;
}

export interface TransacaoPagBank {
  id: string;
  pedido_id: number | null;
  pedido_numero: string;
  metodo: string;
  status: string;
  valor: string;
  moeda: string;
  external_id: string;
  pix_copia_cola: string;
  checkout_url: string;
  expira_em: string;
  criado_em: string;
  atualizado_em: string;
  erro: string;
}

export interface PaginaTransacoesPagBank {
  itens: TransacaoPagBank[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface IntegracaoMercadoPago {
  provedor: string;
  categoria: string;
  ambiente: string;
  provider_ativo: string;
  nome_conta: string;
  habilitado: boolean;
  estado: "ativa" | "pendente" | "falha" | "desativada";
  versao: number;
  config: {
    ambiente: string;
    parcelas_max?: number;
    cobrancas_pausadas: boolean;
    webhook_url?: string;
  };
  segredos: { campos: { token: boolean; webhook_secret: boolean } };
  ultima_verificacao_em: string;
  verificacao_status: "ok" | "falha" | "nunca";
  verificacao_erro: string;
}

export interface EventoMercadoPago {
  id: string;
  evento: string;
  resultado: string;
  payment_id: string;
  recebido_em: string;
  processado_em: string;
  erro: string;
}

export interface TransacaoMercadoPago {
  id: string;
  pedido_id: number | null;
  pedido_numero: string;
  metodo: string;
  status: string;
  valor: string;
  moeda: string;
  external_id: string;
  pix_copia_cola: string;
  checkout_url: string;
  expira_em: string;
  criado_em: string;
  atualizado_em: string;
  erro: string;
}

export interface PaginaTransacoesMercadoPago {
  itens: TransacaoMercadoPago[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface IntegracaoMelhorEnvio {
  provedor: string;
  categoria: string;
  ambiente: string;
  provider_ativo: string;
  nome_conta: string;
  conta_id: string;
  habilitado: boolean;
  estado: "ativa" | "pendente" | "falha" | "desativada";
  versao: number;
  config: {
    ambiente: string;
    cep_origem: string;
    cotacao_pausada: boolean;
    servicos?: string;
  };
  segredos: { campos: { token: boolean } };
  ultima_verificacao_em: string;
  verificacao_status: "ok" | "falha" | "nunca";
  verificacao_erro: string;
}

/** Resposta de `POST /api/v1/logistica/cotacoes` — provider-neutral. */
export interface CotacaoFrete {
  id: string;
  provider: string;
  cep_origem: string;
  cep_destino: string;
  pedido_id: number | null;
  servicos: CotacaoServico[];
  criado_em: string;
}

export interface CotacaoServico {
  servico_id: number;
  nome: string;
  transportadora: string;
  preco: number | null;
  prazo_dias: number | null;
  erro?: string;
}

/** Linha do histórico `GET /api/v1/logistica/cotacoes`. */
export interface CotacaoLogistica {
  id: string;
  provider: string;
  pedido_id: number | null;
  cep_origem: string;
  cep_destino: string;
  status: "OK" | "ERRO";
  erro: string;
  servicos_count: number;
  criado_em: string;
}
