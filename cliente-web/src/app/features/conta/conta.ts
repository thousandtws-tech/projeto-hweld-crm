import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ContaService } from '../../core/servicos';
import { AuthStore } from '../../core/auth/auth.store';
import { RealtimeService } from '../../core/realtime';
import { MeuPerfil, Pagina, PedidoDetalhe, PedidoResumo, StatusPedido } from '../../core/models';
import { BrlPipe, QtyPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwField } from '../../shared/ui/field';
import { HwStatusChip, HwSkeleton, HwEmpty } from '../../shared/ui/misc';
import { ToastService } from '../../shared/ui/toast';

const NAV = `
  <nav class="conta-nav" aria-label="Navegação da conta">
    <a routerLink="/conta" routerLinkActive="atual" [routerLinkActiveOptions]="{ exact: true }" class="nav-item">
      <span class="material-symbols-outlined">person</span>
      <span>Dados Cadastrais</span>
    </a>
    <a routerLink="/conta/pedidos" routerLinkActive="atual" class="nav-item">
      <span class="material-symbols-outlined">receipt_long</span>
      <span>Meus Pedidos</span>
    </a>
    <a routerLink="/conta/seguranca" routerLinkActive="atual" class="nav-item">
      <span class="material-symbols-outlined">lock</span>
      <span>Segurança</span>
    </a>
    <button type="button" class="nav-sair" (click)="sair()">
      <span class="material-symbols-outlined">logout</span>
      <span>Sair da conta</span>
    </button>
  </nav>
`;

const NAV_STYLES = `
  .conta-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: var(--hw-space-2) 0 var(--hw-space-6);
    border-bottom: 1px solid var(--hw-border);
    margin-bottom: var(--hw-space-8);
    flex-wrap: wrap;
  }
  .nav-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--hw-text-muted);
    padding: 8px 14px;
    border-radius: var(--hw-radius-pill);
    text-decoration: none;
    transition: all var(--hw-motion-fast) var(--hw-motion-ease);

    .material-symbols-outlined { font-size: 18px; }
    &:hover { background: var(--hw-surface); color: var(--hw-text); }
    &.atual {
      background: var(--hw-accent-tint);
      color: var(--hw-accent);
      font-weight: 600;
    }
  }
  .nav-sair {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    background: transparent;
    border: 0;
    color: var(--hw-danger);
    font-family: var(--hw-font-sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: var(--hw-radius-pill);
    transition: background var(--hw-motion-fast) var(--hw-motion-ease);

    .material-symbols-outlined { font-size: 18px; }
    &:hover { background: var(--hw-chip-danger-bg); }
  }
  @media (max-width: 640px) {
    .nav-sair { margin-left: 0; }
  }
`;

/** S11 — Minha conta: dados cadastrais, empresa e tabela comercial. */
@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, HwSkeleton],
  template: NAV + `
    <div class="conta-header">
      <h1>Minha Conta</h1>
      <span class="subtitulo">Informações corporativas e parâmetros da sua tabela de faturamento</span>
    </div>

    @if (perfil(); as p) {
      <div class="cards-grid">
        <!-- Card de Contato -->
        <section class="bloco-card">
          <div class="bloco-topo">
            <span class="material-symbols-outlined bloco-icon">account_circle</span>
            <div>
              <h2>Contato do Usuário</h2>
              <span class="bloco-desc">Responsável cadastrado para este acesso</span>
            </div>
          </div>
          <dl class="info-dl">
            <div><dt>Nome Completo</dt><dd>{{ p.contato.nome }}</dd></div>
            <div><dt>E-mail Corporativo</dt><dd>{{ p.contato.email ?? '—' }}</dd></div>
            <div><dt>Telefone / WhatsApp</dt><dd>{{ p.contato.telefone ?? '—' }}</dd></div>
            <div><dt>Cargo / Função</dt><dd>{{ p.contato.cargo ?? '—' }}</dd></div>
          </dl>
        </section>

        <!-- Card da Empresa -->
        <section class="bloco-card">
          <div class="bloco-topo">
            <span class="material-symbols-outlined bloco-icon">business</span>
            <div>
              <h2>Dados da Empresa</h2>
              <span class="bloco-desc">Pessoa jurídica vinculada e parâmetros fiscais</span>
            </div>
          </div>
          <dl class="info-dl">
            <div><dt>Razão Social</dt><dd>{{ p.empresa.razao_social }}</dd></div>
            <div><dt>Nome Fantasia</dt><dd>{{ p.empresa.nome_fantasia ?? '—' }}</dd></div>
            <div><dt>CNPJ</dt><dd class="hw-numeric">{{ p.empresa.cnpj ?? '—' }}</dd></div>
            <div><dt>Segmento de Atuação</dt><dd>{{ p.empresa.segmento ?? '—' }}</dd></div>
            @if (p.tabela_preco) {
              <div class="tabela-preco-row">
                <dt>Tabela Comercial Ativa</dt>
                <dd>
                  <span class="tabela-chip">{{ p.tabela_preco.nome }}</span>
                </dd>
              </div>
            }
          </dl>
        </section>
      </div>

      <div class="nota-suporte">
        <span class="material-symbols-outlined">info</span>
        <span>Para atualizar endereço de faturamento, razão social ou condições de prazo, entre em contato com o seu consultor de vendas.</span>
      </div>
    } @else {
      <hw-skeleton style="height: 320px; border-radius: 16px;" />
    }
  `,
  styles: NAV_STYLES + `
    .conta-header {
      margin-bottom: var(--hw-space-6);
      h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
      .subtitulo { font-size: 13.5px; color: var(--hw-text-muted); }
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: var(--hw-space-6);
      margin-bottom: var(--hw-space-6);
    }
    .bloco-card {
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      padding: var(--hw-space-6);
    }
    .bloco-topo {
      display: flex;
      align-items: flex-start;
      gap: var(--hw-space-3);
      margin-bottom: var(--hw-space-5);
      padding-bottom: var(--hw-space-3);
      border-bottom: 1px solid var(--hw-border-subtle);
    }
    .bloco-icon {
      font-size: 24px;
      color: var(--hw-accent);
      margin-top: 2px;
    }
    .bloco-topo h2 {
      font-size: 16px;
      font-weight: 700;
      margin: 0;
      color: var(--hw-text);
    }
    .bloco-desc {
      font-size: 12px;
      color: var(--hw-text-muted);
    }
    .info-dl {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--hw-space-3);
      margin: 0;
      dt { font-size: 11.5px; font-weight: 500; color: var(--hw-text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
      dd { margin: 0; font-size: 14px; font-weight: 500; color: var(--hw-text); }
    }
    .tabela-preco-row {
      margin-top: var(--hw-space-2);
      padding-top: var(--hw-space-3);
      border-top: 1px solid var(--hw-border-subtle);
    }
    .tabela-chip {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      color: var(--hw-accent);
      background: var(--hw-accent-tint);
      border: 1px solid rgba(29, 79, 216, 0.2);
      border-radius: var(--hw-radius-pill);
      padding: 2px 10px;
      margin-top: 4px;
    }
    .nota-suporte {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: var(--hw-space-4);
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-sm);
      font-size: 13px;
      color: var(--hw-text-muted);
      .material-symbols-outlined { font-size: 20px; color: var(--hw-accent); flex-shrink: 0; }
    }
  `,
})
export class ContaPage implements OnInit {
  private conta = inject(ContaService);
  private auth = inject(AuthStore);
  private router = inject(Router);
  perfil = signal<MeuPerfil | null>(null);

  ngOnInit(): void {
    void this.conta.me().then((p) => this.perfil.set(p)).catch(() => {});
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}

/** S09 — Meus pedidos com status e link detalhado. */
@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, DatePipe, HwStatusChip, HwSkeleton, HwEmpty, HwButton, BrlPipe],
  template: NAV + `
    <div class="conta-header">
      <h1>Meus Pedidos</h1>
      <span class="subtitulo">Acompanhe o faturamento, expedição e entrega dos seus pedidos</span>
    </div>

    @if (carregando()) {
      <div class="pedidos-lista">
        @for (i of [1,2,3,4]; track i) {
          <hw-skeleton style="height: 72px; border-radius: 12px;" />
        }
      </div>
    } @else if (pedidos()?.itens?.length === 0) {
      <hw-empty
        titulo="Nenhum pedido realizado"
        descricao="Você ainda não enviou pedidos pelo portal. Navegue pelo catálogo da sua empresa para iniciar."
        icone="inventory_2"
      >
        <a routerLink="/" hwButton size="lg">Ver catálogo de produtos</a>
      </hw-empty>
    } @else {
      <ul class="pedidos-lista">
        @for (p of pedidos()!.itens; track p.id) {
          <li>
            <a [routerLink]="['/conta/pedidos', p.id]" class="pedido-card">
              <div class="pedido-num-col">
                <span class="pedido-label">Pedido</span>
                <span class="pedido-num hw-numeric">{{ p.numero }}</span>
              </div>

              <div class="pedido-status-col">
                <hw-status-chip [status]="p.status" />
              </div>

              <div class="pedido-data-col">
                <span class="pedido-label">Data</span>
                <span class="pedido-data">{{ p.created_at | date: 'dd/MM/yyyy HH:mm' }}</span>
              </div>

              <div class="pedido-total-col">
                <span class="pedido-label">Total</span>
                <span class="pedido-total hw-numeric">{{ p.total | brl }}</span>
              </div>

              <span class="material-symbols-outlined seta-abrir" aria-hidden="true">chevron_right</span>
            </a>
          </li>
        }
      </ul>
    }
  `,
  styles: NAV_STYLES + `
    .conta-header {
      margin-bottom: var(--hw-space-6);
      h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
      .subtitulo { font-size: 13.5px; color: var(--hw-text-muted); }
    }
    .pedidos-lista {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
    }
    .pedido-card {
      display: flex;
      align-items: center;
      gap: var(--hw-space-6);
      padding: var(--hw-space-4) var(--hw-space-5);
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      color: var(--hw-text);
      text-decoration: none;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);

      &:hover {
        border-color: var(--hw-border-input);
        box-shadow: var(--hw-shadow-card);
        transform: translateY(-1px);
        text-decoration: none;
      }
    }
    .pedido-num-col {
      display: flex;
      flex-direction: column;
      min-width: 120px;
    }
    .pedido-label {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--hw-text-faint);
    }
    .pedido-num {
      font-family: var(--hw-font-mono);
      font-size: 14px;
      font-weight: 700;
      color: var(--hw-text);
    }
    .pedido-status-col {
      flex: 1;
    }
    .pedido-data-col {
      display: flex;
      flex-direction: column;
    }
    .pedido-data {
      font-size: 13px;
      color: var(--hw-text-muted);
    }
    .pedido-total-col {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      min-width: 100px;
    }
    .pedido-total {
      font-size: 15px;
      font-weight: 700;
      color: var(--hw-text);
    }
    .seta-abrir {
      font-size: 20px;
      color: var(--hw-text-muted);
    }

    @media (max-width: 640px) {
      .pedido-card {
        flex-wrap: wrap;
        gap: var(--hw-space-3);
      }
      .pedido-status-col {
        order: 2;
        width: 100%;
      }
    }
  `,
})
export class PedidosPage implements OnInit {
  private conta = inject(ContaService);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private rt = inject(RealtimeService);
  pedidos = signal<Pagina<PedidoResumo> | null>(null);
  carregando = signal(true);

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo.startsWith('pedido.')) this.carregar();
    });
  }

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.conta.pedidos()
      .then((p) => this.pedidos.set(p))
      .catch(() => this.pedidos.set(null))
      .finally(() => this.carregando.set(false));
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}

/** S10 — Detalhe do pedido com visualizador de progresso e tabela de itens. */
@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, HwSkeleton, HwEmpty, HwStatusChip, BrlPipe, QtyPipe],
  template: NAV + `
    @if (carregando()) {
      <hw-skeleton style="height: 480px; border-radius: 16px;" />
    } @else if (!pedido()) {
      <hw-empty
        titulo="Pedido não encontrado"
        descricao="Verifique o número do pedido ou fale com seu vendedor."
        icone="help_outline"
      >
        <a routerLink="/conta/pedidos" class="link-voltar">Voltar para meus pedidos</a>
      </hw-empty>
    } @else {
      @let p = pedido()!;
      <div class="detalhe-topo">
        <a routerLink="/conta/pedidos" class="link-voltar">
          <span class="material-symbols-outlined">arrow_back</span>
          <span>Voltar aos pedidos</span>
        </a>
        <div class="pedido-id-row">
          <h1>Pedido {{ p.numero }}</h1>
          <hw-status-chip [status]="p.status" />
        </div>
      </div>

      <!-- Stepper de Progresso do Pedido -->
      <div class="stepper-box">
        <ol class="stepper" aria-label="Progresso do status">
          @for (etapa of etapas; track etapa; let i = $index) {
            <li [class]="classeEtapa(i)" [attr.aria-current]="i === indiceAtual(p.status) ? 'step' : null">
              <span class="etapa-circulo">
                @if (isFeita(i)) {
                  <span class="material-symbols-outlined step-check">check</span>
                } @else {
                  <span>{{ i + 1 }}</span>
                }
              </span>
              <span class="etapa-nome">{{ etapa }}</span>
            </li>
          }
        </ol>
      </div>

      @if (p.status === 'cancelado') {
        <div class="alerta-cancelado" role="status">
          <span class="material-symbols-outlined">cancel</span>
          <span>Este pedido foi cancelado no sistema comercial.</span>
        </div>
      }

      <!-- Tabela de Itens Faturados -->
      <section class="card-secao">
        <h2>Itens do Pedido</h2>
        <div class="tabela-wrap">
          <table class="tabela-itens">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Qtd</th>
                <th>Preço Unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              @for (i of p.itens; track i.sku) {
                <tr>
                  <td class="nome-td">{{ i.descricao }}</td>
                  <td class="hw-numeric sku-td">{{ i.sku }}</td>
                  <td class="hw-numeric">{{ i.quantidade | qty }}</td>
                  <td class="hw-numeric">{{ i.preco_unitario | brl }}</td>
                  <td class="hw-numeric total-td">{{ i.total | brl }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- Grade de Totais e Logística -->
      <div class="detalhes-grid">
        <section class="card-secao">
          <h2>Informações de Entrega</h2>
          <div class="endereco-texto">
            <span class="material-symbols-outlined end-icon">location_on</span>
            <div class="end-corpo">
              <strong>{{ p.endereco_entrega.logradouro }}, {{ p.endereco_entrega.numero }}</strong>
              <span>{{ p.endereco_entrega.bairro }} — {{ p.endereco_entrega.cidade }}/{{ p.endereco_entrega.uf }}</span>
              <span>CEP: {{ p.endereco_entrega.cep }}</span>
            </div>
          </div>
        </section>

        <section class="card-secao">
          <h2>Totais e Condição</h2>
          <div class="totais-linhas">
            <div class="tot-linha"><span>Subtotal dos itens</span><span class="hw-numeric">{{ p.subtotal | brl }}</span></div>
            <div class="tot-linha"><span>Frete</span><span class="hw-numeric">{{ p.frete | brl }}</span></div>
            <div class="divisor"></div>
            <div class="tot-linha grand"><span>Total Faturado</span><strong class="hw-numeric total-destaque">{{ p.total | brl }}</strong></div>
            @if (p.condicao_pagamento) {
              <div class="condicao-nota">
                <span class="material-symbols-outlined">payments</span>
                <span>Condição: {{ p.condicao_pagamento }}</span>
              </div>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: NAV_STYLES + `
    .detalhe-topo {
      margin-bottom: var(--hw-space-6);
    }
    .link-voltar {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: var(--hw-text-muted);
      text-decoration: none;
      margin-bottom: var(--hw-space-2);
      &:hover { color: var(--hw-accent); }
      .material-symbols-outlined { font-size: 16px; }
    }
    .pedido-id-row {
      display: flex;
      align-items: center;
      gap: var(--hw-space-3);
      h1 { font-size: 24px; font-weight: 800; margin: 0; }
    }

    /* Stepper Minimalista */
    .stepper-box {
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      padding: var(--hw-space-6) var(--hw-space-4);
      margin-bottom: var(--hw-space-6);
    }
    .stepper {
      display: flex;
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .stepper li {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      position: relative;
      color: var(--hw-text-muted);

      &:not(:last-child)::after {
        content: '';
        position: absolute;
        top: 14px;
        left: calc(50% + 16px);
        right: calc(-50% + 16px);
        height: 2px;
        background: var(--hw-border);
        z-index: 1;
      }

      &.feita:not(:last-child)::after {
        background: var(--hw-success);
      }
    }
    .etapa-circulo {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid var(--hw-border);
      background: var(--hw-surface-raised);
      font-size: 12px;
      font-weight: 600;
      display: grid;
      place-items: center;
      z-index: 2;
      color: var(--hw-text-muted);
    }
    .stepper li.feita .etapa-circulo {
      background: var(--hw-success);
      border-color: var(--hw-success);
      color: #ffffff;
    }
    .stepper li.atual .etapa-circulo {
      background: var(--hw-accent);
      border-color: var(--hw-accent);
      color: #ffffff;
      box-shadow: 0 0 0 3px var(--hw-accent-tint);
    }
    .step-check { font-size: 16px; }
    .etapa-nome {
      font-size: 12px;
      font-weight: 500;
      text-align: center;
    }
    .stepper li.atual .etapa-nome {
      color: var(--hw-accent);
      font-weight: 700;
    }

    .alerta-cancelado {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: var(--hw-space-4);
      background: var(--hw-chip-danger-bg);
      border-radius: var(--hw-radius-sm);
      color: var(--hw-danger);
      font-size: 13.5px;
      margin-bottom: var(--hw-space-6);
    }

    .card-secao {
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      padding: var(--hw-space-5);
      margin-bottom: var(--hw-space-6);
      h2 { font-size: 16px; font-weight: 700; margin: 0 0 var(--hw-space-4); }
    }

    .tabela-wrap {
      overflow-x: auto;
    }
    .tabela-itens {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
      th {
        text-align: left;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--hw-text-muted);
        padding: 8px 12px;
        border-bottom: 1px solid var(--hw-border);
      }
      td {
        padding: 12px;
        border-bottom: 1px solid var(--hw-border-subtle);
      }
    }
    .nome-td { font-weight: 500; }
    .sku-td { font-family: var(--hw-font-mono); font-size: 12px; color: var(--hw-text-muted); }
    .total-td { font-weight: 700; }

    .detalhes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: var(--hw-space-6);
    }

    .endereco-texto {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      .end-icon { font-size: 22px; color: var(--hw-accent); margin-top: 2px; }
      .end-corpo { display: flex; flex-direction: column; gap: 3px; font-size: 13.5px; color: var(--hw-text-muted); }
      strong { color: var(--hw-text); }
    }

    .totais-linhas {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-2);
    }
    .tot-linha {
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
      color: var(--hw-text);
      &.grand { font-size: 16px; font-weight: 600; }
    }
    .total-destaque {
      font-size: 20px;
      color: var(--hw-accent);
      font-weight: 800;
    }
    .divisor { height: 1px; background: var(--hw-border); margin: var(--hw-space-2) 0; }
    .condicao-nota {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--hw-text-muted);
      margin-top: var(--hw-space-2);
      .material-symbols-outlined { font-size: 16px; }
    }

    @media (max-width: 640px) {
      .stepper li .etapa-nome { display: none; }
    }
  `,
})
export class PedidoDetalhePage implements OnInit {
  private route = inject(ActivatedRoute);
  private conta = inject(ContaService);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private rt = inject(RealtimeService);
  private id = 0;

  pedido = signal<PedidoDetalhe | null>(null);
  carregando = signal(true);
  etapas = ['Confirmado', 'Em separação', 'Faturado', 'Enviado', 'Entregue'];

  constructor() {
    effect(() => {
      const e = this.rt.ultimo();
      if (e?.tipo === 'pedido.status_alterado' && Number(e.dados['id']) === this.id) {
        this.carregar();
      }
    });
  }

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.carregar();
  }

  private carregar(): void {
    this.conta.pedido(this.id)
      .then((p) => this.pedido.set(p))
      .catch(() => this.pedido.set(null))
      .finally(() => this.carregando.set(false));
  }

  indiceAtual(status: StatusPedido): number {
    const ordem: StatusPedido[] = ['confirmado', 'em_separacao', 'faturado', 'enviado', 'entregue'];
    return ordem.indexOf(status);
  }

  isFeita(i: number): boolean {
    const p = this.pedido();
    if (!p) return false;
    if (p.status === 'concluido') return true;
    const atual = this.indiceAtual(p.status);
    return i < atual;
  }

  classeEtapa(i: number): string {
    const p = this.pedido();
    if (!p || p.status === 'cancelado' || p.status === 'aguardando_pagamento') return '';
    const atual = this.indiceAtual(p.status);
    if (p.status === 'concluido' || i < atual) return 'feita';
    return i === atual ? 'atual' : '';
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}

/** S12 — Trocar senha da conta. */
@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, ReactiveFormsModule, HwButton, HwField],
  template: NAV + `
    <div class="conta-header">
      <h1>Segurança do Acesso</h1>
      <span class="subtitulo">Gerencie sua senha de acesso ao portal corporativo</span>
    </div>

    <form class="cartao-seguranca" [formGroup]="form" (ngSubmit)="trocar()">
      <h2>Alteração de Senha</h2>

      <div class="campos-troca">
        <hw-field
          [control]="form.controls.atual"
          rotulo="Senha Atual"
          id="atual"
          tipo="password"
          autocomplete="current-password"
        />
        <hw-field
          [control]="form.controls.nova"
          rotulo="Nova Senha"
          id="nova"
          tipo="password"
          autocomplete="new-password"
          erro="Mínimo de 8 caracteres"
        />
        <hw-field
          [control]="form.controls.confirma"
          rotulo="Confirmar Nova Senha"
          id="confirma"
          tipo="password"
          autocomplete="new-password"
          erro="As senhas informadas não coincidem"
        />
      </div>

      <button
        hwButton
        size="lg"
        type="submit"
        class="btn-salvar"
        [loading]="enviando()"
        texto="Salvando alterações…"
        [disabled]="form.invalid"
      >
        <span>Atualizar Senha</span>
        <span class="material-symbols-outlined" aria-hidden="true">check</span>
      </button>
    </form>
  `,
  styles: NAV_STYLES + `
    .conta-header {
      margin-bottom: var(--hw-space-6);
      h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
      .subtitulo { font-size: 13.5px; color: var(--hw-text-muted); }
    }
    .cartao-seguranca {
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      padding: var(--hw-space-6);
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-4);
      h2 { font-size: 16px; font-weight: 700; margin: 0; color: var(--hw-text); }
    }
    .campos-troca {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
    }
    .btn-salvar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
    }
  `,
})
export class SegurancaPage implements OnInit {
  private conta = inject(ContaService);
  private auth = inject(AuthStore);
  private router = inject(Router);
  private toast = inject(ToastService);

  enviando = signal(false);
  form = new FormGroup({
    atual: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    nova: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    confirma: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.form.controls.confirma.valueChanges.subscribe(() => {
      const ok = this.form.controls.nova.value === this.form.controls.confirma.value;
      this.form.controls.confirma.setErrors(ok ? null : { confere: true });
    });
  }

  async trocar(): Promise<void> {
    if (this.form.invalid || this.enviando()) return;
    this.enviando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.conta.trocarSenha(v.atual, v.nova);
      this.toast.ok('Senha alterada com sucesso.');
      this.form.reset();
    } catch {
      this.toast.erro('Não foi possível trocar a senha. Confira sua senha atual.');
    } finally {
      this.enviando.set(false);
    }
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
