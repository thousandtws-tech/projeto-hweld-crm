import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Carrinho,
  Categoria,
  CotacaoFrete,
  DadosEmpresa,
  Endereco,
  ItemCatalogoPortal,
  MetodoPagamento,
  MeuPerfil,
  Pagamento,
  Pagina,
  PedidoDetalhe,
  PedidoResumo,
  ProdutoPortal,
  ResultadoBusca,
  StatusPedido,
  SugestaoBusca,
} from './models';

const api = environment.apiUrl;

/** Catálogo B2B — preços já vêm resolvidos pela tabela da empresa (`preco_efetivo`). */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);

  listar(
    filtro: {
      pagina?: number;
      por_pagina?: number;
      categoria_id?: number;
      busca?: string;
      destaque?: boolean;
    } = {},
  ) {
    let params = new HttpParams();
    if (filtro.pagina) params = params.set('pagina', filtro.pagina);
    if (filtro.por_pagina) params = params.set('por_pagina', filtro.por_pagina);
    if (filtro.categoria_id) params = params.set('categoria_id', filtro.categoria_id);
    if (filtro.busca) params = params.set('busca', filtro.busca);
    if (filtro.destaque !== undefined) params = params.set('destaque', filtro.destaque);
    return firstValueFrom(
      this.http.get<Pagina<ItemCatalogoPortal>>(`${api}/portal/catalogo`, { params }),
    );
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

  buscar(
    q: string,
    filtro: {
      pagina?: number;
      categoria_id?: number;
      marca?: string;
      preco_min?: string;
      preco_max?: string;
      ordem?: string;
    } = {},
  ) {
    let params = new HttpParams().set('q', q);
    for (const [k, v] of Object.entries(filtro)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(
      this.http.get<ResultadoBusca>(`${api}/portal/busca/produtos`, { params }),
    );
  }

  sugestoes(q: string) {
    const params = new HttpParams().set('q', q).set('limite', 8);
    return firstValueFrom(
      this.http.get<SugestaoBusca[]>(`${api}/portal/busca/sugestoes`, { params }),
    );
  }
}

/** Carrinho do contato — uuid público no backend, itens com snapshot de preço.
 *  Também mantém o estado do mini-cart drawer (padrão marketplace). */
@Injectable({ providedIn: 'root' })
export class CarrinhoService {
  private http = inject(HttpClient);
  readonly carrinho = signal<Carrinho | null>(null);
  readonly totalItens = computed(() => this.carrinho()?.itens?.length ?? 0);

  /** Mini-cart lateral (drawer) — padrão Mercado Livre/Amazon. */
  readonly drawerAberto = signal(false);

  /** Soma das linhas (qtd × preço unitário) — compartilhada por página e drawer. */
  readonly subtotal = computed(() =>
    (this.carrinho()?.itens ?? [])
      .reduce((acc, i) => acc + Number(i.quantidade) * Number(i.preco_unitario), 0)
      .toFixed(2),
  );

  /** GET em voo compartilhado — evita rajadas de /portal/carrinho quando
   *  drawer, página e SSE pedem refresh simultaneamente. */
  private atualEmVoo: Promise<Carrinho> | null = null;

  abrirDrawer(): void {
    // Revalida o carrinho ao abrir — estado sempre fresco (evita item fantasma).
    this.atual().catch(() => {});
    this.drawerAberto.set(true);
  }

  fecharDrawer(): void {
    this.drawerAberto.set(false);
  }

  atual(): Promise<Carrinho> {
    this.atualEmVoo ??= firstValueFrom(this.http.get<Carrinho>(`${api}/portal/carrinho`))
      .then((c) => {
        this.carrinho.set(c);
        return c;
      })
      .finally(() => {
        this.atualEmVoo = null;
      });
    return this.atualEmVoo;
  }

  async adicionar(produto_id: number, quantidade: number): Promise<Carrinho> {
    // Backend desserializa Decimal via serde-str — quantidade vai como string.
    await firstValueFrom(
      this.http.post(`${api}/portal/carrinho/itens`, {
        produto_id,
        quantidade: String(quantidade),
      }),
    );
    return this.atual();
  }

  async atualizarItem(produto_id: number, quantidade: number): Promise<Carrinho> {
    await firstValueFrom(
      this.http.put(`${api}/portal/carrinho/itens/${produto_id}`, {
        quantidade: String(quantidade),
      }),
    );
    return this.atual();
  }

  async remover(produto_id: number): Promise<Carrinho> {
    await firstValueFrom(this.http.delete(`${api}/portal/carrinho/itens/${produto_id}`));
    return this.atual();
  }

  async checkout(input: {
    endereco_faturamento_id: number;
    endereco_entrega_id: number;
    condicao_pagamento?: string;
    observacoes?: string;
  }): Promise<PedidoDetalhe> {
    const pedido = await firstValueFrom(
      this.http.post<PedidoDetalhe>(`${api}/portal/checkout`, input),
    );
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

  atualizarEmpresa(dados: DadosEmpresa) {
    return firstValueFrom(this.http.patch<MeuPerfil['empresa']>(`${api}/portal/empresa`, dados));
  }

  enderecos(tipo?: string) {
    const params = tipo ? new HttpParams().set('tipo', tipo) : undefined;
    return firstValueFrom(this.http.get<Endereco[]>(`${api}/portal/enderecos`, { params }));
  }

  criarEndereco(input: {
    tipo?: string;
    cep: string;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade: string;
    uf: string;
    principal?: boolean;
  }) {
    return firstValueFrom(this.http.post<Endereco>(`${api}/portal/enderecos`, input));
  }

  pedidos(filtro: { pagina?: number; status?: StatusPedido[] } = {}) {
    let params = new HttpParams();
    if (filtro.pagina) params = params.set('pagina', filtro.pagina);
    if (filtro.status?.length) params = params.set('status', filtro.status.join(','));
    return firstValueFrom(this.http.get<Pagina<PedidoResumo>>(`${api}/portal/pedidos`, { params }));
  }

  pedido(id: number) {
    return firstValueFrom(this.http.get<PedidoDetalhe>(`${api}/portal/pedidos/${id}`));
  }

  trocarSenha(senha_atual: string, nova_senha: string) {
    return firstValueFrom(this.http.post(`${api}/auth/senha`, { senha_atual, nova_senha }));
  }
}

/** Pagamentos — operations-api `/payments`. JWT do portal valida posse do pedido no backend. */
@Injectable({ providedIn: 'root' })
export class PagamentoService {
  private http = inject(HttpClient);

  /** Idempotente: a mesma chave nunca gera duas cobranças no PSP. */
  criar(input: { pedidoId: number; method: MetodoPagamento; idempotencyKey?: string }) {
    return firstValueFrom(this.http.post<Pagamento>(`${api}/payments`, input));
  }

  buscar(id: string) {
    return firstValueFrom(this.http.get<Pagamento>(`${api}/payments/${id}`));
  }

  /** Pagamentos do pedido — escopo portal devolve só os da empresa autenticada. */
  doPedido(pedidoId: number) {
    return firstValueFrom(
      this.http.get<{ content: Pagamento[] }>(`${api}/payments`, {
        params: new HttpParams().set('pedidoId', pedidoId),
      }),
    ).then((p) => p.content);
  }
}

/** Frete — operations-api `/logistica`. Cotação por pedido resolve dimensões no servidor. */
@Injectable({ providedIn: 'root' })
export class LogisticaService {
  private http = inject(HttpClient);

  cotarPedido(pedidoId: number, servicos?: string) {
    let params = new HttpParams().set('pedido_id', pedidoId);
    if (servicos) params = params.set('servicos', servicos);
    return firstValueFrom(
      this.http.post<CotacaoFrete>(`${api}/logistica/cotacoes`, null, { params }),
    );
  }
}
