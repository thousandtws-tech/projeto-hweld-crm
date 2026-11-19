import type {
  IntegracaoInfobip,
  IntegracaoMelhorEnvio,
  IntegracaoPagBank,
  IntegracaoSpedy,
  IntegracaoZapi,
} from "@/lib/models";

/**
 * Catálogo de integrações do HWeld — metadados públicos e estáticos,
 * separados do estado real de conexão (que vem do backend).
 * `implementada=false` → card "Em breve", nunca com ação de conexão.
 */

export type CategoriaIntegracao =
  | "comunicacao"
  | "pagamentos"
  | "fiscal"
  | "logistica"
  | "identidade";

export const CATEGORIAS: { slug: CategoriaIntegracao; rotulo: string }[] = [
  { slug: "comunicacao", rotulo: "Comunicação" },
  { slug: "pagamentos", rotulo: "Pagamentos" },
  { slug: "fiscal", rotulo: "Fiscal" },
  { slug: "logistica", rotulo: "Logística" },
  { slug: "identidade", rotulo: "Identidade" },
];

export type EstadoConexao =
  | "conectado"
  | "pendente"
  | "desconectado"
  | "falha"
  | "em_breve";

export interface IntegracaoCatalogo {
  slug: string;
  nome: string;
  /** Monograma do tile de logo (sem emoji, sem asset externo). */
  iniciais: string;
  /** Cor de marca aproximada para o tile. */
  cor: string;
  categoria: CategoriaIntegracao;
  descricao: string;
  /** Tem backend + tela reais — recebe ações de conexão/gerência. */
  implementada: boolean;
  /** Escopo de uso no produto. */
  escopo?: "CRM" | "Loja" | "CRM e Loja";
  /** O que a integração entrega — usado na página de detalhes. */
  funcionalidades?: string[];
}

export const CATALOGO: IntegracaoCatalogo[] = [
  {
    slug: "zapi",
    nome: "Z-API",
    iniciais: "ZA",
    cor: "#25a05a",
    categoria: "comunicacao",
    descricao: "WhatsApp transacional pelo número da empresa — avisos de pedido, cobrança e NF-e.",
    implementada: true,
    escopo: "CRM",
    funcionalidades: [
      "Envio de texto transacional pela fila de notificações",
      "Conexão do número por QR Code",
      "Webhooks de recebimento, entrega e queda de conexão",
      "Toggles por evento de negócio e destinatários de teste",
    ],
  },
  {
    slug: "infobip",
    nome: "Infobip",
    iniciais: "In",
    cor: "#ff5c33",
    categoria: "comunicacao",
    descricao: "SMS transacional global com relatório de entrega (DLR) por webhook.",
    implementada: true,
    escopo: "CRM",
    funcionalidades: [
      "SMS transacional com segmentação GSM-7/UCS-2",
      "Confirmação de entrega via webhook DLR",
      "Retry automático e histórico de envios",
      "Destinatários de teste e pausa operacional",
    ],
  },
  {
    slug: "mercado-pago",
    nome: "Mercado Pago",
    iniciais: "MP",
    cor: "#00b1ea",
    categoria: "pagamentos",
    descricao: "Receba pagamentos por Pix, cartão e boleto no checkout da loja.",
    implementada: false,
    escopo: "CRM e Loja",
    funcionalidades: ["Pix, cartão e boleto", "Checkout transparente", "Conciliação de cobranças"],
  },
  {
    slug: "pagbank",
    nome: "PagBank",
    iniciais: "PB",
    cor: "#00b140",
    categoria: "pagamentos",
    descricao: "Cobrança Pix com QR Code por pedido — confirmação por webhook PagBank.",
    implementada: true,
    escopo: "CRM e Loja",
    funcionalidades: [
      "Cobrança Pix com QR Code e copia-e-cola",
      "Confirmação por webhook com verificação fetch-back",
      "Cancelamento e estorno",
      "Histórico de cobranças e eventos",
    ],
  },
  {
    slug: "infinitypay",
    nome: "InfinityPay",
    iniciais: "IP",
    cor: "#7b2ff2",
    categoria: "pagamentos",
    descricao: "Maquininha e link de pagamento para vendas presenciais e remotas.",
    implementada: false,
    escopo: "Loja",
    funcionalidades: ["Link de pagamento", "Maquininha inteligente", "Antecipação de recebíveis"],
  },
  {
    slug: "spedy",
    nome: "Spedy",
    iniciais: "Sp",
    cor: "#1e6fe8",
    categoria: "fiscal",
    descricao: "Emissão de NF-e com credenciais próprias, webhooks assinados e reconciliação.",
    implementada: true,
    escopo: "CRM",
    funcionalidades: [
      "Emissão de NF-e",
      "Cancelamento e carta de correção",
      "Webhooks assinados",
      "XML e DANFE",
    ],
  },
  {
    slug: "melhor-envio",
    nome: "Melhor Envio",
    iniciais: "ME",
    cor: "#00a6e0",
    categoria: "logistica",
    descricao: "Cotação de fretes com múltiplas transportadoras — Correios e privadas.",
    implementada: true,
    escopo: "CRM e Loja",
    funcionalidades: [
      "Cotação por pedido com dados do cadastro",
      "Cotação manual por CEP e dimensões",
      "Sandbox e produção na mesma conta",
      "Histórico de cotações",
    ],
  },
  {
    slug: "didit",
    nome: "Didit",
    iniciais: "Di",
    cor: "#4f46e5",
    categoria: "identidade",
    descricao: "Verificação de identidade (KYC) para onboarding de empresas e contatos.",
    implementada: false,
    escopo: "CRM",
    funcionalidades: ["Verificação de documentos", "Biometria facial", "Screening AML"],
  },
];

export const CATALOGO_POR_SLUG = new Map(CATALOGO.map((c) => [c.slug, c]));

export function categoriaRotulo(slug: CategoriaIntegracao): string {
  return CATEGORIAS.find((c) => c.slug === slug)?.rotulo ?? slug;
}

/* ---- Estado real de conexão ---- */

export interface EstadoIntegracao {
  estado: EstadoConexao;
  /** Chave do `StatusPill` (tom) — tons já existentes no design system. */
  tom: string;
  rotulo: string;
}

const ESTADO_UI: Record<EstadoConexao, EstadoIntegracao> = {
  conectado: { estado: "conectado", tom: "ativo", rotulo: "Conectado" },
  pendente: { estado: "pendente", tom: "em_analise", rotulo: "Configuração pendente" },
  desconectado: { estado: "desconectado", tom: "inativo", rotulo: "Desconectado" },
  falha: { estado: "falha", tom: "rejeitada", rotulo: "Erro de conexão" },
  em_breve: { estado: "em_breve", tom: "prospecto", rotulo: "Em breve" },
};

export function estadoUi(e: EstadoConexao): EstadoIntegracao {
  return ESTADO_UI[e];
}

/** `estado` do view Infobip → estado de conexão do catálogo. */
export function estadoInfobip(v: IntegracaoInfobip): EstadoConexao {
  switch (v.estado) {
    case "ativa": return "conectado";
    case "pendente": return "pendente";
    case "falha": return "falha";
    default: return "desconectado";
  }
}

/** `estado` do view Z-API → estado de conexão do catálogo. */
export function estadoZapi(v: IntegracaoZapi): EstadoConexao {
  switch (v.estado) {
    case "ativa": return "conectado";
    case "conectando":
    case "pendente": return "pendente";
    case "falha": return "falha";
    default: return "desconectado";
  }
}

/** `estado` do view Spedy → estado de conexão do catálogo. "desativada" com
 *  api_key salva = configurada aguardando habilitação → pendente, não
 *  "Desconectado" (que implicaria nunca ter sido configurada). */
export function estadoSpedy(v: IntegracaoSpedy): EstadoConexao {
  switch (v.estado) {
    case "ativa": return "conectado";
    case "pendente": return "pendente";
    case "falha": return "falha";
    default:
      return v.segredos?.campos?.api_key ? "pendente" : "desconectado";
  }
}

/** `estado` do view PagBank → estado de conexão do catálogo. Mesma regra:
 *  "desativada" com token salvo = pendente, não "Desconectado". */
export function estadoPagBank(v: IntegracaoPagBank): EstadoConexao {
  switch (v.estado) {
    case "ativa": return "conectado";
    case "pendente": return "pendente";
    case "falha": return "falha";
    default:
      return v.segredos?.campos?.token ? "pendente" : "desconectado";
  }
}

/** `estado` do view Melhor Envio → estado de conexão do catálogo. Mesma
 *  regra da Spedy: "desativada" com token salvo = pendente, não "Desconectado". */
export function estadoMelhorEnvio(v: IntegracaoMelhorEnvio): EstadoConexao {
  switch (v.estado) {
    case "ativa": return "conectado";
    case "pendente": return "pendente";
    case "falha": return "falha";
    default:
      return v.segredos?.campos?.token ? "pendente" : "desconectado";
  }
}

/** Ação principal do card conforme o estado real. */
export function acaoDoEstado(e: EstadoConexao): { rotulo: string; desabilitado: boolean } {
  switch (e) {
    case "conectado": return { rotulo: "Gerenciar", desabilitado: false };
    case "pendente": return { rotulo: "Continuar configuração", desabilitado: false };
    case "desconectado": return { rotulo: "Conectar", desabilitado: false };
    case "falha": return { rotulo: "Revisar configuração", desabilitado: false };
    case "em_breve": return { rotulo: "Detalhes", desabilitado: false };
  }
}
