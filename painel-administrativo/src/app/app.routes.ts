import { Routes } from '@angular/router';
import { Perfil } from './core/models';
import { staffGuard, perfilGuard } from './core/guards';
import { AdminShell } from './layout/shell';
import { LoginPage } from './features/auth/login';
import { DashboardPage } from './features/dashboard/dashboard';
import { ListaCfg, ListaPage } from './shared/lista';
import { NaoEncontradoPage, SemPermissaoPage } from './features/erros';
import { Empresa360Page, EmpresaNovaPage } from './features/crm/empresa';
import { OportunidadesPage } from './features/crm/oportunidades';
import { OrcamentoPage } from './features/vendas/orcamento';
import { PedidoDetalhePage, PedidoNovoPage } from './features/vendas/pedidos';
import { CategoriasPage, ProdutoFormPage, TabelaPrecoPage } from './features/catalogo/catalogo';
import { EstoquePage } from './features/estoque/estoque';
import { OsDetalhePage } from './features/operacao/os';
import { FiscalPage } from './features/fiscal/fiscal';
import { CaixaPage, PagamentosPage } from './features/financeiro/financeiro';
import { AuditoriaPage, BuscaPage, SenhaPage, UsuariosPage } from './features/admin/admin';

const lista = (path: string, cfg: ListaCfg, perfis?: Perfil[]) => ({
  path,
  component: ListaPage,
  data: { cfg },
  ...(perfis ? { canActivate: [perfilGuard(...perfis)] } : {}),
});

const statusFiltro = (opcoes: string[]) => ({
  campo: 'status',
  rotulo: 'Status',
  opcoes: opcoes.map((v) => ({ valor: v, rotulo: v.replaceAll('_', ' ') })),
});

export const routes: Routes = [
  { path: 'login', component: LoginPage },
  {
    path: '',
    component: AdminShell,
    canActivate: [staffGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardPage },

      // CRM
      lista('crm/empresas', {
        titulo: 'Empresas', recurso: 'empresas', busca: true,
        colunas: [
          { campo: 'id', rotulo: '#', link: '/crm/empresas' },
          { campo: 'razao_social', rotulo: 'Razão social' },
          { campo: 'cnpj', rotulo: 'CNPJ' },
          { campo: 'segmento', rotulo: 'Segmento' },
          { campo: 'status', rotulo: 'Status', tipo: 'status' },
        ],
        novaRota: '/crm/empresas/nova', detalhePrefixo: '/crm/empresas',
      }),
      { path: 'crm/empresas/nova', component: EmpresaNovaPage },
      { path: 'crm/empresas/:id', component: Empresa360Page },
      { path: 'crm/oportunidades', component: OportunidadesPage },

      // Vendas
      lista('vendas/orcamentos', {
        titulo: 'Orçamentos', recurso: 'orcamentos',
        colunas: [
          { campo: 'id', rotulo: '#', link: '/vendas/orcamentos' },
          { campo: 'empresa_id', rotulo: 'Empresa' },
          { campo: 'status', rotulo: 'Status', tipo: 'status' },
          { campo: 'total', rotulo: 'Total', tipo: 'dinheiro' },
          { campo: 'validade', rotulo: 'Validade', tipo: 'data' },
          { campo: 'created_at', rotulo: 'Criado em', tipo: 'data' },
        ],
        filtro: statusFiltro(['rascunho', 'enviado', 'em_analise', 'aprovado', 'recusado', 'expirado', 'convertido']),
        detalhePrefixo: '/vendas/orcamentos',
      }),
      { path: 'vendas/orcamentos/:id', component: OrcamentoPage },
      lista('vendas/pedidos', {
        titulo: 'Pedidos', recurso: 'pedidos',
        colunas: [
          { campo: 'numero', rotulo: 'Nº', link: '/vendas/pedidos' },
          { campo: 'empresa_id', rotulo: 'Empresa' },
          { campo: 'origem', rotulo: 'Origem' },
          { campo: 'status', rotulo: 'Status', tipo: 'status' },
          { campo: 'total', rotulo: 'Total', tipo: 'dinheiro' },
          { campo: 'created_at', rotulo: 'Criado em', tipo: 'data' },
        ],
        filtro: statusFiltro(['aguardando_pagamento', 'confirmado', 'em_separacao', 'faturado', 'enviado', 'entregue', 'concluido', 'cancelado']),
        novaRota: '/vendas/pedidos/novo', detalhePrefixo: '/vendas/pedidos',
        eventos: ['pedido.criado', 'pedido.status_alterado'],
      }),
      { path: 'vendas/pedidos/novo', component: PedidoNovoPage },
      { path: 'vendas/pedidos/:id', component: PedidoDetalhePage },

      // Catálogo
      lista('catalogo/produtos', {
        titulo: 'Produtos', recurso: 'produtos', busca: true,
        colunas: [
          { campo: 'sku', rotulo: 'SKU', link: '/catalogo/produtos' },
          { campo: 'nome', rotulo: 'Nome' },
          { campo: 'marca', rotulo: 'Marca' },
          { campo: 'unidade_medida', rotulo: 'UM' },
          { campo: 'preco_venda', rotulo: 'Preço', tipo: 'dinheiro' },
          { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool' },
        ],
        filtro: { campo: 'ativo', rotulo: 'Ativo', opcoes: [{ valor: 'true', rotulo: 'Sim' }, { valor: 'false', rotulo: 'Não' }] },
        novaRota: '/catalogo/produtos/novo', detalhePrefixo: '/catalogo/produtos',
        eventos: ['catalogo.produtos'],
      }, ['admin', 'estoque', 'vendedor']),
      {
        path: 'catalogo/produtos/novo', canActivate: [perfilGuard('admin', 'estoque', 'vendedor')],
        component: ProdutoFormPage,
      },
      {
        path: 'catalogo/produtos/:id', canActivate: [perfilGuard('admin', 'estoque', 'vendedor')],
        component: ProdutoFormPage,
      },
      {
        path: 'catalogo/categorias', canActivate: [perfilGuard('admin', 'estoque')],
        component: CategoriasPage,
      },
      lista('catalogo/tabelas-preco', {
        titulo: 'Tabelas de preço', recurso: 'tabelas-preco',
        colunas: [
          { campo: 'id', rotulo: '#', link: '/catalogo/tabelas-preco' },
          { campo: 'nome', rotulo: 'Nome' },
          { campo: 'descricao', rotulo: 'Descrição' },
        ],
        detalhePrefixo: '/catalogo/tabelas-preco',
      }, ['admin', 'vendedor']),
      {
        path: 'catalogo/tabelas-preco/:id', canActivate: [perfilGuard('admin', 'vendedor')],
        component: TabelaPrecoPage,
      },

      // Estoque / Operação
      {
        path: 'estoque', canActivate: [perfilGuard('admin', 'estoque')],
        component: EstoquePage,
      },
      lista('operacao/ordens-servico', {
        titulo: 'Ordens de serviço', recurso: 'ordens-servico',
        colunas: [
          { campo: 'id', rotulo: '#', link: '/operacao/ordens-servico' },
          { campo: 'empresa_id', rotulo: 'Empresa' },
          { campo: 'prioridade', rotulo: 'Prioridade' },
          { campo: 'status', rotulo: 'Status', tipo: 'status' },
          { campo: 'created_at', rotulo: 'Aberta em', tipo: 'data' },
        ],
        filtro: statusFiltro(['aberta', 'em_andamento', 'aguardando_material', 'concluida', 'cancelada']),
        detalhePrefixo: '/operacao/ordens-servico',
      }, ['admin', 'tecnico']),
      {
        path: 'operacao/ordens-servico/:id', canActivate: [perfilGuard('admin', 'tecnico')],
        component: OsDetalhePage,
      },

      // Fiscal / Financeiro
      {
        path: 'fiscal/notas', canActivate: [perfilGuard('admin', 'financeiro')],
        component: FiscalPage,
      },
      {
        path: 'financeiro/pagamentos', canActivate: [perfilGuard('admin', 'financeiro')],
        component: PagamentosPage,
      },
      {
        path: 'financeiro/caixa', canActivate: [perfilGuard('admin', 'financeiro')],
        component: CaixaPage,
      },

      // Admin
      {
        path: 'admin/usuarios', canActivate: [perfilGuard('admin')],
        component: UsuariosPage,
      },
      {
        path: 'admin/busca', canActivate: [perfilGuard('admin')],
        component: BuscaPage,
      },
      {
        path: 'auditoria', canActivate: [perfilGuard('admin')],
        component: AuditoriaPage,
      },
      { path: 'conta', component: SenhaPage },
      { path: 'sem-permissao', component: SemPermissaoPage },
    ],
  },
  { path: 'sem-permissao', component: SemPermissaoPage },
  { path: '**', component: NaoEncontradoPage },
];
