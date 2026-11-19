import { api, apiOps, type Filtros } from "./api";
import type {
  Caixa,
  CaixaMovimentacao,
  Contato,
  Empresa,
  ItemBuscaStaff,
  ItemPedido,
  LogAuditoria,
  Movimentacao,
  NotaFiscal,
  Notificacao,
  Oportunidade,
  Orcamento,
  OrdemServico,
  Pagamento,
  Pedido,
  Produto,
  SaldoAbaixoMinimo,
  SaldoEstoque,
  Sessao,
  TabelaPreco,
  Usuario,
} from "./models";

/* ---------------------------------------------------------------------------
 * Adaptadores de Fronteira (Anti-Corruption Layer / DTO Unwrappers)
 * Alinham 100% os envelopes compostos do backend Rust (`crates/api/src/handlers/*`)
 * com os modelos consumidos pelas telas do frontend.
 * ------------------------------------------------------------------------- */

const normalizarPagamento = (p: Pagamento): Pagamento => ({
  ...p,
  parcela: p.parcela ?? p.parcela_num ?? 1,
  parcela_num: p.parcela_num ?? p.parcela ?? 1,
});

const normalizarNotaFiscal = (n: NotaFiscal): NotaFiscal => ({
  ...n,
  chave: n.chave ?? n.chave_acesso ?? null,
  chave_acesso: n.chave_acesso ?? n.chave ?? null,
});

export const dashboardService = {
  pedidosRecentes: () => api.lista<Pedido>("pedidos", { por_pagina: 5 }),
  empresas: () => api.lista<Empresa>("empresas", { por_pagina: 1 }),
  produtos: () => api.lista<Produto>("produtos", { por_pagina: 1 }),
  oportunidadesAbertas: () => api.lista<Oportunidade>("oportunidades", { por_pagina: 100 }),
  estoqueBaixo: () =>
    // endpoint devolve array puro — embrulha em Pagina para o card de KPI
    api.listaArray<SaldoAbaixoMinimo>("estoque/abaixo-do-minimo", { limite: 100 }).then((a) => ({
      itens: a,
      total: a.length,
      pagina: 1,
      por_pagina: a.length,
      total_paginas: 1,
    })),
};

export const crmService = {
  empresas: (f: Filtros = {}) => api.lista<Empresa>("empresas", f),
  /** Aceita id numérico ou public_id (UUID) — o backend resolve ambos. */
  empresa: (ref: number | string) => api.get<Empresa>("empresas", ref),
  criarEmpresa: (b: unknown) => api.post<Empresa>("empresas", b),
  atualizarEmpresa: (id: number, b: unknown) => api.patch<Empresa>("empresas", id, b),
  arquivarEmpresa: (id: number) => api.del("empresas", id),

  contatos: (f: Filtros = {}) => api.lista<Contato>("contatos", f),
  contato: (id: number) => api.get<Contato>("contatos", id),
  criarContato: (b: unknown) => api.post<Contato>("contatos", b),
  atualizarContato: (id: number, b: unknown) => api.patch<Contato>("contatos", id, b),
  arquivarContato: (id: number) => api.del("contatos", id),
  ativarPortal: (id: number, senha: string) =>
    api.postAcao<void>("contatos", id, "portal", { senha }),
  desativarPortal: (id: number) => api.del("contatos", id, "portal"),

  enderecos: (empresaId: number, tipo?: string) =>
    api
      .listaArray<Record<string, unknown>>(`empresas/${empresaId}/enderecos`, { tipo })
      .then((res) => {
        const itens = Array.isArray(res)
          ? res
          : ((res as unknown as { itens?: Record<string, unknown>[] })?.itens ?? []);
        return {
          itens,
          total: itens.length,
          pagina: 1,
          por_pagina: itens.length,
          total_paginas: 1,
        };
      }),
  criarEndereco: (b: unknown) => api.post<Record<string, unknown>>("enderecos", b),
  atualizarEndereco: (id: number, b: unknown) =>
    api.patch<Record<string, unknown>>("enderecos", id, b),
  removerEndereco: (id: number) => api.del("enderecos", id),

  oportunidades: (f: Filtros = {}) => api.lista<Oportunidade>("oportunidades", f),
  oportunidade: (id: number) => api.get<Oportunidade>("oportunidades", id),
  criarOportunidade: (b: unknown) => api.post<Oportunidade>("oportunidades", b),
  atualizarOportunidade: (id: number, b: unknown) =>
    api.patch<Oportunidade>("oportunidades", id, b),
  moverEstagio: (id: number, estagio: string, motivo_perda?: string) =>
    api.patchAcao<Oportunidade>("oportunidades", id, "estagio", { estagio, motivo_perda }),

  timeline: (f: Filtros = {}) => api.lista<Record<string, unknown>>("interacoes", f),
  registrarInteracao: (b: unknown) => api.post<Record<string, unknown>>("interacoes", b),
};

export const orcamentosService = {
  listar: (f: Filtros = {}) => api.lista<Orcamento>("orcamentos", f),
  /** Desempacota `OrcamentoDetalhe { orcamento, itens }` retornado por `GET /orcamentos/{id}`. */
  buscar: (ref: number | string) =>
    api
      .get<Orcamento | { orcamento: Omit<Orcamento, "itens">; itens: Orcamento["itens"] }>(
        "orcamentos",
        ref,
      )
      .then((res) =>
        "orcamento" in res
          ? { ...res.orcamento, itens: res.itens ?? [] }
          : { ...res, itens: res.itens ?? [] },
      ),
  criar: (b: unknown) => api.post<Orcamento>("orcamentos", b),
  salvarItens: (id: number, b: unknown) => api.put<Orcamento>("orcamentos", `${id}/itens`, b),
  transicionar: (id: number, status: string) =>
    api.patchAcao<Orcamento>("orcamentos", id, "status", { status }),
  converter: (id: number) => api.postAcao<Pedido>("orcamentos", id, "converter"),
};

export const pedidosService = {
  listar: (f: Filtros = {}) => api.lista<Pedido>("pedidos", f),
  /** Desempacota `PedidoDetalhe { pedido, itens }` retornado por `GET /pedidos/{id}`. */
  detalhe: (ref: number | string) =>
    api
      .get<(Pedido & { itens?: ItemPedido[] }) | { pedido: Pedido; itens: ItemPedido[] }>(
        "pedidos",
        ref,
      )
      .then((res) =>
        "pedido" in res
          ? { ...res.pedido, itens: res.itens ?? [] }
          : { ...res, itens: res.itens ?? [] },
      ),
  criarManual: (b: unknown) => api.post<Pedido>("pedidos", b),
  transicionar: (id: number, status: string) =>
    api.patchAcao<Pedido>("pedidos", id, "status", { status }),
};

export const catalogoService = {
  produtos: (f: Filtros = {}) => api.lista<Produto>("produtos", f),
  /** Desempacota `ProdutoDetalhe { produto, imagens }` retornado por `GET /produtos/{id}`. */
  produto: (ref: number | string) =>
    api
      .get<Produto | { produto: Produto; imagens?: unknown[] }>("produtos", ref)
      .then((res) => ("produto" in res ? res.produto : res)),
  criarProduto: (b: unknown) => api.post<Produto>("produtos", b),
  atualizarProduto: (id: number, b: unknown) => api.patch<Produto>("produtos", id, b),
  arquivarProduto: (id: number) => api.del("produtos", id),
  imagens: (produtoId: number) =>
    api.listaArray<import("./models").ProdutoImagem>(`produtos/${produtoId}/imagens`),
  adicionarImagem: (
    produtoId: number,
    b: { url: string; alt_text?: string | null; ordem?: number; is_principal?: boolean },
  ) => api.post<import("./models").ProdutoImagem>(`produtos/${produtoId}/imagens`, b),
  atualizarImagem: (
    produtoId: number,
    imagemId: number,
    b: { alt_text?: string | null; ordem?: number; is_principal?: boolean },
  ) => api.patch<import("./models").ProdutoImagem>(`produtos/${produtoId}/imagens`, imagemId, b),
  removerImagem: (produtoId: number, imagemId: number) =>
    api.del(`produtos/${produtoId}/imagens`, imagemId),

  categorias: () => api.listaArray<import("./models").Categoria>("categorias"),
  criarCategoria: (b: unknown) => api.post<import("./models").Categoria>("categorias", b),
  atualizarCategoria: (id: number, b: unknown) =>
    api.patch<import("./models").Categoria>("categorias", id, b),
  excluirCategoria: (id: number) => api.del("categorias", id),

  obterCms: () => api.getRecurso<import("./models").CmsLoja>("cms"),
  salvarCms: (b: import("./models").CmsLoja) =>
    api.putRecurso<import("./models").CmsLoja>("cms", b),

  tabelas: (f: Filtros = {}) => api.lista<TabelaPreco>("tabelas-preco", f),
  /** Desempacota `TabelaDetalhe { tabela, itens }` retornado por `GET /tabelas-preco/{id}`. */
  tabela: (ref: number | string) =>
    api
      .get<TabelaPreco | { tabela: TabelaPreco; itens: TabelaPreco["itens"] }>("tabelas-preco", ref)
      .then((res) =>
        "tabela" in res
          ? { ...res.tabela, itens: res.itens ?? [] }
          : { ...res, itens: res.itens ?? [] },
      ),
  criarTabela: (b: unknown) => api.post<TabelaPreco>("tabelas-preco", b),
  atualizarTabela: (id: number, b: unknown) => api.patch<TabelaPreco>("tabelas-preco", id, b),
  definirPreco: (tabelaId: number, produtoId: number, preco: string) =>
    api.post(`tabelas-preco/${tabelaId}/itens`, { produto_id: produtoId, preco }),
  removerItemTabela: (tabelaId: number, produtoId: number) =>
    api.del(`tabelas-preco/${tabelaId}/itens`, produtoId),
};

export const estoqueService = {
  saldo: (produtoId: number) => api.get<SaldoEstoque>("estoque/saldo", produtoId),
  movimentacoes: (f: Filtros = {}) => api.lista<Movimentacao>("estoque/movimentacoes", f),
  lancar: (b: { produto_id: number; tipo: string; quantidade: string; motivo?: string }) =>
    api.post<Movimentacao>("estoque/movimentacoes", b),
  abaixoDoMinimo: (limite?: number) =>
    api.listaArray<SaldoAbaixoMinimo>("estoque/abaixo-do-minimo", { limite }),
};

export const osService = {
  listar: (f: Filtros = {}) => api.lista<OrdemServico>("ordens-servico", f),
  /**
   * Desempacota `OsDetalhe { ordem, itens, historico }` retornado por `GET /ordens-servico/{id}`
   * e mapeia `itens` para `materiais`.
   */
  buscar: (ref: number | string) =>
    api
      .get<
        | OrdemServico
        | {
            ordem: OrdemServico;
            itens: OrdemServico["materiais"];
            historico: OrdemServico["historico"];
          }
      >("ordens-servico", ref)
      .then((res) =>
        "ordem" in res
          ? {
              ...res.ordem,
              materiais: res.itens ?? [],
              historico: res.historico ?? [],
            }
          : res,
      ),
  criar: (b: unknown) => api.post<OrdemServico>("ordens-servico", b),
  /**
   * `POST /ordens-servico/{id}/materiais` retorna `OsItem` no backend Rust —
   * em seguida recarregamos a OS completa (`OsDetalhe`) para manter a tela consistente.
   */
  consumirMaterial: async (id: number, produto_id: number, quantidade: string) => {
    await api.postAcao("ordens-servico", id, "materiais", { produto_id, quantidade });
    return osService.buscar(id);
  },
  transicionar: async (id: number, status: string, observacao?: string) => {
    await api.patchAcao<OrdemServico>("ordens-servico", id, "status", { status, observacao });
    return osService.buscar(id);
  },
};

export const fiscalService = {
  listar: (f: Filtros = {}) =>
    api.lista<NotaFiscal>("notas-fiscais", f).then((p) => ({
      ...p,
      itens: (p.itens ?? []).map(normalizarNotaFiscal),
    })),
  /** Desempacota `NotaDetalhe { nota, itens }` retornado por `GET /notas-fiscais/{id}`. */
  buscar: (id: number) =>
    api
      .get<NotaFiscal | { nota: NotaFiscal; itens?: unknown[] }>("notas-fiscais", id)
      .then((res) => normalizarNotaFiscal("nota" in res ? res.nota : res)),
  emitir: (pedido_id: number) =>
    api.post<NotaFiscal>("notas-fiscais", { pedido_id }).then(normalizarNotaFiscal),
  autorizar: (id: number) =>
    api.postAcao<NotaFiscal>("notas-fiscais", id, "autorizar").then(normalizarNotaFiscal),
  cancelar: (id: number, motivo: string) =>
    api
      .postAcao<NotaFiscal>("notas-fiscais", id, "cancelar", { motivo })
      .then(normalizarNotaFiscal),

  // ── Configuração fiscal SEFAZ (credenciais, certificado A1) ────────────
  config: () => api.getRecurso<import("./models").ConfigFiscal>("fiscal/configuracao"),
  salvarConfig: (b: {
    ambiente?: "homologacao" | "producao";
    serie_nf?: string;
    regime_tributario?: string;
    csc_id?: string;
    csc_token?: string;
  }) => api.putRecurso<import("./models").ConfigFiscal>("fiscal/configuracao", b),
  /** Upload binário do certificado A1 — metadados via headers X-*. */
  uploadCertificado: (arquivo: File, senha?: string, validade?: string) =>
    api.postBytes<import("./models").ConfigFiscal>("fiscal/configuracao/certificado", arquivo, {
      "Content-Type": "application/x-pkcs12",
      "X-Nome-Arquivo": arquivo.name || "certificado.pfx",
      ...(senha?.trim() ? { "X-Certificado-Senha": senha.trim() } : {}),
      ...(validade?.trim() ? { "X-Certificado-Validade": validade.trim() } : {}),
    }),
  removerCertificado: () =>
    api.del<import("./models").ConfigFiscal>("fiscal/configuracao/certificado"),
};

/**
 * Orquestração fiscal no hweld-operations-api (`/fiscal-documents`): emissão,
 * consulta, cancelamento e artefatos via provedor configurado (Focus NFe).
 * O frontend nunca fala com o provedor — só com endpoints internos.
 */
export const fiscalDocService = {
  documentos: (f: Filtros = {}) =>
    apiOps.pagina<import("./models").FiscalDocumento>("fiscal-documents", f),
  documento: (id: string) => apiOps.get<import("./models").FiscalDocumento>("fiscal-documents", id),
  historico: (id: string) =>
    apiOps.listaArray<import("./models").FiscalDocumentoEvento>(`fiscal-documents/${id}/historico`),
  /** Emissão assíncrona (202) — empresa/dados fiscais resolvidos no backend. */
  emitir: (pedidoId: number, notaFiscalId?: number, docType: "NFE" | "NFSE" = "NFE") =>
    apiOps.post<import("./models").FiscalDocumento>("fiscal-documents", {
      pedidoId,
      docType,
      ...(notaFiscalId != null ? { notaFiscalId } : {}),
    }),
  cancelar: (id: string, motivo: string) =>
    apiOps.postAcao<import("./models").FiscalDocumento>("fiscal-documents", id, "cancel", {
      motivo,
    }),
  refresh: (id: string) =>
    apiOps.postAcao<import("./models").FiscalDocumento>("fiscal-documents", id, "refresh"),
  cartaCorrecao: (id: string, correcao: string) =>
    apiOps.postAcao("fiscal-documents", id, "carta-correcao", { correcao }),
  webhookResend: (id: string) => apiOps.postAcao("fiscal-documents", id, "webhook-resend"),
  xml: (id: string) => apiOps.baixar(`fiscal-documents/${id}/xml`),
  pdf: (id: string) => apiOps.baixar(`fiscal-documents/${id}/pdf`),
};

export const financeiroService = {
  pagamentos: (f: Filtros = {}) =>
    api.lista<Pagamento>("pagamentos", f).then((p) => ({
      ...p,
      itens: (p.itens ?? []).map(normalizarPagamento),
    })),
  gerarParcelas: (b: {
    pedido_id: number;
    quantidade: number;
    primeiro_vencimento: string;
    intervalo_dias?: number;
    forma_pagamento_id?: number;
  }) =>
    api
      .post<Pagamento[]>("pagamentos/parcelas", b)
      .then((lista) => (lista ?? []).map(normalizarPagamento)),
  baixar: (id: number, forma_pagamento_id: number, observacao?: string) =>
    api
      .postAcao<Pagamento>("pagamentos", id, "baixar", { forma_pagamento_id, observacao })
      .then(normalizarPagamento),
  estornar: (id: number, motivo: string) =>
    api.postAcao<Pagamento>("pagamentos", id, "estornar", { motivo }).then(normalizarPagamento),
  caixaAberto: () => api.get<Caixa | null>("caixas", "aberto"),
  caixas: (f: Filtros = {}) => api.lista<Caixa>("caixas", f),
  // endpoint devolve Vec<CaixaMovimentacao> — array puro, não Pagina
  movimentacoesCaixa: (id: number) =>
    api.listaArray<CaixaMovimentacao>(`caixas/${id}/movimentacoes`),
  abrir: (valor_abertura: string) => api.post<Caixa>("caixas/abrir", { valor_abertura }),
  // só suprimento/sangria/despesa — venda/recebimento/estorno nascem de pedidos e parcelas
  lancar: (b: { tipo: string; valor: string; forma_pagamento_id?: number; descricao?: string }) =>
    api.post<CaixaMovimentacao>("caixas/lancar", b),
  fechar: (valor_informado: string) => api.post<Caixa>("caixas/fechar", { valor_informado }),
};

export const buscaService = {
  buscar: (f: Filtros = {}) => api.lista<ItemBuscaStaff>("busca/produtos", f),
  reindexar: () => api.post("busca/reindexar", {}),
};

export const auditoriaService = {
  listar: (f: Filtros = {}) => api.lista<LogAuditoria>("auditoria", f),
};

export const usuariosService = {
  listar: (f: Filtros = {}) => api.lista<Usuario>("usuarios", f),
  criar: (b: { nome: string; email: string; senha: string; perfil: string }) =>
    api.post<Usuario>("usuarios", b),
  atualizar: (id: number, b: { nome?: string; email?: string; perfil?: string }) =>
    api.patch<Usuario>("usuarios", id, b),
  /** No backend (`handlers/usuarios.rs`), `definir_ativo` é `PATCH /usuarios/{id}/ativo`. */
  definirAtivo: (id: number, ativo: boolean) =>
    api.patchAcao<void>("usuarios", id, "ativo", { ativo }),
};

export const notificacoesService = {
  naoLidas: () => api.get<{ total: number }>("notificacoes", "nao-lidas"),
  listar: (f: Filtros = {}) => api.lista<Notificacao>("notificacoes", f),
  marcarLida: (id: number) => api.postAcao<void>("notificacoes", id, "lida"),
  marcarTodas: () => api.post("notificacoes/ler-todas", {}),
  remover: (id: number) => api.del<void>("notificacoes", id),
};

/** Troca a própria senha — 422 = senha atual incorreta. */
export function trocarSenha(senha_atual: string, nova_senha: string): Promise<void> {
  return api.post("auth/senha", { senha_atual, nova_senha });
}

/** "Suas sessões" — dispositivo/IP de cada sessão ativa do usuário logado. */
export const sessaoService = {
  listar: () => api.listaArray<Sessao>("auth/sessoes"),
  encerrar: (id: string) => api.del<void>("auth/sessoes", id),
  encerrarOutras: () => api.post<{ encerradas: number }>("auth/sessoes/encerrar-outras", {}),
};

/**
 * Módulo Integrações (hweld-operations-api) — Infobip SMS. Estado, toggles
 * operacionais, teste de conexão read-only, SMS de teste restrito e histórico.
 */
export const integracoesService = {
  infobip: () => apiOps.getRecurso<import("./models").IntegracaoInfobip>("integracoes/infobip"),
  salvarConfig: (b: {
    enabled?: boolean;
    sender?: string;
    maxSegments?: number;
    testRecipients?: string[];
    events?: Record<string, boolean>;
  }) => apiOps.putRecurso<import("./models").IntegracaoInfobip>("integracoes/infobip/config", b),
  testarConexao: () =>
    apiOps.post<{ ok: boolean; detalhe: string }>("integracoes/infobip/testar-conexao", {}),
  enviarSmsTeste: (destinatario: string) =>
    apiOps.post<import("./models").EntregaSms>("integracoes/infobip/sms-teste", { destinatario }),
  reprocessar: (deliveryId: string) =>
    apiOps.post<import("./models").EntregaSms>(
      `integracoes/infobip/deliveries/${deliveryId}/reprocessar`,
      {},
    ),
  historico: (f: Filtros = {}) =>
    apiOps.pagina<import("./models").EntregaSms>("integracoes/infobip/historico", f),
};
