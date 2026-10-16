import { Routes } from '@angular/router';
import { portalGuard } from './core/auth/portal.guard';
import { Shell } from './layout/shell';

/**
 * Árvore de rotas do portal B2B.
 * Slug é cosmético: `/p/123-qualquer-coisa` resolve pelo id; o front
 * pode redirecionar para a URL canônica se o slug divergir.
 * Todas as páginas são carregadas sob demanda via `loadComponent`
 * (code splitting por rota); apenas o Shell é eager.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login').then((m) => m.LoginPage),
    title: 'Entrar — HWeld',
  },
  {
    path: '',
    component: Shell,
    children: [
      // Catálogo e Busca Públicos
      {
        path: '',
        loadComponent: () => import('./features/catalogo/home/home').then((m) => m.HomePage),
        title: 'HWeld — Portal B2B',
      },
      {
        path: 'c/:idslug',
        loadComponent: () => import('./features/catalogo/categoria').then((m) => m.CategoriaPage),
        title: 'Categoria — HWeld',
      },
      {
        path: 'busca',
        loadComponent: () => import('./features/catalogo/busca').then((m) => m.BuscaPage),
        title: 'Busca — HWeld',
      },
      {
        path: 'p/:idslug',
        loadComponent: () => import('./features/catalogo/produto').then((m) => m.ProdutoPage),
        title: 'Produto — HWeld',
      },
      {
        path: 'carrinho',
        loadComponent: () => import('./features/carrinho/carrinho').then((m) => m.CarrinhoPage),
        title: 'Carrinho — HWeld',
      },

      // Institucional & Suporte (Padrão Loja do Mecânico / E-commerce Pro)
      {
        path: 'institucional/atendimento',
        loadComponent: () =>
          import('./features/institucional/atendimento').then((m) => m.AtendimentoPage),
        title: 'Atendimento ao Cliente — HWeld',
      },
      {
        path: 'institucional/faq',
        loadComponent: () => import('./features/institucional/faq').then((m) => m.FaqPage),
        title: 'Central de Ajuda & FAQ — HWeld',
      },
      {
        path: 'institucional/trocas-e-devolucoes',
        loadComponent: () => import('./features/institucional/trocas').then((m) => m.TrocasPage),
        title: 'Trocas e Devoluções — HWeld',
      },
      {
        path: 'institucional/privacidade',
        loadComponent: () =>
          import('./features/institucional/privacidade').then((m) => m.PrivacidadePage),
        title: 'LGPD & Privacidade — HWeld',
      },
      {
        path: 'institucional/garantia',
        loadComponent: () =>
          import('./features/institucional/garantia').then((m) => m.GarantiaPage),
        title: 'Garantia Técnica de Equipamentos — HWeld',
      },

      // Aliases amigáveis de primeiro nível
      { path: 'atendimento', redirectTo: 'institucional/atendimento', pathMatch: 'full' },
      { path: 'ajuda', redirectTo: 'institucional/faq', pathMatch: 'full' },
      { path: 'faq', redirectTo: 'institucional/faq', pathMatch: 'full' },
      {
        path: 'trocas-e-devolucoes',
        redirectTo: 'institucional/trocas-e-devolucoes',
        pathMatch: 'full',
      },
      { path: 'privacidade', redirectTo: 'institucional/privacidade', pathMatch: 'full' },
      { path: 'lgpd', redirectTo: 'institucional/privacidade', pathMatch: 'full' },
      { path: 'garantia', redirectTo: 'institucional/garantia', pathMatch: 'full' },

      // Checkout e Área Logada (Protegidos por portalGuard)
      {
        path: 'checkout',
        loadComponent: () => import('./features/checkout/checkout').then((m) => m.CheckoutPage),
        canActivate: [portalGuard],
        title: 'Checkout — HWeld',
      },
      {
        path: 'checkout/sucesso/:id',
        loadComponent: () =>
          import('./features/checkout/checkout-sucesso').then((m) => m.CheckoutSucessoPage),
        canActivate: [portalGuard],
        title: 'Pedido confirmado — HWeld',
      },
      {
        path: 'conta',
        loadComponent: () => import('./features/conta/conta').then((m) => m.ContaPage),
        canActivate: [portalGuard],
        title: 'Minha conta — HWeld',
      },
      {
        path: 'conta/pedidos',
        loadComponent: () => import('./features/conta/pedidos').then((m) => m.PedidosPage),
        canActivate: [portalGuard],
        title: 'Meus pedidos — HWeld',
      },
      {
        path: 'conta/pedidos/:id',
        loadComponent: () =>
          import('./features/conta/pedido-detalhe').then((m) => m.PedidoDetalhePage),
        canActivate: [portalGuard],
        title: 'Pedido — HWeld',
      },
      {
        path: 'conta/seguranca',
        loadComponent: () => import('./features/conta/seguranca').then((m) => m.SegurancaPage),
        canActivate: [portalGuard],
        title: 'Segurança — HWeld',
      },

      {
        path: '**',
        loadComponent: () =>
          import('./features/erros/nao-encontrado').then((m) => m.NaoEncontradoPage),
        title: 'Não encontrado — HWeld',
      },
    ],
  },
];
