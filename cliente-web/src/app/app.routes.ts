import { Routes } from '@angular/router';
import { portalGuard } from './core/auth/portal.guard';
import { Shell } from './layout/shell';
import { LoginPage } from './features/auth/login';
import { HomePage, CategoriaPage, BuscaPage } from './features/catalogo/paginas';
import { ProdutoPage } from './features/catalogo/produto';
import { CarrinhoPage } from './features/carrinho/carrinho';
import { CheckoutPage, CheckoutSucessoPage } from './features/checkout/checkout';
import { ContaPage, PedidosPage, PedidoDetalhePage, SegurancaPage } from './features/conta/conta';
import { NaoEncontradoPage } from './features/erros/nao-encontrado';
import { AtendimentoPage } from './features/institucional/atendimento';
import { FaqPage } from './features/institucional/faq';
import { TrocasPage } from './features/institucional/trocas';
import { PrivacidadePage } from './features/institucional/privacidade';
import { GarantiaPage } from './features/institucional/garantia';

/**
 * Árvore de rotas do portal B2B.
 * Slug é cosmético: `/p/123-qualquer-coisa` resolve pelo id; o front
 * pode redirecionar para a URL canônica se o slug divergir.
 */
export const routes: Routes = [
  { path: 'login', component: LoginPage, title: 'Entrar — HWeld' },
  {
    path: '',
    component: Shell,
    children: [
      // Catálogo e Busca Públicos
      { path: '', component: HomePage, title: 'HWeld — Portal B2B' },
      { path: 'c/:idslug', component: CategoriaPage, title: 'Categoria — HWeld' },
      { path: 'busca', component: BuscaPage, title: 'Busca — HWeld' },
      { path: 'p/:idslug', component: ProdutoPage, title: 'Produto — HWeld' },
      { path: 'carrinho', component: CarrinhoPage, title: 'Carrinho — HWeld' },

      // Institucional & Suporte (Padrão Loja do Mecânico / E-commerce Pro)
      { path: 'institucional/atendimento', component: AtendimentoPage, title: 'Atendimento ao Cliente — HWeld' },
      { path: 'institucional/faq', component: FaqPage, title: 'Central de Ajuda & FAQ — HWeld' },
      { path: 'institucional/trocas-e-devolucoes', component: TrocasPage, title: 'Trocas e Devoluções — HWeld' },
      { path: 'institucional/privacidade', component: PrivacidadePage, title: 'LGPD & Privacidade — HWeld' },
      { path: 'institucional/garantia', component: GarantiaPage, title: 'Garantia Técnica de Equipamentos — HWeld' },

      // Aliases amigáveis de primeiro nível
      { path: 'atendimento', redirectTo: 'institucional/atendimento', pathMatch: 'full' },
      { path: 'ajuda', redirectTo: 'institucional/faq', pathMatch: 'full' },
      { path: 'faq', redirectTo: 'institucional/faq', pathMatch: 'full' },
      { path: 'trocas-e-devolucoes', redirectTo: 'institucional/trocas-e-devolucoes', pathMatch: 'full' },
      { path: 'privacidade', redirectTo: 'institucional/privacidade', pathMatch: 'full' },
      { path: 'lgpd', redirectTo: 'institucional/privacidade', pathMatch: 'full' },
      { path: 'garantia', redirectTo: 'institucional/garantia', pathMatch: 'full' },

      // Checkout e Área Logada (Protegidos por portalGuard)
      { path: 'checkout', component: CheckoutPage, canActivate: [portalGuard], title: 'Checkout — HWeld' },
      { path: 'checkout/sucesso/:id', component: CheckoutSucessoPage, canActivate: [portalGuard], title: 'Pedido confirmado — HWeld' },
      { path: 'conta', component: ContaPage, canActivate: [portalGuard], title: 'Minha conta — HWeld' },
      { path: 'conta/pedidos', component: PedidosPage, canActivate: [portalGuard], title: 'Meus pedidos — HWeld' },
      { path: 'conta/pedidos/:id', component: PedidoDetalhePage, canActivate: [portalGuard], title: 'Pedido — HWeld' },
      { path: 'conta/seguranca', component: SegurancaPage, canActivate: [portalGuard], title: 'Segurança — HWeld' },

      { path: '**', component: NaoEncontradoPage, title: 'Não encontrado — HWeld' },
    ],
  },
];
