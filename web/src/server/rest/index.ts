/**
 * Composição do gateway REST — um objeto `api` por request GraphQL,
 * com o Bearer token do caller já vinculado.
 */
import { createRestCall } from "@/server/rest/client";
import { createAuthApi, createUsuariosApi } from "@/server/rest/endpoints/auth";
import { createCatalogoApi } from "@/server/rest/endpoints/catalogo";
import { createCrmApi } from "@/server/rest/endpoints/crm";
import {
  createAuditoriaApi,
  createBuscaApi,
  createPortalApi,
  createSaudeApi,
} from "@/server/rest/endpoints/portal";
import { createFinanceiroApi, createFiscalApi } from "@/server/rest/endpoints/financeiro";
import {
  createEstoqueApi,
  createOrcamentosApi,
  createOrdensApi,
  createPedidosApi,
} from "@/server/rest/endpoints/vendas";

export function createRestApi(token: string | null) {
  const call = createRestCall(token);
  const crm = createCrmApi(call);
  const catalogo = createCatalogoApi(call);
  const financeiro = createFinanceiroApi(call);

  return {
    saude: createSaudeApi(call),
    auth: createAuthApi(call),
    usuarios: createUsuariosApi(call),
    empresas: crm.empresas,
    contatos: crm.contatos,
    enderecos: crm.enderecos,
    oportunidades: crm.oportunidades,
    interacoes: crm.interacoes,
    orcamentos: createOrcamentosApi(call),
    categorias: catalogo.categorias,
    produtos: catalogo.produtos,
    tabelasPreco: catalogo.tabelasPreco,
    pedidos: createPedidosApi(call),
    estoque: createEstoqueApi(call),
    ordensServico: createOrdensApi(call),
    notasFiscais: createFiscalApi(call),
    pagamentos: financeiro.pagamentos,
    caixas: financeiro.caixas,
    busca: createBuscaApi(call),
    auditoria: createAuditoriaApi(call),
    portal: createPortalApi(call),
  };
}

export type RestApi = ReturnType<typeof createRestApi>;
