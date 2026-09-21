export interface FacetaContagem {
  rotulo: string;
  valor: string;
  contagem: number;
}

export interface FacetasBusca {
  categorias: FacetaContagem[];
  marcas: FacetaContagem[];
  preco_min: string;
  preco_max: string;
}

export interface ProdutoBusca {
  id: number;
  nome: string;
  sku: string;
  slug: string;
  descricao_curta: string;
  descricao_tecnica: string;
  ativo: boolean;
  destaque: boolean;
  categoria_id: number;
  marca: string;
  unidade_medida: string;
  peso_kg: string;
  altura_cm: string;
  largura_cm: string;
  comprimento_cm: string;
  estoque_minimo: string;
  controla_estoque: boolean;
  ncm: string;
  origem_mercadoria: string;
  preco_custo: string | null;
  preco_venda: string;
  preco_efetivo: string;
  score: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BuscarProdutosFiltros {
  pagina?: number;
  por_pagina?: number;
  q?: string;
  categoria_id?: number;
  marca?: string;
  preco_min?: string;
  preco_max?: string;
}

export interface BuscaProdutosResultado {
  itens: ProdutoBusca[];
  facetas: FacetasBusca;
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface SugestaoProduto {
  produto_id: number;
  nome: string;
  sku: string;
}

export interface SugestoesFiltros {
  q: string;
  limite?: number;
}

export interface ItemCarrinho {
  id: number;
  carrinho_id: number;
  produto_id: number;
  quantidade: string;
  preco_unitario: string;
  created_at: string;
  updated_at: string;
}

export interface Carrinho {
  id: number;
  uuid: string;
  contato_id: number | null;
  empresa_id: number | null;
  session_id: string;
  status: string;
  itens: ItemCarrinho[];
  total: string;
  created_at: string;
  updated_at: string;
}

export interface AdicionarItemRequest {
  produto_id: number;
  quantidade: string;
}

export interface AtualizarItemRequest {
  produto_id: number;
  quantidade: string;
}

export interface ProdutoCatalogo {
  id: number;
  nome: string;
  sku: string;
  slug: string;
  descricao_curta: string;
  descricao_tecnica: string;
  ativo: boolean;
  destaque: boolean;
  categoria_id: number;
  marca: string;
  unidade_medida: string;
  peso_kg: string;
  altura_cm: string;
  largura_cm: string;
  comprimento_cm: string;
  estoque_minimo: string;
  controla_estoque: boolean;
  ncm: string;
  origem_mercadoria: string;
  preco_custo: string | null;
  preco_venda: string;
  preco_efetivo: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CatalogoFiltros {
  pagina?: number;
  por_pagina?: number;
  categoria_id?: number;
  busca?: string;
  destaque?: boolean;
}

export interface CatalogoResultado {
  itens: ProdutoCatalogo[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface CheckoutRequest {
  condicao_pagamento: string;
  endereco_entrega_id: number;
  endereco_faturamento_id: number;
  observacoes?: string;
}

export interface PedidoCheckout {
  id: number;
  numero: string;
  carrinho_id: number | null;
  orcamento_id: number | null;
  contato_id: number;
  empresa_id: number;
  vendedor_id: number | null;
  endereco_entrega_id: number;
  endereco_faturamento_id: number;
  condicao_pagamento: string;
  observacoes: string;
  subtotal: string;
  desconto: string;
  frete: string;
  total: string;
  status: string;
  origem: string;
  created_at: string;
  updated_at: string;
}
