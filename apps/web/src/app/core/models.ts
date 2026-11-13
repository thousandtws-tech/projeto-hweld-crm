/** Modelos TS 1:1 com os schemas do OpenAPI do backend (`/api-docs/openapi.json`).
 *  `Dinheiro`/`Quantidade` trafegam como string decimal — nunca usar number. */

export type Dinheiro = string;
export type Quantidade = string;

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
}

/** Notificação do sino — o destino nunca vem na resposta (escopo do token). */
export interface Notificacao {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  /** Rota interna do app (ex.: /conta/pedidos/3) — nunca URL externa. */
  link: string | null;
  lida_em: string | null;
  created_at: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface Categoria {
  id: number;
  categoria_pai_id: number | null;
  nome: string;
  slug: string;
  descricao: string | null;
  imagem_url: string | null;
  ordem: number;
  ativa: boolean;
}

export interface ProdutoImagem {
  id: number;
  produto_id: number;
  url: string;
  alt_text: string | null;
  ordem: number;
  is_principal: boolean;
}

/** Produto como exposto ao portal (G5) — sanitizado: sem preco_custo,
 *  estoque_minimo, controla_estoque ou flags internas. */
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
  preco_venda: Dinheiro;
  destaque: boolean;
}

/** Item do catálogo do portal: produto + preço já resolvido pela tabela da empresa + galeria. */
export interface ItemCatalogoPortal extends Produto {
  preco_efetivo: Dinheiro;
  imagens?: ProdutoImagem[];
}

export interface ProdutoPortal extends ItemCatalogoPortal {
  imagens: ProdutoImagem[];
  disponivel: boolean;
}

export interface CarrinhoItem {
  id: number;
  produto_id: number;
  quantidade: Quantidade;
  preco_unitario: Dinheiro;
  produto?: { nome: string; sku: string; slug: string; imagem_url?: string | null };
}

export interface Carrinho {
  id: number;
  uuid: string;
  status: 'aberto' | 'convertido' | 'abandonado';
  itens: CarrinhoItem[];
}

export type StatusPedido =
  | 'aguardando_pagamento'
  | 'confirmado'
  | 'em_separacao'
  | 'faturado'
  | 'enviado'
  | 'entregue'
  | 'concluido'
  | 'cancelado';

export interface Endereco {
  id: number;
  tipo: string;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string;
  principal: boolean;
}

export interface PedidoResumo {
  id: number;
  numero: string;
  status: StatusPedido;
  origem: 'ecommerce' | 'orcamento' | 'manual';
  total: Dinheiro;
  condicao_pagamento: string | null;
  created_at: string;
}

export interface PedidoDetalhe extends PedidoResumo {
  subtotal: Dinheiro;
  desconto: Dinheiro;
  frete: Dinheiro;
  observacoes: string | null;
  itens: {
    descricao: string;
    sku: string;
    quantidade: Quantidade;
    preco_unitario: Dinheiro;
    desconto: Dinheiro;
    total: Dinheiro;
  }[];
  endereco_faturamento: Endereco;
  endereco_entrega: Endereco;
}

export interface MeuPerfil {
  contato: {
    id: number;
    nome: string;
    email: string | null;
    telefone: string | null;
    cargo: string | null;
    is_principal: boolean;
  };
  empresa: {
    id: number;
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string | null;
    telefone: string | null;
    email: string | null;
    segmento: string | null;
  };
  tabela_preco: { id: number; nome: string } | null;
}

/** PATCH /portal/empresa — "completar dados" do contato principal. */
export interface DadosEmpresa {
  razao_social?: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export interface SugestaoBusca {
  nome: string;
  sku: string;
}

export interface ResultadoBusca {
  itens: ItemCatalogoPortal[];
  total: number;
  pagina: number;
  total_paginas: number;
  facetas?: {
    categorias?: { valor: string; rotulo?: string; contagem: number }[];
    marcas?: { valor: string; rotulo?: string; contagem: number }[];
    preco_min?: Dinheiro;
    preco_max?: Dinheiro;
  };
  /** "Você quis dizer?" — correção ortográfica sugerida pelo motor. */
  correcao?: string;
}

/** Envelope de erro do backend (ErroApp → HTTP). */
export interface ErroApi {
  codigo?: string;
  mensagem?: string;
  message?: string;
}
