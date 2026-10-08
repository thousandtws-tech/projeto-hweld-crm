import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { AuthStore } from '../core/auth';
import { Perfil } from '../core/models';
import { RealtimeService } from '../core/realtime';
import { NotificacoesService } from '../core/notificacoes';
import { SinoNotificacoes } from './sino';

interface ItemNav {
  label: string;
  rota: string;
  icone: string; // bootstrap-icons, sem prefixo "bi-"
  perfis?: Perfil[]; // ausente = todos os staff
}

const NAV: { secao: string; itens: ItemNav[] }[] = [
  {
    secao: 'Vendas',
    itens: [
      { label: 'Dashboard', rota: '/dashboard', icone: 'speedometer2' },
      { label: 'Oportunidades', rota: '/crm/oportunidades', icone: 'funnel' },
      { label: 'Empresas', rota: '/crm/empresas', icone: 'buildings' },
      { label: 'Orçamentos', rota: '/vendas/orcamentos', icone: 'file-earmark-text' },
      { label: 'Pedidos', rota: '/vendas/pedidos', icone: 'cart3' },
    ],
  },
  {
    secao: 'Catálogo',
    itens: [
      { label: 'Produtos', rota: '/catalogo/produtos', icone: 'box-seam', perfis: ['admin', 'estoque', 'vendedor'] },
      { label: 'Categorias', rota: '/catalogo/categorias', icone: 'diagram-3', perfis: ['admin', 'estoque'] },
      { label: 'Tabelas de preço', rota: '/catalogo/tabelas-preco', icone: 'tags', perfis: ['admin', 'vendedor'] },
    ],
  },
  {
    secao: 'Operação',
    itens: [
      { label: 'Estoque', rota: '/estoque', icone: 'boxes', perfis: ['admin', 'estoque'] },
      { label: 'Ordens de serviço', rota: '/operacao/ordens-servico', icone: 'tools', perfis: ['admin', 'tecnico'] },
      { label: 'Notas fiscais', rota: '/fiscal/notas', icone: 'receipt', perfis: ['admin', 'financeiro'] },
    ],
  },
  {
    secao: 'Financeiro',
    itens: [
      { label: 'Pagamentos', rota: '/financeiro/pagamentos', icone: 'cash-coin', perfis: ['admin', 'financeiro'] },
      { label: 'Caixa', rota: '/financeiro/caixa', icone: 'safe2', perfis: ['admin', 'financeiro'] },
    ],
  },
  {
    secao: 'Administração',
    itens: [
      { label: 'Usuários', rota: '/admin/usuarios', icone: 'people', perfis: ['admin'] },
      { label: 'Busca', rota: '/admin/busca', icone: 'search', perfis: ['admin'] },
      { label: 'Auditoria', rota: '/auditoria', icone: 'shield-check', perfis: ['admin'] },
    ],
  },
];

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule, NgbDropdownModule, SinoNotificacoes],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" routerLink="/dashboard" aria-label="HWeld — dashboard">
          <span class="logo" aria-hidden="true"><i class="bi bi-lightning-charge-fill"></i></span>
          <span class="brand-txt">HWeld<em>Admin</em></span>
        </a>
        @for (secao of secoes; track secao.secao) {
          <nav class="grupo" [attr.aria-label]="secao.secao">
            <p class="grupo-titulo">{{ secao.secao }}</p>
            @for (item of secao.itens; track item.rota) {
              @if (!item.perfis || auth.pode(...(item.perfis ?? []))) {
                <a class="item" [routerLink]="item.rota" routerLinkActive="ativo"
                   [routerLinkActiveOptions]="{ exact: item.rota === '/dashboard' }">
                  <i class="bi bi-{{ item.icone }}" aria-hidden="true"></i>
                  <span>{{ item.label }}</span>
                </a>
              }
            }
          </nav>
        }
      </aside>
      <div class="main">
        <header class="topbar">
          <form class="topbar-busca" role="search" (ngSubmit)="buscar()">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input type="search" [formControl]="buscaCtrl" placeholder="Buscar produtos…"
                   aria-label="Busca global" />
          </form>
          <span class="live" [class.on]="rt.conectado()"
                [title]="rt.conectado() ? 'Tempo real conectado' : 'Tempo real reconectando…'"
                role="status" [attr.aria-label]="rt.conectado() ? 'Tempo real conectado' : 'Tempo real desconectado'">
            <i class="bi bi-broadcast" aria-hidden="true"></i>
          </span>
          <app-sino />
          <div class="topbar-usuario" ngbDropdown placement="bottom-end" container="body">
            <button type="button" class="avatar" ngbDropdownToggle
                    aria-label="Conta de {{ auth.perfil() }}">
              <span class="inicial">{{ auth.perfil()?.slice(0, 1)?.toUpperCase() }}</span>
              <span class="meta">
                <strong>#{{ auth.usuarioId() ?? '?' }}</strong>
                <small>{{ auth.perfil() ?? '—' }}</small>
              </span>
              <i class="bi bi-chevron-down" aria-hidden="true"></i>
            </button>
            <div class="dropdown-menu" ngbDropdownMenu>
              <a class="dropdown-item" routerLink="/conta"><i class="bi bi-gear"></i> Minha conta</a>
              <hr class="dropdown-divider" />
              <button class="dropdown-item text-danger" type="button" (click)="sair()">
                <i class="bi bi-box-arrow-right"></i> Sair
              </button>
            </div>
          </div>
        </header>
        <main class="conteudo"><router-outlet /></main>
      </div>
    </div>
  `,
  styles: `
    .shell { display: flex; min-height: 100dvh; }

    /* ── Sidebar ── */
    .sidebar {
      width: var(--hw-layout-sidebar-w); flex-shrink: 0;
      background: linear-gradient(180deg, var(--hw-surface-sidebar) 0%, #0d1420 100%);
      color: #dfe5ec;
      padding: var(--hw-space-4) var(--hw-space-3);
      display: flex; flex-direction: column; gap: var(--hw-space-5);
      position: sticky; top: 0; height: 100dvh; overflow-y: auto;
    }
    .sidebar::-webkit-scrollbar-thumb { background: #3a4657; border-color: var(--hw-surface-sidebar); }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; padding: 2px 6px; }
    .logo {
      width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
      background: linear-gradient(135deg, var(--hw-accent), #3b82f6);
      color: #fff; font-size: 17px; box-shadow: 0 4px 12px rgb(29 79 216 / 40%);
    }
    .brand-txt { font-weight: 800; font-size: 1.1rem; color: #fff; letter-spacing: -.01em; }
    .brand-txt em { font-style: normal; color: var(--hw-accent); font-weight: 500; margin-left: 4px; font-size: .8em; }
    .grupo { display: flex; flex-direction: column; gap: 2px; }
    .grupo-titulo {
      font-size: .66rem; text-transform: uppercase; letter-spacing: .12em;
      color: #5f6f84; margin: 0 0 var(--hw-space-1); padding: 0 10px; font-weight: 700;
    }
    .item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: var(--hw-radius-sm);
      color: #aeb9c8; text-decoration: none; font-size: .875rem; font-weight: 500;
      position: relative; transition: background var(--hw-motion-fast), color var(--hw-motion-fast);
    }
    .item i { font-size: .95rem; width: 18px; text-align: center; opacity: .85; }
    .item:hover { background: rgb(255 255 255 / 6%); color: #fff; }
    .item.ativo { background: rgb(29 79 216 / 16%); color: #fff; }
    .item.ativo::before {
      content: ''; position: absolute; left: -12px; top: 6px; bottom: 6px; width: 3px;
      border-radius: 0 3px 3px 0; background: var(--hw-accent);
    }
    .item.ativo i { color: var(--hw-accent); opacity: 1; }

    /* ── Main ── */
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      display: flex; align-items: center; gap: var(--hw-space-4);
      padding: 10px var(--hw-space-6);
      background: rgb(255 255 255 / 85%); backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--hw-border);
      position: sticky; top: 0; z-index: 1020;
    }
    .topbar-busca {
      flex: 1; max-width: 460px; display: flex; align-items: center; gap: 8px;
      background: var(--hw-surface); border: 1px solid transparent;
      border-radius: var(--hw-radius-sm); padding: 0 10px;
      color: var(--hw-text-3);
    }
    .topbar-busca:focus-within { background: #fff; border-color: var(--hw-accent); box-shadow: 0 0 0 3px rgb(29 79 216 / 12%); }
    .topbar-busca input {
      flex: 1; border: none; background: transparent; padding: 8px 0; font-size: .875rem;
    }
    .topbar-busca input:focus { outline: none; }
    .live { margin-left: auto; color: var(--hw-text-3); font-size: 1.05rem; opacity: .5; transition: opacity .3s, color .3s; }
    .live.on { color: var(--hw-success); opacity: 1; animation: pulse-live 2.5s ease-in-out infinite; }
    @keyframes pulse-live { 50% { opacity: .55; } }
    @media (prefers-reduced-motion: reduce) { .live.on { animation: none; } }
    .topbar-usuario { }
    .avatar {
      display: flex; align-items: center; gap: 10px; border: none; background: none;
      padding: 4px 8px; border-radius: var(--hw-radius-sm); cursor: pointer;
    }
    .avatar:hover { background: var(--hw-surface); }
    .avatar::after { display: none; }
    .inicial {
      width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
      background: linear-gradient(135deg, var(--hw-accent), #3b82f6);
      color: #fff; font-weight: 700; font-size: .9rem;
    }
    .meta { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.15; }
    .meta strong { font-size: .8rem; color: var(--hw-text); }
    .meta small { font-size: .72rem; color: var(--hw-text-3); text-transform: capitalize; }
    .topbar-usuario .bi-chevron-down { font-size: .7rem; color: var(--hw-text-3); }
    .dropdown-item { font-size: .85rem; } .dropdown-item i { margin-right: 8px; }
    .conteudo { padding: var(--hw-space-6) var(--hw-space-6) var(--hw-space-12); max-width: 1440px; width: 100%; margin: 0 auto; }

    @media (max-width: 900px) {
      .shell { flex-direction: column; }
      .sidebar {
        width: 100%; height: auto; position: static;
        flex-direction: row; align-items: center; overflow-x: auto; gap: var(--hw-space-3);
        padding: 8px 12px;
      }
      .grupo { flex-direction: row; align-items: center; gap: 4px; }
      .grupo-titulo { display: none; }
      .item { white-space: nowrap; }
      .item span { display: none; }
      .item i { font-size: 1.15rem; width: auto; }
      .brand-txt { display: none; }
      .topbar-busca .meta { display: none; }
      .conteudo { padding: var(--hw-space-4); }
    }
  `,
})
export class AdminShell {
  readonly auth = inject(AuthStore);
  readonly rt = inject(RealtimeService); // injeta → conecta quando autenticado
  private readonly notifs = inject(NotificacoesService); // injeta → carrega o inbox
  readonly secoes = NAV;
  readonly buscaCtrl = new FormControl('', { nonNullable: true });
  private router = inject(Router);

  buscar(): void {
    const q = this.buscaCtrl.value.trim();
    if (q) void this.router.navigate(['/admin/busca'], { queryParams: { q } });
  }

  sair(): void {
    void this.auth.logout();
  }
}
