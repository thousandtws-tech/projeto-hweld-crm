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

export type Perfil = 'admin' | 'vendedor' | 'financeiro' | 'estoque' | 'tecnico';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

export type StatusPedido =
  | 'aguardando_pagamento' | 'confirmado' | 'em_separacao' | 'faturado'
  | 'enviado' | 'entregue' | 'concluido' | 'cancelado';

export type StatusOrcamento =
  | 'rascunho' | 'enviado' | 'em_analise' | 'aprovado' | 'recusado' | 'expirado' | 'convertido';

export type EstagioOportunidade =
  | 'lead' | 'qualificacao' | 'proposta' | 'negociacao' | 'ganha' | 'perdida';

export type StatusOs = 'aberta' | 'em_andamento' | 'aguardando_material' | 'concluida' | 'cancelada';
export type PrioridadeOs = 'baixa' | 'normal' | 'alta' | 'urgente';
export type StatusNotaFiscal = 'rascunho' | 'autorizada' | 'cancelada' | 'rejeitada' | 'denegada';
export type StatusPagamento = 'pendente' | 'pago' | 'vencido' | 'cancelado' | 'estornado';
export type StatusEmpresa = string; // confirmar valores no OpenAPI

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
  origem: string | null;
  valor_estimado: Dinheiro | null;
  data_prevista_fechamento: string | null;
  estagio: EstagioOportunidade;
  motivo_perda: string | null;
}

export interface Produto {
  id: number;
  sku: string;
  nome: string;
  slug: string;
  categoria_id: number;
  marca: string | null;
  unidade_medida: string | null;
  preco_venda: Dinheiro;
  preco_custo: Dinheiro | null;
  estoque_minimo: Quantidade | null;
  controla_estoque: boolean;
  ativo: boolean;
  destaque: boolean;
}

export interface Pedido {
  id: number;
  numero: string;
  empresa_id: number;
  contato_id: number;
  origem: 'ecommerce' | 'orcamento' | 'manual';
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
  saldo: Quantidade;
  abaixo_minimo?: boolean;
}

export interface Caixa {
  id: number;
  status: 'aberto' | 'fechado';
  valor_abertura: Dinheiro;
  aberto_em: string;
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
