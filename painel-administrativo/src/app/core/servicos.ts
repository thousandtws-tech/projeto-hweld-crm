import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Caixa, Contato, Empresa, LogAuditoria, Oportunidade, Pagina, Pedido,
  Produto, SaldoEstoque, Usuario,
} from './models';

export interface Filtros {
  [chave: string]: string | number | boolean | undefined;
}

function paramsDe(filtros: Filtros): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== undefined && v !== '' && v !== null) p = p.set(k, String(v));
  }
  return p;
}

/** API genérica — paginação server-side `{itens,total,pagina,por_pagina,total_paginas}`. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  lista<T>(recurso: string, filtros: Filtros = {}): Observable<Pagina<T>> {
    return this.http.get<Pagina<T>>(`${this.api}/${recurso}`, { params: paramsDe(filtros) });
  }
  /** Endpoints que devolvem array puro (ex.: `/categorias` retorna `T[]`, não `Pagina`). */
  listaArray<T>(recurso: string, filtros: Filtros = {}): Observable<T[]> {
    return this.http.get<T[]>(`${this.api}/${recurso}`, { params: paramsDe(filtros) });
  }
  get<T>(recurso: string, id: number | string): Observable<T> {
    return this.http.get<T>(`${this.api}/${recurso}/${id}`);
  }
  post<T>(recurso: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.api}/${recurso}`, body);
  }
  postAcao<T>(recurso: string, id: number | string, acao: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(`${this.api}/${recurso}/${id}/${acao}`, body);
  }
  patchAcao<T>(recurso: string, id: number | string, acao: string, body: unknown = {}): Observable<T> {
    return this.http.patch<T>(`${this.api}/${recurso}/${id}/${acao}`, body);
  }
  put<T>(recurso: string, id: number | string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.api}/${recurso}/${id}`, body);
  }
  patch<T>(recurso: string, id: number | string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.api}/${recurso}/${id}`, body);
  }
  del(recurso: string, id?: number | string, sub?: string): Observable<void> {
    const path = id === undefined ? recurso : `${recurso}/${id}`;
    return this.http.delete<void>(`${this.api}/${path}${sub ? `/${sub}` : ''}`);
  }
  url(): string { return this.api; }
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private api = inject(Api);
  pedidosRecentes() { return this.api.lista<Pedido>('pedidos', { por_pagina: 5 }); }
  empresas() { return this.api.lista<Empresa>('empresas', { por_pagina: 1 }); }
  produtos() { return this.api.lista<Produto>('produtos', { por_pagina: 1 }); }
  oportunidadesAbertas() { return this.api.lista<Oportunidade>('oportunidades', { por_pagina: 100 }); }
  estoqueBaixo() { return this.api.lista<SaldoEstoque>('estoque/abaixo-do-minimo', { por_pagina: 1 }); }
}

@Injectable({ providedIn: 'root' })
export class CrmService {
  private api = inject(Api);
  empresas(f: Filtros = {}) { return this.api.lista<Empresa>('empresas', f); }
  empresa(id: number) { return this.api.get<Empresa>('empresas', id); }
  criarEmpresa(b: unknown) { return this.api.post<Empresa>('empresas', b); }
  atualizarEmpresa(id: number, b: unknown) { return this.api.patch<Empresa>('empresas', id, b); }
  arquivarEmpresa(id: number) { return this.api.del('empresas', id); }

  contatos(f: Filtros = {}) { return this.api.lista<Contato>('contatos', f); }
  criarContato(b: unknown) { return this.api.post<Contato>('contatos', b); }
  atualizarContato(id: number, b: unknown) { return this.api.patch<Contato>('contatos', id, b); }
  ativarPortal(id: number, senha: string) { return this.api.postAcao<void>('contatos', id, 'portal', { senha }); }
  desativarPortal(id: number) { return this.api.del('contatos', id, 'portal'); }

  enderecos(empresaId: number, tipo?: string) {
    return this.api.lista<Record<string, unknown>>(`empresas/${empresaId}/enderecos`, { tipo });
  }
  criarEndereco(b: unknown) { return this.api.post<Record<string, unknown>>('enderecos', b); }

  oportunidades(f: Filtros = {}) { return this.api.lista<Oportunidade>('oportunidades', f); }
  criarOportunidade(b: unknown) { return this.api.post<Oportunidade>('oportunidades', b); }
  moverEstagio(id: number, estagio: string, motivo_perda?: string) {
    return this.api.patch<Oportunidade>('oportunidades', id, { estagio, motivo_perda });
  }

  timeline(f: Filtros = {}) { return this.api.lista<Record<string, unknown>>('interacoes', f); }
  registrarInteracao(b: unknown) { return this.api.post<Record<string, unknown>>('interacoes', b); }
}

export interface Orcamento {
  id: number; empresa_id: number; contato_id: number | null; oportunidade_id: number | null;
  vendedor_id: number; status: string; valido_ate: string | null;
  desconto: string; frete: string; total: string; condicao_pagamento: string | null;
  observacoes: string | null; itens: ItemOrcamento[];
}
export interface ItemOrcamento {
  produto_id: number; descricao: string; quantidade: string;
  preco_unitario: string; desconto: string; total: string;
}

@Injectable({ providedIn: 'root' })
export class OrcamentosService {
  private api = inject(Api);
  listar(f: Filtros = {}) { return this.api.lista<Orcamento>('orcamentos', f); }
  buscar(id: number) { return this.api.get<Orcamento>('orcamentos', id); }
  criar(b: unknown) { return this.api.post<Orcamento>('orcamentos', b); }
  salvarItens(id: number, b: unknown) { return this.api.put<Orcamento>('orcamentos', id, b); }
  transicionar(id: number, status: string) {
    return this.api.patchAcao<Orcamento>('orcamentos', id, 'status', { status });
  }
  converter(id: number) { return this.api.postAcao<Pedido>('orcamentos', id, 'converter'); }
}

export interface ItemPedido {
  descricao: string; sku: string; quantidade: string;
  preco_unitario: string; desconto: string; total: string;
}

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private api = inject(Api);
  listar(f: Filtros = {}) { return this.api.lista<Pedido>('pedidos', f); }
  detalhe(id: number) { return this.api.get<Pedido & { itens?: ItemPedido[] }>('pedidos', id); }
  criarManual(b: unknown) { return this.api.post<Pedido>('pedidos', b); }
  transicionar(id: number, status: string) {
    return this.api.patchAcao<Pedido>('pedidos', id, 'status', { status });
  }
}

export interface Categoria {
  id: number; categoria_pai_id: number | null; nome: string; slug: string;
  descricao: string | null; ordem: number; ativa: boolean;
}
export interface TabelaPreco {
  id: number; nome: string; descricao: string | null; ativa: boolean;
  itens?: { produto_id: number; preco: string }[];
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private api = inject(Api);
  produtos(f: Filtros = {}) { return this.api.lista<Produto>('produtos', f); }
  produto(id: number) { return this.api.get<Produto>('produtos', id); }
  criarProduto(b: unknown) { return this.api.post<Produto>('produtos', b); }
  atualizarProduto(id: number, b: unknown) { return this.api.patch<Produto>('produtos', id, b); }
  categorias() { return this.api.listaArray<Categoria>('categorias'); }
  criarCategoria(b: unknown) { return this.api.post<Categoria>('categorias', b); }
  atualizarCategoria(id: number, b: unknown) { return this.api.patch<Categoria>('categorias', id, b); }
  tabelas(f: Filtros = {}) { return this.api.lista<TabelaPreco>('tabelas-preco', f); }
  tabela(id: number) { return this.api.get<TabelaPreco>('tabelas-preco', id); }
  criarTabela(b: unknown) { return this.api.post<TabelaPreco>('tabelas-preco', b); }
  definirPreco(tabelaId: number, produtoId: number, preco: string) {
    return this.api.post(`tabelas-preco/${tabelaId}/itens`, { produto_id: produtoId, preco });
  }
  removerItemTabela(tabelaId: number, produtoId: number) {
    return this.api.del(`tabelas-preco/${tabelaId}/itens`, produtoId);
  }
}

export interface Movimentacao {
  id: number; produto_id: number; tipo: string; quantidade: string;
  motivo: string | null; created_at: string;
}

@Injectable({ providedIn: 'root' })
export class EstoqueService {
  private api = inject(Api);
  saldo(produtoId: number) { return this.api.get<SaldoEstoque>(`estoque/saldo`, produtoId); }
  movimentacoes(f: Filtros = {}) { return this.api.lista<Movimentacao>('estoque/movimentacoes', f); }
  lancar(b: { produto_id: number; tipo: string; quantidade: string; motivo?: string }) {
    return this.api.post<Movimentacao>('estoque/movimentacoes', b);
  }
  abaixoDoMinimo(limite?: number) {
    return this.api.lista<SaldoEstoque>('estoque/abaixo-do-minimo', { limite });
  }
}

export interface OrdemServico {
  id: number; empresa_id: number; contato_id: number | null; pedido_id: number | null;
  responsavel_id: number | null; descricao: string | null; status: string; prioridade: string;
  prevista_em: string | null; valor_mao_obra: string | null; observacoes: string | null;
  materiais?: { produto_id: number; quantidade: string }[];
}

@Injectable({ providedIn: 'root' })
export class OsService {
  private api = inject(Api);
  listar(f: Filtros = {}) { return this.api.lista<OrdemServico>('ordens-servico', f); }
  buscar(id: number) { return this.api.get<OrdemServico>('ordens-servico', id); }
  criar(b: unknown) { return this.api.post<OrdemServico>('ordens-servico', b); }
  consumirMaterial(id: number, produto_id: number, quantidade: string) {
    return this.api.postAcao<OrdemServico>('ordens-servico', id, 'materiais', { produto_id, quantidade });
  }
  transicionar(id: number, status: string, observacao?: string) {
    return this.api.patchAcao<OrdemServico>('ordens-servico', id, 'status', { status, observacao });
  }
}

export interface NotaFiscal {
  id: number; pedido_id: number; empresa_id: number; status: string;
  numero: string | null; serie: string | null; chave: string | null; motivo_cancelamento: string | null;
}

@Injectable({ providedIn: 'root' })
export class FiscalService {
  private api = inject(Api);
  listar(f: Filtros = {}) { return this.api.lista<NotaFiscal>('notas-fiscais', f); }
  buscar(id: number) { return this.api.get<NotaFiscal>('notas-fiscais', id); }
  emitir(pedido_id: number) { return this.api.post<NotaFiscal>('notas-fiscais', { pedido_id }); }
  autorizar(id: number) { return this.api.postAcao<NotaFiscal>('notas-fiscais', id, 'autorizar'); }
  cancelar(id: number, motivo: string) { return this.api.postAcao<NotaFiscal>('notas-fiscais', id, 'cancelar', { motivo }); }
}

export interface Pagamento {
  id: number; pedido_id: number; parcela: number; valor: string; status: string;
  vencimento: string; pago_em: string | null; forma_pagamento_id: number | null;
}

@Injectable({ providedIn: 'root' })
export class FinanceiroService {
  private api = inject(Api);
  pagamentos(f: Filtros = {}) { return this.api.lista<Pagamento>('pagamentos', f); }
  gerarParcelas(b: { pedido_id: number; quantidade: number; primeiro_vencimento: string; intervalo_dias?: number; forma_pagamento_id?: number }) {
    return this.api.post<Pagamento[]>('pagamentos/parcelas', b);
  }
  baixar(id: number, forma_pagamento_id: number, observacao?: string) {
    return this.api.postAcao<Pagamento>('pagamentos', id, 'baixar', { forma_pagamento_id, observacao });
  }
  estornar(id: number, motivo: string) { return this.api.postAcao<Pagamento>('pagamentos', id, 'estornar', { motivo }); }
  caixaAberto() { return this.api.get<Caixa | null>('caixas', 'aberto'); }
  caixas(f: Filtros = {}) { return this.api.lista<Caixa>('caixas', f); }
  movimentacoesCaixa(id: number) { return this.api.lista<Record<string, unknown>>(`caixas/${id}/movimentacoes`); }
  abrir(valor_abertura: string) { return this.api.post<Caixa>('caixas/abrir', { valor_abertura }); }
  lancar(b: { tipo: string; valor: string; forma_pagamento_id?: number; descricao?: string }) {
    return this.api.post('caixas/lancar', b);
  }
  fechar(valor_informado: string) { return this.api.post<Caixa>('caixas/fechar', { valor_informado }); }
}

@Injectable({ providedIn: 'root' })
export class BuscaService {
  private api = inject(Api);
  buscar(f: Filtros = {}) { return this.api.lista<Record<string, unknown>>('busca/produtos', f); }
  reindexar() { return this.api.post('busca/reindexar', {}); }
}

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private api = inject(Api);
  listar(f: Filtros = {}) { return this.api.lista<LogAuditoria>('auditoria', f); }
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private api = inject(Api);
  listar(f: Filtros = {}) { return this.api.lista<Usuario>('usuarios', f); }
  criar(b: { nome: string; email: string; senha: string; perfil: string }) { return this.api.post<Usuario>('usuarios', b); }
  atualizar(id: number, b: { nome?: string; email?: string; perfil?: string }) { return this.api.patch<Usuario>('usuarios', id, b); }
  definirAtivo(id: number, ativo: boolean) { return this.api.postAcao<Usuario>('usuarios', id, 'ativo', { ativo }); }
}
