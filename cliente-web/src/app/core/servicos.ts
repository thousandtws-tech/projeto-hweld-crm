import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Carrinho, Categoria, Endereco, ItemCatalogoPortal, MeuPerfil,
  Pagina, PedidoDetalhe, PedidoResumo, ProdutoPortal, ResultadoBusca,
  StatusPedido, SugestaoBusca,
} from './models';

const api = environment.apiUrl;

/** Catálogo B2B — preços já vêm resolvidos pela tabela da empresa (`preco_efetivo`). */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);

  listar(filtro: { pagina?: number; por_pagina?: number; categoria_id?: number; busca?: string; destaque?: boolean } = {}) {
    let params = new HttpParams();
    if (filtro.pagina) params = params.set('pagina', filtro.pagina);
    if (filtro.por_pagina) params = params.set('por_pagina', filtro.por_pagina);
    if (filtro.categoria_id) params = params.set('categoria_id', filtro.categoria_id);
    if (filtro.busca) params = params.set('busca', filtro.busca);
    if (filtro.destaque !== undefined) params = params.set('destaque', filtro.destaque);
    return firstValueFrom(this.http.get<Pagina<ItemCatalogoPortal>>(`${api}/portal/catalogo`, { params }));
  }

  /** PDP — endpoint `GET /portal/produtos/{id}` (gap G5 do backend-gaps.md). */
  produto(id: number) {
    return firstValueFrom(this.http.get<ProdutoPortal>(`${api}/portal/produtos/${id}`));
  }

  /** Árvore de categorias ativas — `GET /portal/categorias` (gap G6). */
  categorias() {
    return firstValueFrom(this.http.get<Categoria[]>(`${api}/portal/categorias`));
  }
}

/** Busca Elasticsearch do portal — degrada graciosamente (503) sem ES. */
@Injectable({ providedIn: 'root' })
export class BuscaService {
  private http = inject(HttpClient);

  buscar(q: string, filtro: { pagina?: number; categoria_id?: number; marca?: string; preco_min?: string; preco_max?: string } = {}) {
    let params = new HttpParams().set('q', q);
    for (const [k, v] of Object.entries(filtro)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(this.http.get<ResultadoBusca>(`${api}/portal/busca/produtos`, { params }));
  }

  sugestoes(q: string) {
    const params = new HttpParams().set('q', q).set('limite', 8);
    return firstValueFrom(this.http.get<SugestaoBusca[]>(`${api}/portal/busca/sugestoes`, { params }));
  }
}

/** Carrinho do contato — uuid público no backend, itens com snapshot de preço. */
@Injectable({ providedIn: 'root' })
export class CarrinhoService {
  private http = inject(HttpClient);
  readonly carrinho = signal<Carrinho | null>(null);
  readonly totalItens = () => this.carrinho()?.itens?.length ?? 0;

  async atual(): Promise<Carrinho> {
    const c = await firstValueFrom(this.http.get<Carrinho>(`${api}/portal/carrinho`));
    this.carrinho.set(c);
    return c;
  }

  async adicionar(produto_id: number, quantidade: number): Promise<Carrinho> {
    await firstValueFrom(this.http.post(`${api}/portal/carrinho/itens`, { produto_id, quantidade }));
    return this.atual();
  }

  async atualizarItem(produto_id: number, quantidade: number): Promise<Carrinho> {
    await firstValueFrom(this.http.put(`${api}/portal/carrinho/itens/${produto_id}`, { quantidade }));
    return this.atual();
  }

  async remover(produto_id: number): Promise<Carrinho> {
    await firstValueFrom(this.http.delete(`${api}/portal/carrinho/itens/${produto_id}`));
    return this.atual();
  }

  async checkout(input: { endereco_faturamento_id: number; endereco_entrega_id: number; condicao_pagamento?: string; observacoes?: string }): Promise<PedidoDetalhe> {
    const pedido = await firstValueFrom(this.http.post<PedidoDetalhe>(`${api}/portal/checkout`, input));
    await this.atual();
    return pedido;
  }
}

/** Conta do contato — endpoints portal G1–G4 de backend-gaps.md. */
@Injectable({ providedIn: 'root' })
export class ContaService {
  private http = inject(HttpClient);

  me() {
    return firstValueFrom(this.http.get<MeuPerfil>(`${api}/portal/me`));
  }

  enderecos(tipo?: string) {
    const params = tipo ? new HttpParams().set('tipo', tipo) : undefined;
    return firstValueFrom(this.http.get<Endereco[]>(`${api}/portal/enderecos`, { params }));
  }

  pedidos(filtro: { pagina?: number; status?: StatusPedido } = {}) {
    let params = new HttpParams();
    if (filtro.pagina) params = params.set('pagina', filtro.pagina);
    if (filtro.status) params = params.set('status', filtro.status);
    return firstValueFrom(this.http.get<Pagina<PedidoResumo>>(`${api}/portal/pedidos`, { params }));
  }

  pedido(id: number) {
    return firstValueFrom(this.http.get<PedidoDetalhe>(`${api}/portal/pedidos/${id}`));
  }

  trocarSenha(senha_atual: string, nova_senha: string) {
    return firstValueFrom(this.http.post(`${api}/auth/senha`, { senha_atual, nova_senha }));
  }
}
