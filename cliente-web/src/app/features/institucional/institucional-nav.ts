import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'hw-institucional-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <!-- Breadcrumb Superior -->
    <nav class="breadcrumb" aria-label="Navegação estrutural">
      <a routerLink="/" class="crumb-link">Início</a>
      <span class="crumb-sep">/</span>
      <span class="crumb-atual">{{ paginaAtual() }}</span>
    </nav>

    <!-- Navegação em Abas Horizontais para Mobile (<= 860px) -->
    <nav class="nav-mobile-tabs" aria-label="Menu institucional mobile">
      <a routerLink="/institucional/atendimento" routerLinkActive="ativo" class="tab-chip">
        <span class="material-symbols-outlined" aria-hidden="true">support_agent</span>
        <span>Atendimento</span>
      </a>
      <a routerLink="/institucional/faq" routerLinkActive="ativo" class="tab-chip">
        <span class="material-symbols-outlined" aria-hidden="true">help_outline</span>
        <span>Central de Ajuda</span>
      </a>
      <a routerLink="/institucional/trocas-e-devolucoes" routerLinkActive="ativo" class="tab-chip">
        <span class="material-symbols-outlined" aria-hidden="true">sync_alt</span>
        <span>Trocas & Devoluções</span>
      </a>
      <a routerLink="/institucional/garantia" routerLinkActive="ativo" class="tab-chip">
        <span class="material-symbols-outlined" aria-hidden="true">verified_user</span>
        <span>Garantia Técnica</span>
      </a>
      <a routerLink="/institucional/privacidade" routerLinkActive="ativo" class="tab-chip">
        <span class="material-symbols-outlined" aria-hidden="true">security</span>
        <span>LGPD & Privacidade</span>
      </a>
    </nav>

    <!-- Barra Lateral para Desktop (> 860px) -->
    <aside class="sidebar-desktop">
      <div class="sidebar-card">
        <h3 class="sidebar-tit">Central Institucional</h3>
        <nav class="sidebar-nav">
          <a routerLink="/institucional/atendimento" routerLinkActive="ativo" class="nav-item">
            <span class="material-symbols-outlined" aria-hidden="true">support_agent</span>
            <span>Atendimento ao Cliente</span>
          </a>
          <a routerLink="/institucional/faq" routerLinkActive="ativo" class="nav-item">
            <span class="material-symbols-outlined" aria-hidden="true">help_outline</span>
            <span>Central de Ajuda & FAQ</span>
          </a>
          <a routerLink="/institucional/trocas-e-devolucoes" routerLinkActive="ativo" class="nav-item">
            <span class="material-symbols-outlined" aria-hidden="true">sync_alt</span>
            <span>Trocas e Devoluções</span>
          </a>
          <a routerLink="/institucional/garantia" routerLinkActive="ativo" class="nav-item">
            <span class="material-symbols-outlined" aria-hidden="true">verified_user</span>
            <span>Garantia de Equipamentos</span>
          </a>
          <a routerLink="/institucional/privacidade" routerLinkActive="ativo" class="nav-item">
            <span class="material-symbols-outlined" aria-hidden="true">security</span>
            <span>LGPD & Privacidade</span>
          </a>
        </nav>

        <div class="sidebar-contato">
          <span class="contato-tit">Televendas Corporativo</span>
          <a href="tel:1135089979" class="contato-tel hw-numeric">
            <span class="material-symbols-outlined" aria-hidden="true">call</span>
            <span>(11) 3508-9979</span>
          </a>
          <span class="contato-horario">Seg. a Sex. das 08h às 18h</span>
        </div>
      </div>
    </aside>
  `,
  styles: `
    :host {
      display: contents;
    }

    .breadcrumb {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .crumb-link {
      color: #64748b;
      text-decoration: none;
      transition: color 120ms ease;
      &:hover { color: #0f172a; text-decoration: underline; }
    }
    .crumb-sep { color: #cbd5e1; font-size: 11px; }
    .crumb-atual { color: #0f172a; font-weight: 600; }

    /* Abas Mobile */
    .nav-mobile-tabs {
      display: none;
      grid-column: 1 / -1;
      overflow-x: auto;
      gap: 8px;
      padding-bottom: 8px;
      margin-bottom: 12px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      &::-webkit-scrollbar { display: none; }
    }
    .tab-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      padding: 7px 12px;
      border-radius: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #475569;
      font-size: 12px;
      font-weight: 500;
      text-decoration: none;
      flex-shrink: 0;
      transition: all 120ms ease;

      .material-symbols-outlined { font-size: 16px; }

      &.ativo {
        background: #0f172a;
        color: #ffffff;
        border-color: #0f172a;
        font-weight: 600;
      }
    }

    /* Sidebar Desktop */
    .sidebar-desktop {
      display: flex;
      flex-direction: column;
      width: 260px;
      flex-shrink: 0;
    }
    .sidebar-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      position: sticky;
      top: calc(var(--hw-header-h) + 16px);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }
    .sidebar-tit {
      font-size: 13.5px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
      margin: 0 0 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 8px;
      color: #475569;
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      transition: all 120ms ease;

      .material-symbols-outlined {
        font-size: 18px;
        color: #64748b;
        transition: color 120ms ease;
      }

      &:hover {
        background: #f8fafc;
        color: #0f172a;
        .material-symbols-outlined { color: #0f172a; }
      }

      &.ativo {
        background: #0f172a;
        color: #ffffff;
        font-weight: 600;
        .material-symbols-outlined { color: #ffffff; }
      }
    }

    .sidebar-contato {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid #f1f5f9;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .contato-tit {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #94a3b8;
      font-weight: 600;
    }
    .contato-tel {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #0f172a;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { color: #1e293b; text-decoration: underline; }
    }
    .contato-horario {
      font-size: 11px;
      color: #64748b;
    }

    @media (max-width: 860px) {
      .sidebar-desktop { display: none; }
      .nav-mobile-tabs { display: flex; }
    }
  `,
})
export class HwInstitucionalNav {
  paginaAtual = input.required<string>();
}
