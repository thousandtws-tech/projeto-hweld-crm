import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { AuthStore } from '../core/auth/auth.store';
import { RealtimeService } from '../core/realtime';
import { BuscaService, CarrinhoService, CatalogoService } from '../core/servicos';
import { NotificacoesService } from '../core/notificacoes';
import { Categoria, Notificacao, SugestaoBusca } from '../core/models';
import { HumanizeNotifPipe } from '../core/pipes';
import { ToastHost } from '../shared/ui/toast';

/** Shell minimalista profissional B2B com padrão de loja virtual de alta conversão. */
@Component({
  selector: 'hw-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
    DatePipe,
    HumanizeNotifPipe,
    ToastHost,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  template: `
    <header class="topo">
      <div class="topo-container">
        <!-- Logo Brand HWeld -->
        <a routerLink="/" class="logo" aria-label="HWeld Portal B2B - Página inicial">
          <span class="logo-txt">HWELD</span>
          <span class="logo-tag">B2B</span>
        </a>

        <!-- Categorias Dropdown -->
        <nav class="cats" aria-label="Categorias">
          <button
            type="button"
            class="cats-trigger"
            [matMenuTriggerFor]="menuCategorias"
            aria-label="Abrir menu de categorias"
          >
            <span class="material-symbols-outlined icone-grade" aria-hidden="true">grid_view</span>
            <span class="cats-label">Categorias</span>
            <span class="material-symbols-outlined icone-seta" aria-hidden="true">expand_more</span>
          </button>

          <mat-menu #menuCategorias="matMenu" class="mega-menu-panel" xPosition="after">
            <div class="mega-conteudo" (click)="$event.stopPropagation()">
              @for (cat of categoriasRaiz(); track cat.id) {
                <div class="grupo-cat">
                  <a [routerLink]="['/c', cat.id + '-' + cat.slug]" class="cat-pai">
                    {{ cat.nome }}
                  </a>
                  <div class="subs">
                    @for (sub of filhasDe(cat.id); track sub.id) {
                      <a class="cat-filha" [routerLink]="['/c', sub.id + '-' + sub.slug]">
                        {{ sub.nome }}
                      </a>
                    }
                  </div>
                </div>
              }
              @if (categoriasRaiz().length === 0) {
                <span class="mega-vazio">Nenhuma categoria disponível no momento.</span>
              }
            </div>
          </mat-menu>
        </nav>

        <!-- Enviar para: CEP Popover (Desktop) -->
        <button
          type="button"
          class="header-item-btn cep-btn cep-desktop-btn"
          [matMenuTriggerFor]="menuCep"
          aria-label="Informar CEP de entrega"
        >
          <img src="assets/icons/icon-map-pin.png" alt="" class="header-custom-icone" aria-hidden="true" />
          <div class="header-item-txt">
            <span class="header-item-sub">Enviar para:</span>
            <strong class="header-item-tit">{{ cep() ? cep() : 'Informe o CEP' }}</strong>
          </div>
        </button>

        <mat-menu #menuCep="matMenu" class="cep-menu-panel" xPosition="after">
          <div class="cep-popover-card" (click)="$event.stopPropagation()">
            <div class="cep-popover-header">
              <img src="assets/icons/icon-map-pin.png" alt="" class="cep-pin-custom" aria-hidden="true" />
              <div class="cep-popover-titulos">
                <strong>Onde quer receber suas compras?</strong>
                <p>Informe o CEP para consultar prazos de entrega e frete.</p>
              </div>
            </div>
            <div class="cep-form-row">
              <input
                type="text"
                class="cep-input hw-numeric"
                placeholder="00000-000"
                maxlength="9"
                [value]="cep()"
                #inputCep
                (keydown.enter)="aplicarCep(inputCep.value)"
              />
              <button type="button" class="btn-salvar-cep" (click)="aplicarCep(inputCep.value)">
                Salvar
              </button>
            </div>
            @if (cep()) {
              <div class="cep-status-bar">
                <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
                <span>CEP ativo: <strong>{{ cep() }}</strong></span>
              </div>
            }
          </div>
        </mat-menu>

        <!-- Busca Instantânea de Alta Conversão -->
        <div class="busca-wrap" role="search">
          <div class="busca-box" [class.com-foco]="buscaFoco()">
            <input
              type="search"
              [formControl]="buscaCtrl"
              placeholder="Busque por produtos, marcas ou categorias…"
              aria-label="Buscar produtos no catálogo"
              (focus)="buscaFoco.set(true)"
              (blur)="onBlurBusca()"
              (keydown.enter)="buscar()"
            />
            @if (buscaCtrl.value) {
              <button
                type="button"
                class="limpar-busca"
                aria-label="Limpar busca"
                (click)="buscaCtrl.setValue(''); sugestoes.set([])"
                title="Limpar busca"
              >
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            }
            <button
              type="button"
              class="btn-busca-acao"
              (click)="buscar()"
              aria-label="Buscar no catálogo"
              title="Buscar"
            >
              <span class="material-symbols-outlined" aria-hidden="true">search</span>
            </button>
          </div>

          <!-- Sugestões Instantâneas -->
          @if (sugestoes().length > 0) {
            <div class="sugestoes-flyout" role="listbox">
              <div class="flyout-topo">
                <span>Sugestões no Catálogo</span>
                <span class="flyout-contagem">{{ sugestoes().length }} encontrados</span>
              </div>
              <ul class="flyout-lista">
                @for (s of sugestoes(); track s.sku) {
                  <li
                    role="option"
                    (mousedown)="buscar(s.nome)"
                    (keydown.enter)="buscar(s.nome)"
                    tabindex="0"
                  >
                    <span class="material-symbols-outlined flyout-icone" aria-hidden="true">search</span>
                    <span class="sugestao-nome">{{ s.nome }}</span>
                    <span class="sugestao-sku">{{ s.sku }}</span>
                    <span class="material-symbols-outlined flyout-seta" aria-hidden="true">north_west</span>
                  </li>
                }
              </ul>
              <div class="flyout-rodape">
                <span>Pressione <strong>Enter</strong> para ver todos os resultados</span>
              </div>
            </div>
          }
        </div>
 
        <!-- Faixa Slim de Entrega / CEP (Mobile <= 768px / 430px) -->
        <button
          type="button"
          class="cep-mobile-strip"
          [matMenuTriggerFor]="menuCep"
          aria-label="Informar CEP de entrega"
        >
          <div class="cep-mobile-esq">
            <img src="assets/icons/icon-map-pin.png" alt="" class="cep-mobile-custom-pin" aria-hidden="true" />
            <span class="cep-mobile-label">Enviar para:</span>
            <strong class="cep-mobile-val hw-numeric">{{ cep() ? cep() : 'Informe seu CEP' }}</strong>
          </div>
          <span class="material-symbols-outlined cep-mobile-seta" aria-hidden="true">chevron_right</span>
        </button>

        <!-- Ações do Cabeçalho Padrão Loja Virtual -->
        <div class="acoes">
          <!-- Televendas / Contato B2B -->
          <a href="tel:1135089979" class="header-item-btn televendas-btn" aria-label="Televendas HWeld">
            <span class="material-symbols-outlined header-item-icone" aria-hidden="true">headset_mic</span>
            <div class="header-item-txt">
              <span class="header-item-sub">Televendas</span>
              <strong class="header-item-tit hw-numeric">(11) 3508-9979</strong>
            </div>
          </a>

          <!-- Meus Pedidos -->
          <a routerLink="/conta/pedidos" class="header-item-btn pedidos-btn" aria-label="Meus Pedidos">
            <img src="assets/icons/icon-cart-check.png" alt="" class="header-custom-icone" aria-hidden="true" />
            <div class="header-item-txt">
              <span class="header-item-sub">Meus</span>
              <strong class="header-item-tit">Pedidos</strong>
            </div>
          </a>

          <!-- Identificação / Conta do Usuário -->
          @if (auth.perfil(); as p) {
            <button
              type="button"
              class="header-item-btn conta-btn"
              [matMenuTriggerFor]="menuConta"
              aria-label="Minha Conta"
            >
              <div class="avatar-iniciais" aria-hidden="true">
                {{ obterIniciais(p.contato.nome) }}
              </div>
              <div class="header-item-txt">
                <span class="header-item-sub">Olá, {{ primeiroNome(p.contato.nome) }}</span>
                <strong class="header-item-tit">Minha Conta</strong>
              </div>
              <span class="material-symbols-outlined seta-sub" aria-hidden="true">expand_more</span>
            </button>

            <mat-menu #menuConta="matMenu" class="conta-menu-panel" xPosition="before">
              <div class="conta-header-minimal" (click)="$event.stopPropagation()">
                <div class="conta-perfil-linha">
                  <div class="conta-avatar-min" aria-hidden="true">{{ obterIniciais(p.contato.nome) }}</div>
                  <div class="conta-perfil-texto">
                    <span class="conta-nome" [title]="p.contato.nome">{{ p.contato.nome }}</span>
                    <span class="conta-empresa" [title]="p.empresa.nome_fantasia ?? p.empresa.razao_social">
                      {{ p.empresa.nome_fantasia ?? p.empresa.razao_social }}
                    </span>
                  </div>
                </div>
                @if (p.tabela_preco?.nome || p.empresa.cnpj) {
                  <div class="conta-meta-linha">
                    @if (p.tabela_preco?.nome) {
                      <span class="conta-tabela">{{ p.tabela_preco?.nome }}</span>
                    }
                    @if (p.empresa.cnpj) {
                      <span class="conta-cnpj">{{ p.empresa.cnpj }}</span>
                    }
                  </div>
                }
              </div>

              <mat-divider />

              <a mat-menu-item routerLink="/conta">
                <span class="material-symbols-outlined">person</span>
                <span>Minha conta</span>
              </a>
              <a mat-menu-item routerLink="/conta/pedidos">
                <span class="material-symbols-outlined">receipt_long</span>
                <span>Meus pedidos</span>
              </a>
              <a mat-menu-item routerLink="/conta/seguranca">
                <span class="material-symbols-outlined">lock</span>
                <span>Segurança</span>
              </a>

              <mat-divider />

              <button mat-menu-item class="item-sair" (click)="sair()">
                <span class="material-symbols-outlined">logout</span>
                <span>Sair da conta</span>
              </button>
            </mat-menu>
          } @else {
            <a routerLink="/login" class="header-item-btn conta-btn" aria-label="Entrar ou cadastrar-se">
              <img src="assets/icons/icon-user-account.png" alt="" class="header-custom-icone" aria-hidden="true" />
              <div class="header-item-txt">
                <span class="header-item-sub">Entre ou</span>
                <strong class="header-item-tit">Cadastre-se</strong>
              </div>
            </a>
          }

          <!-- Sino de Notificações -->
          @if (auth.autenticado()) {
            <button
              type="button"
              class="icone-topo-btn"
              [matMenuTriggerFor]="menuNotifs"
              matTooltip="Notificações"
              aria-label="Notificações do portal"
            >
              <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
              @if (notifs.naoLidas() > 0) {
                <span class="badge-contador hw-numeric">
                  {{ notifs.naoLidas() > 99 ? '99+' : notifs.naoLidas() }}
                </span>
              }
            </button>

            <mat-menu #menuNotifs="matMenu" class="notifs-menu-panel" xPosition="before">
              <div class="notifs-card" (click)="$event.stopPropagation()">
                <div class="notifs-header">
                  <div class="notifs-title">
                    <strong>Notificações</strong>
                    @if (notifs.naoLidas() > 0) {
                      <span class="notifs-counter">{{ notifs.naoLidas() }} novas</span>
                    }
                  </div>
                  @if (notifs.naoLidas() > 0) {
                    <button
                      type="button"
                      class="btn-marcar-todas"
                      (click)="notifs.marcarTodas()"
                      title="Marcar todas as notificações como lidas"
                    >
                      <span class="material-symbols-outlined">done_all</span>
                      <span>Marcar lidas</span>
                    </button>
                  }
                </div>

                @if (notifs.itens().length === 0) {
                  <div class="notifs-vazio">
                    <div class="vazio-circulo" aria-hidden="true">
                      <span class="material-symbols-outlined">notifications_none</span>
                    </div>
                    <strong>Tudo em dia!</strong>
                    <p>Você não possui nenhuma notificação pendente no momento.</p>
                  </div>
                } @else {
                  <div class="notifs-lista">
                    @for (n of notifs.itens(); track n.id) {
                      <button
                        type="button"
                        class="notif-row"
                        [class.nao-lida]="!n.lida_em"
                        (click)="abrirNotif(n)"
                      >
                        <div class="notif-icone-box">
                          <span class="material-symbols-outlined">{{ getIconeNotif(n) }}</span>
                        </div>
                        <div class="notif-corpo">
                          <div class="notif-linha-topo">
                            <strong class="notif-tit">{{ n.titulo }}</strong>
                            <span class="notif-data">{{ n.created_at | date: 'dd/MM · HH:mm' }}</span>
                          </div>
                          <p class="notif-msg">{{ n.mensagem | humanizeNotif }}</p>
                        </div>
                        @if (!n.lida_em) {
                          <span class="notif-dot" title="Notificação não lida" aria-hidden="true"></span>
                        }
                      </button>
                    }
                  </div>
                }

                <div class="notifs-footer">
                  <a routerLink="/conta/pedidos" class="link-ver-pedidos">
                    <span>Acompanhar todos os pedidos</span>
                    <span class="material-symbols-outlined">arrow_forward</span>
                  </a>
                </div>
              </div>
            </mat-menu>
          }

          <!-- Botão do Carrinho -->
          <a
            routerLink="/carrinho"
            class="header-item-btn carrinho-btn"
            matTooltip="Ver carrinho de compras"
            aria-label="Carrinho de compras"
          >
            <div class="icone-carrinho-wrap">
              <span class="material-symbols-outlined header-item-icone" aria-hidden="true">shopping_cart</span>
              @if (carrinho.totalItens() > 0) {
                <span class="badge-contador hw-numeric">
                  {{ carrinho.totalItens() > 99 ? '99+' : carrinho.totalItens() }}
                </span>
              }
            </div>
            <div class="header-item-txt header-carrinho-txt">
              <span class="header-item-sub">Meu</span>
              <strong class="header-item-tit">Carrinho</strong>
            </div>
          </a>
        </div>
      </div>
    </header>

    <!-- Conteúdo Principal -->
    <main class="conteudo">
      <router-outlet />
    </main>

    <!-- Rodapé Minimalista & Profissional Padrão Loja Virtual -->
    <footer class="rodape">
      <div class="rodape-container">
        <!-- 1. Grid Principal: 4 Colunas Estruturadas -->
        <div class="rodape-grid">
          <!-- Coluna 1: Institucional -->
          <div class="rodape-col">
            <h4 class="rodape-tit">Institucional</h4>
            <ul class="rodape-links">
              <li><a routerLink="/institucional/atendimento"><span class="bullet" aria-hidden="true">▸</span> Atendimento ao Cliente</a></li>
              <li><a routerLink="/institucional/faq"><span class="bullet" aria-hidden="true">▸</span> Central de Ajuda & FAQ</a></li>
              <li><a routerLink="/institucional/trocas-e-devolucoes"><span class="bullet" aria-hidden="true">▸</span> Trocas e Devoluções</a></li>
              <li><a routerLink="/conta"><span class="bullet" aria-hidden="true">▸</span> Minha Conta</a></li>
              <li><a routerLink="/conta/pedidos"><span class="bullet" aria-hidden="true">▸</span> Acompanhe seus pedidos</a></li>
              <li><a routerLink="/carrinho"><span class="bullet" aria-hidden="true">▸</span> Como Comprar no Portal PJ</a></li>
              <li><a routerLink="/institucional/faq"><span class="bullet" aria-hidden="true">▸</span> Prazos e Condições de Entrega</a></li>
              <li><a routerLink="/institucional/faq"><span class="bullet" aria-hidden="true">▸</span> Formas de Pagamento & Faturamento</a></li>
              <li><a routerLink="/institucional/atendimento"><span class="bullet" aria-hidden="true">▸</span> Blog & Engenharia de Solda</a></li>
              <li><a routerLink="/institucional/privacidade"><span class="bullet" aria-hidden="true">▸</span> LGPD & Privacidade</a></li>
              <li><a routerLink="/institucional/garantia"><span class="bullet" aria-hidden="true">▸</span> Garantia Técnica de Equipamentos</a></li>
            </ul>
          </div>

          <!-- Coluna 2: Televendas & Vendas Corporativas -->
          <div class="rodape-col">
            <h4 class="rodape-tit">Televendas</h4>
            <div class="bloco-contato">
              <span class="contato-rotulo">Todas as localidades</span>
              <a href="tel:1135089979" class="contato-link">
                <span class="material-symbols-outlined contato-icon" aria-hidden="true">call</span>
                <strong class="hw-numeric">(11) 3508-9979</strong>
              </a>
            </div>

            <h4 class="rodape-tit mt-bloco">Vendas corporativas</h4>
            <div class="bloco-contato">
              <span class="contato-rotulo">Grandes Contas & Cotações Especiais</span>
              <a href="tel:1131856786" class="contato-link">
                <span class="material-symbols-outlined contato-icon" aria-hidden="true">call</span>
                <strong class="hw-numeric">(11) 3185-6786</strong>
              </a>
              <a href="mailto:corporativo@hweld.com.br" class="contato-link email-link">
                <span class="material-symbols-outlined contato-icon" aria-hidden="true">mail</span>
                <span>corporativo&#64;hweld.com.br</span>
              </a>
              <div class="contato-horario">
                <span class="material-symbols-outlined icone-relogio" aria-hidden="true">schedule</span>
                <span>Seg. a Sex. das 08h às 18h</span>
              </div>
            </div>
          </div>

          <!-- Coluna 3 & 4: Categorias Principais (Grid Duplo) -->
          <div class="rodape-col col-dupla">
            <h4 class="rodape-tit">Veja todas as categorias</h4>
            <div class="subcolunas-cat">
              <ul class="rodape-links">
                <li><a routerLink="/busca" [queryParams]="{ q: 'maquina' }"><span class="bullet" aria-hidden="true">▸</span> Máquinas e Inversoras de Solda</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'mig' }"><span class="bullet" aria-hidden="true">▸</span> Equipamentos MIG / MAG</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'tig' }"><span class="bullet" aria-hidden="true">▸</span> Inversoras TIG Industriais</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'plasma' }"><span class="bullet" aria-hidden="true">▸</span> Corte Plasma & CNC</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'arame' }"><span class="bullet" aria-hidden="true">▸</span> Arames Tubulares e Sólidos</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'eletrodo' }"><span class="bullet" aria-hidden="true">▸</span> Eletrodos Revestidos</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'tocha' }"><span class="bullet" aria-hidden="true">▸</span> Tochas MIG, TIG e Plasma</a></li>
              </ul>
              <ul class="rodape-links">
                <li><a routerLink="/busca" [queryParams]="{ q: 'regulador' }"><span class="bullet" aria-hidden="true">▸</span> Reguladores e Fluxômetros</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'mascara' }"><span class="bullet" aria-hidden="true">▸</span> EPIs e Máscaras de Autoescurecimento</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'abrasivo' }"><span class="bullet" aria-hidden="true">▸</span> Abrasivos e Discos de Desbaste</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'compressor' }"><span class="bullet" aria-hidden="true">▸</span> Compressores e Rede Pneumática</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'pecas' }"><span class="bullet" aria-hidden="true">▸</span> Consumíveis & Bicos de Contato</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'quimico' }"><span class="bullet" aria-hidden="true">▸</span> Anti-respingo e Químicos</a></li>
                <li><a routerLink="/busca" [queryParams]="{ q: 'automacao' }"><span class="bullet" aria-hidden="true">▸</span> Automação e Posicionadores</a></li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 2. Seção SEO: Termos Mais Procurados & Navegue pelas Marcas -->
        <div class="rodape-seo">
          <div class="seo-bloco">
            <strong class="seo-tit">Termos mais procurados</strong>
            <p class="seo-termos">
              <a routerLink="/busca" [queryParams]="{ q: 'inversora de solda' }">inversora de solda</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'arame mig 0.8mm' }">arame mig 0.8mm</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'tocha tig refrigerada' }">tocha tig refrigerada</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'mascara de solda automatica' }">máscara de solda automática</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'maquina mig sem gas' }">máquina mig sem gás</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'eletrodo e6013' }">eletrodo e6013</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'regulador de gas argonio' }">regulador de gás argônio</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'bico de contato m6' }">bico de contato m6</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'cabo terra e alicate' }">cabo terra e alicate</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'disco de corte fino' }">disco de corte fino</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'compressor de ar industrial' }">compressor de ar industrial</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'avental de raspa' }">avental de raspa</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'tocha plasma' }">tocha plasma</a> ·
              <a routerLink="/busca" [queryParams]="{ q: 'consumiveis de solda' }">consumíveis de solda</a>
            </p>
          </div>

          <div class="seo-bloco marcas-bloco">
            <strong class="marcas-tit">Navegue pelas Marcas:</strong>
            <div class="marcas-alfabeto">
              @for (letra of alfabeto; track letra) {
                <a [routerLink]="['/busca']" [queryParams]="{ q: letra }" class="letra-link">{{ letra }}</a>
              }
            </div>
          </div>
        </div>

        <mat-divider />

        <!-- 3. Barra Inferior de Compliance, Dados Cadastrais e Certificações -->
        <div class="rodape-bottom">
          <!-- Links Rápidos Horizontais -->
          <div class="bottom-links-row">
            <a routerLink="/institucional/atendimento">Atendimento</a>
            <span class="sep">·</span>
            <a routerLink="/institucional/faq">Central de ajuda</a>
            <span class="sep">·</span>
            <a routerLink="/institucional/trocas-e-devolucoes">Troca e Devolução</a>
            <span class="sep">·</span>
            <a routerLink="/institucional/atendimento">Quem somos</a>
            <span class="sep">·</span>
            <a routerLink="/institucional/privacidade">Segurança & LGPD</a>
            <span class="sep">·</span>
            <a routerLink="/institucional/garantia">Garantia Técnica</a>
          </div>

          <div class="bottom-content-grid">
            <!-- Dados Cadastrais & Empresa -->
            <div class="dados-legais">
              <p class="aviso-preco">
                Em caso de divergência de preços no portal, o valor válido é o da finalização no Carrinho de Compras.
              </p>
              <p class="empresa-info">
                Razão Social: HWeld Tecnologia em Soldagem S.A. · CNPJ: 12.345.678/0001-90 · IE: 123.456.789.110
              </p>
              <p class="empresa-endereco">
                Matriz: Av. Industrial, 1500 - Distrito Industrial - São Paulo/SP - CEP 01310-100
              </p>

              <div class="badges-empresa">
                <span class="badge-br">
                  <span class="bandeira-emoji" aria-hidden="true">🇧🇷</span>
                  <span>EMPRESA 100% BRASILEIRA</span>
                </span>
                <div class="redes-sociais" aria-label="Redes sociais oficiais">
                  <a href="https://linkedin.com" target="_blank" rel="noopener" class="rede-btn" title="LinkedIn"><span class="rede-txt">in</span></a>
                  <a href="https://youtube.com" target="_blank" rel="noopener" class="rede-btn" title="YouTube"><span class="rede-txt">yt</span></a>
                  <a href="https://instagram.com" target="_blank" rel="noopener" class="rede-btn rede-btn-ig" title="Instagram"><img src="assets/icons/icon-instagram.png" alt="Instagram" class="rede-custom-img" /></a>
                  <a href="https://wa.me/551135089979" target="_blank" rel="noopener" class="rede-btn" title="WhatsApp"><span class="rede-txt">wa</span></a>
                </div>
              </div>
            </div>

            <!-- Certificados & Selos de Confiança -->
            <div class="selos-col">
              <span class="selos-titulo">CERTIFICADOS & SEGURANÇA</span>
              <div class="selos-grid">
                <div class="selo-card">
                  <span class="material-symbols-outlined selo-icon" aria-hidden="true">verified_user</span>
                  <div class="selo-info">
                    <strong>Site Seguro</strong>
                    <span>Criptografia 256-bit</span>
                  </div>
                </div>

                <div class="selo-card">
                  <span class="material-symbols-outlined selo-icon" aria-hidden="true">workspace_premium</span>
                  <div class="selo-info">
                    <strong>ISO 9001</strong>
                    <span>Qualidade Certificada</span>
                  </div>
                </div>

                <div class="selo-card">
                  <span class="material-symbols-outlined selo-icon" aria-hidden="true">thumb_up</span>
                  <div class="selo-info">
                    <strong>Reclame Aqui</strong>
                    <span>Empresa Verificada</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Copyright Final -->
          <div class="copyright-row">
            <span>Copyright © 2020-2026 HWeld Tecnologia em Soldagem S.A. - Todos os direitos reservados.</span>
          </div>
        </div>
      </div>
    </footer>
 
    <!-- Barra de Navegação Inferior Mobile Fixa (<= 768px / 430x932) -->
    <nav class="mobile-bottom-nav" aria-label="Navegação rápida mobile">
      <a
        routerLink="/"
        routerLinkActive="ativo"
        [routerLinkActiveOptions]="{ exact: true }"
        class="mobile-nav-item"
        aria-label="Ir para a página inicial"
      >
        <span class="material-symbols-outlined" aria-hidden="true">home</span>
        <span>Início</span>
      </a>

      <button
        type="button"
        class="mobile-nav-item"
        [matMenuTriggerFor]="menuCategorias"
        aria-label="Abrir menu de categorias"
      >
        <span class="material-symbols-outlined" aria-hidden="true">grid_view</span>
        <span>Categorias</span>
      </button>

      <a
        routerLink="/conta/pedidos"
        routerLinkActive="ativo"
        class="mobile-nav-item"
        aria-label="Ver meus pedidos"
      >
        <img src="assets/icons/icon-cart-check.png" alt="" class="mob-custom-icone" aria-hidden="true" />
        <span>Pedidos</span>
      </a>

      <a
        [routerLink]="auth.autenticado() ? '/conta' : '/login'"
        routerLinkActive="ativo"
        class="mobile-nav-item"
        aria-label="Minha conta"
      >
        <img src="assets/icons/icon-user-account.png" alt="" class="mob-custom-icone" aria-hidden="true" />
        <span>Conta</span>
      </a>

      <a
        routerLink="/carrinho"
        routerLinkActive="ativo"
        class="mobile-nav-item item-carrinho-mob"
        aria-label="Abrir carrinho de compras"
      >
        <div class="mob-cart-icone-wrap">
          <span class="material-symbols-outlined" aria-hidden="true">shopping_cart</span>
          @if (carrinho.totalItens() > 0) {
            <span class="badge-contador hw-numeric">
              {{ carrinho.totalItens() > 99 ? '99+' : carrinho.totalItens() }}
            </span>
          }
        </div>
        <span>Carrinho</span>
      </a>
    </nav>

    <!-- Toast Host de Avisos -->
    <hw-toast-host />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--hw-bg);
    }

    /* Cabeçalho Sticky Glassmorphism */
    .topo {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--hw-border);
      height: var(--hw-header-h);
      display: flex;
      align-items: center;
      transition: border-color var(--hw-motion-fast) var(--hw-motion-ease);
    }
    .topo-container {
      width: 100%;
      max-width: var(--hw-content-max);
      margin: 0 auto;
      padding: 0 var(--hw-space-5);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    /* Brand Logo */
    .logo {
      display: flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      user-select: none;
      flex-shrink: 0;
    }
    .logo-txt {
      font-family: var(--hw-font-sans);
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--hw-text);
    }
    .logo-tag {
      font-family: var(--hw-font-mono);
      font-size: 10px;
      font-weight: 700;
      background: var(--hw-accent-tint);
      color: var(--hw-accent);
      border: 1px solid rgba(29, 79, 216, 0.2);
      border-radius: var(--hw-radius-xs);
      padding: 1px 5px;
      letter-spacing: 0.05em;
    }

    /* Categorias Trigger */
    .cats-trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-sm);
      padding: 0 var(--hw-space-3);
      height: 38px;
      font-family: var(--hw-font-sans);
      font-size: 13px;
      font-weight: 500;
      color: var(--hw-text);
      cursor: pointer;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);
      white-space: nowrap;

      &:hover {
        background: var(--hw-surface);
        border-color: var(--hw-border-input);
      }
    }
    .icone-grade {
      font-size: 18px;
      color: var(--hw-text-muted);
    }
    .icone-seta {
      font-size: 18px;
      color: var(--hw-text-muted);
    }

    /* CEP / Enviar para */
    .cep-popover-card {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #ffffff;
    }
    .cep-popover-header {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .cep-pin-icone {
      font-size: 22px;
      color: #0f172a;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .cep-pin-custom {
      width: 22px;
      height: 22px;
      object-fit: contain;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .cep-popover-titulos {
      strong {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--hw-text);
        display: block;
        line-height: 1.3;
      }
      p {
        font-size: 12px;
        color: var(--hw-text-muted);
        margin: 3px 0 0;
        line-height: 1.35;
      }
    }
    .cep-form-row {
      display: flex;
      gap: 8px;
    }
    .cep-input {
      flex: 1;
      height: 38px;
      border: 1px solid var(--hw-border);
      border-radius: 6px;
      padding: 0 12px;
      font-size: 13.5px;
      color: var(--hw-text);
      outline: none;
      background: #ffffff;
      font-family: var(--hw-font-mono, monospace);
      transition: border-color 120ms ease;

      &:focus {
        border-color: #0f172a;
      }
    }
    .btn-salvar-cep {
      height: 38px;
      padding: 0 14px;
      border-radius: 6px;
      background: #0f172a;
      color: #ffffff;
      border: 0;
      font-family: var(--hw-font-sans);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms ease;

      &:hover {
        background: #1e293b;
      }
    }
    .cep-status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #059669;
      background: #ecfdf5;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid #a7f3d0;

      .material-symbols-outlined {
        font-size: 16px;
        color: #059669;
      }
    }

    /* Busca Profissional de Loja Virtual (com Botão Integrado) */
    .busca-wrap {
      position: relative;
      flex: 1 1 auto;
      max-width: 820px;
      min-width: 260px;
    }
    .busca-box {
      display: flex;
      align-items: center;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      height: 44px;
      padding-left: 16px;
      overflow: hidden;
      transition: all 150ms ease;

      &:hover {
        border-color: #94a3b8;
      }

      &.com-foco {
        border-color: #0f172a;
        box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
      }
    }
    .busca-box input {
      flex: 1;
      height: 100%;
      border: 0;
      outline: none;
      background: transparent;
      font-family: var(--hw-font-sans);
      font-size: 14px;
      color: #0f172a;
      padding-right: 8px;
      min-width: 0;

      &::placeholder {
        color: #94a3b8;
      }

      &::-webkit-search-decoration,
      &::-webkit-search-cancel-button,
      &::-webkit-search-results-button,
      &::-webkit-search-results-decoration {
        display: none;
      }
    }
    .limpar-busca {
      border: 0;
      background: #f1f5f9;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      cursor: pointer;
      color: #64748b;
      padding: 0;
      flex-shrink: 0;
      margin-right: 6px;
      transition: all 120ms ease;

      .material-symbols-outlined {
        font-size: 14px;
      }
      &:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
    }
    .btn-busca-acao {
      height: 100%;
      width: 52px;
      background: #0f172a;
      color: #ffffff;
      border: 0;
      display: grid;
      place-items: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 120ms ease;

      .material-symbols-outlined {
        font-size: 20px;
        color: #ffffff;
      }
      &:hover {
        background: #1e293b;
      }
      &:active {
        background: #090d16;
      }
    }

    /* Flyout de Sugestões */
    .sugestoes-flyout {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      right: 0;
      margin: 0;
      padding: 0;
      background: #ffffff;
      border: 1px solid var(--hw-border);
      border-radius: 12px;
      box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.12), 0 0 1px 1px rgba(15, 23, 42, 0.04);
      z-index: 100;
      overflow: hidden;
    }
    .flyout-topo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
      border-bottom: 1px solid var(--hw-border-subtle);
    }
    .flyout-contagem {
      font-size: 10.5px;
      color: #94a3b8;
      font-weight: 500;
    }
    .flyout-lista {
      list-style: none;
      margin: 0;
      padding: 4px 0;
      max-height: 320px;
      overflow-y: auto;
    }
    .flyout-lista li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      cursor: pointer;
      font-size: 13.5px;
      color: #0f172a;
      transition: background 120ms ease;

      &:hover, &:focus {
        background: var(--hw-surface);
        outline: none;

        .flyout-seta {
          color: #0f172a;
          transform: translate(-1px, 1px);
        }
      }
    }
    .flyout-icone {
      font-size: 17px;
      color: #94a3b8;
      flex-shrink: 0;
    }
    .sugestao-nome {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }
    .sugestao-sku {
      font-family: var(--hw-font-mono, monospace);
      font-size: 11px;
      color: #64748b;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 1px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .flyout-seta {
      font-size: 15px;
      color: #cbd5e1;
      flex-shrink: 0;
      transition: transform 120ms ease, color 120ms ease;
    }
    .flyout-rodape {
      padding: 8px 14px;
      font-size: 11px;
      color: #94a3b8;
      background: #f8fafc;
      border-top: 1px solid var(--hw-border-subtle);
      text-align: right;

      strong {
        color: #475569;
      }
    }

    /* Ações */
    .acoes {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      flex-shrink: 0;
    }

    /* Itens Padrão de Loja Virtual (Ícone + 2 Linhas: Subtítulo e Título Forte) */
    .header-item-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: 1px solid transparent;
      padding: 6px 10px;
      border-radius: 8px;
      text-decoration: none;
      cursor: pointer;
      color: var(--hw-text);
      white-space: nowrap;
      transition: background-color 120ms ease, border-color 120ms ease;
      font-family: var(--hw-font-sans);

      &:hover {
        background: var(--hw-surface);
        border-color: var(--hw-border-subtle);

        .header-item-icone {
          color: #0f172a;
        }
        .header-custom-icone {
          transform: scale(1.08);
        }
      }
    }
    .header-item-icone {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: #64748b;
      flex-shrink: 0;
      transition: color 120ms ease;
    }
    .header-custom-icone {
      width: 22px;
      height: 22px;
      object-fit: contain;
      flex-shrink: 0;
      transition: transform 140ms ease;
    }
    .header-item-txt {
      display: flex;
      flex-direction: column;
      text-align: left;
      line-height: 1.15;
    }
    .header-item-sub {
      font-size: 11px;
      font-weight: 450;
      color: #64748b;
    }
    .header-item-tit {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--hw-text);
      letter-spacing: -0.01em;
    }
    .seta-sub {
      font-size: 18px;
      color: #94a3b8;
      margin-left: -2px;
    }

    .conta-btn .avatar-iniciais {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: #0f172a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      display: grid;
      place-items: center;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }

    /* Botão Ícone Circular (Sino de Notificações) */
    .icone-topo-btn {
      position: relative;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid transparent;
      background: transparent;
      color: var(--hw-text);
      display: grid;
      place-items: center;
      cursor: pointer;
      text-decoration: none;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);

      .material-symbols-outlined {
        font-size: 22px;
        color: #64748b;
        transition: color 120ms ease;
      }

      &:hover {
        background: var(--hw-surface);
        .material-symbols-outlined {
          color: #0f172a;
        }
      }
    }

    /* Carrinho & Badge */
    .icone-carrinho-wrap {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;

      .badge-contador {
        top: -6px;
        right: -8px;
      }
    }
    .badge-contador {
      position: absolute;
      top: 3px;
      right: 3px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: var(--hw-radius-pill);
      background: #0f172a;
      color: #ffffff;
      font-family: var(--hw-font-sans);
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      box-shadow: 0 0 0 2px #ffffff;
      pointer-events: none;
    }

    /* -------------------------------------------------------------
       Menu de Notificações Profissional (Zero Scroll Horizontal)
       ------------------------------------------------------------- */
    .notifs-card {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 100%;
      background: #ffffff;
      overflow: hidden;
    }

    .notifs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--hw-border-subtle);
      background: #ffffff;
      flex-shrink: 0;
    }
    .notifs-title {
      display: flex;
      align-items: center;
      gap: 8px;
      strong {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--hw-text);
      }
    }
    .notifs-counter {
      font-size: 11px;
      font-weight: 500;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 1px 7px;
      border-radius: 4px;
    }
    .btn-marcar-todas {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 0;
      color: var(--hw-text-muted);
      font-family: var(--hw-font-sans);
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 4px;
      transition: all 120ms ease;

      .material-symbols-outlined { font-size: 15px; }
      &:hover {
        color: var(--hw-text);
        background: var(--hw-surface);
      }
    }

    .notifs-vazio {
      padding: var(--hw-space-8) var(--hw-space-6);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;

      .vazio-circulo {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        display: grid;
        place-items: center;
        color: #94a3b8;
        margin-bottom: 4px;
        .material-symbols-outlined { font-size: 22px; }
      }
      strong {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--hw-text);
      }
      p {
        font-size: 12px;
        color: var(--hw-text-muted);
        margin: 0;
        max-width: 28ch;
        line-height: 1.4;
      }
    }

    .notifs-lista {
      max-height: 360px;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;

      &::-webkit-scrollbar {
        width: 4px;
      }
      &::-webkit-scrollbar-thumb {
        background-color: #cbd5e1;
        border-radius: 4px;
      }
    }

    .notif-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
      border: 0;
      background: #ffffff;
      padding: 12px 16px;
      text-align: left;
      cursor: pointer;
      border-bottom: 1px solid var(--hw-border-subtle);
      transition: background 120ms ease;
      position: relative;

      &:last-child {
        border-bottom: 0;
      }
      &:hover {
        background: var(--hw-surface);

        .notif-icone-box {
          background: #ffffff;
          border-color: #cbd5e1;
          color: var(--hw-text);
        }
      }
      &.nao-lida {
        background: #fcfcfd;
      }
    }

    .notif-icone-box {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #64748b;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      margin-top: 2px;
      transition: all 120ms ease;

      .material-symbols-outlined {
        font-size: 17px;
        color: inherit;
      }
    }

    .notif-corpo {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .notif-linha-topo {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }
    .notif-tit {
      font-size: 13px;
      font-weight: 600;
      color: var(--hw-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .notif-data {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
      font-family: monospace;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .notif-msg {
      font-size: 12px;
      color: var(--hw-text-muted);
      line-height: 1.4;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .notif-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #0f172a;
      margin-top: 14px;
      flex-shrink: 0;
    }

    .notifs-footer {
      padding: 10px 16px;
      border-top: 1px solid var(--hw-border-subtle);
      background: #ffffff;
      text-align: center;
      flex-shrink: 0;
    }
    .link-ver-pedidos {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 500;
      color: #475569;
      text-decoration: none;
      transition: color 120ms ease;

      .material-symbols-outlined {
        font-size: 16px;
        transition: transform 120ms ease;
      }

      &:hover {
        color: var(--hw-text);

        .material-symbols-outlined {
          transform: translateX(2px);
        }
      }
    }

    /* Mega Menu Categorias */
    .mega-conteudo {
      display: flex;
      gap: var(--hw-space-6);
      padding: var(--hw-space-5);
      min-width: 480px;
      max-height: 65vh;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .grupo-cat {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 160px;
    }
    .cat-pai {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--hw-text);
      padding: 4px 0;
      text-decoration: none;
      &:hover { color: var(--hw-accent); }
    }
    .subs {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cat-filha {
      font-size: 13px;
      color: var(--hw-text-muted);
      padding: 3px 0;
      text-decoration: none;
      &:hover { color: var(--hw-accent); }
    }
    .mega-vazio {
      font-size: 13px;
      color: var(--hw-text-muted);
      padding: var(--hw-space-4);
    }

    /* Layout Conteúdo & Rodapé */
    .conteudo {
      flex: 1;
      width: 100%;
      max-width: var(--hw-content-max);
      margin: 0 auto;
      padding: var(--hw-space-8) var(--hw-space-6);
    }

    /* -------------------------------------------------------------
       Rodapé Profissional & Minimalista (Padrão E-commerce Industrial)
       ------------------------------------------------------------- */
    .rodape {
      border-top: 1px solid var(--hw-border);
      background: #f8fafc;
      margin-top: auto;
      padding: 48px 0 24px;
      color: var(--hw-text);
      font-family: var(--hw-font-sans);
    }
    .rodape-container {
      width: 100%;
      max-width: var(--hw-content-max);
      margin: 0 auto;
      padding: 0 var(--hw-space-6);
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    /* Grid de 4 Colunas */
    .rodape-grid {
      display: grid;
      grid-template-columns: 1.1fr 1.2fr 2fr;
      gap: 40px;
    }
    .rodape-col {
      display: flex;
      flex-direction: column;
    }
    .rodape-tit {
      font-size: 13.5px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
      margin: 0 0 16px;
      text-transform: capitalize;
      position: relative;
      display: inline-block;
      padding-bottom: 6px;
      border-bottom: 2px solid #0f172a;
      width: fit-content;
    }
    .rodape-links {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 9px;

      li a {
        font-size: 12.5px;
        color: #475569;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 120ms ease;

        .bullet {
          font-size: 8px;
          color: #94a3b8;
          transition: transform 120ms ease, color 120ms ease;
        }

        &:hover {
          color: #0f172a;
          transform: translateX(2px);

          .bullet {
            color: #0f172a;
          }
        }
      }
    }

    /* Bloco Contatos Televendas / B2B */
    .bloco-contato {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .contato-rotulo {
      font-size: 11.5px;
      color: #64748b;
      font-weight: 500;
    }
    .contato-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #0f172a;
      text-decoration: none;
      font-size: 14.5px;
      transition: color 120ms ease;

      .contato-icon {
        font-size: 18px;
        color: #0f172a;
      }
      strong {
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      &:hover {
        color: #1e293b;
      }
    }
    .email-link {
      font-size: 12.5px;
      color: #475569;
      font-weight: 500;

      .contato-icon {
        font-size: 17px;
        color: #64748b;
      }

      &:hover {
        color: #0f172a;
        text-decoration: underline;
      }
    }
    .contato-horario {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: #64748b;
      margin-top: 4px;

      .icone-relogio {
        font-size: 15px;
        color: #94a3b8;
      }
    }
    .mt-bloco {
      margin-top: 24px;
    }

    /* Subcolunas de Categorias */
    .col-dupla {
      width: 100%;
    }
    .subcolunas-cat {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    /* Seção SEO: Termos Mais Procurados & Marcas */
    .rodape-seo {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px 0;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
    }
    .seo-tit {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      display: block;
      margin-bottom: 6px;
    }
    .seo-termos {
      font-size: 11px;
      color: #64748b;
      line-height: 1.7;
      margin: 0;

      a {
        color: #64748b;
        text-decoration: none;
        transition: color 120ms ease;

        &:hover {
          color: #0f172a;
          text-decoration: underline;
        }
      }
    }
    .marcas-bloco {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .marcas-tit {
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .marcas-alfabeto {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .letra-link {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      text-decoration: none;
      padding: 1px 5px;
      border-radius: 4px;
      transition: all 120ms ease;

      &:hover {
        background: #0f172a;
        color: #ffffff;
      }
    }

    /* Barra Inferior (Compliance, Dados Legais, Selos) */
    .rodape-bottom {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .bottom-links-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 12px;

      a {
        color: #475569;
        font-weight: 500;
        text-decoration: none;
        transition: color 120ms ease;

        &:hover {
          color: #0f172a;
          text-decoration: underline;
        }
      }
      .sep {
        color: #cbd5e1;
      }
    }
    .bottom-content-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 32px;
      flex-wrap: wrap;
    }
    .dados-legais {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-width: 620px;
      font-size: 11px;
      color: #64748b;
      line-height: 1.5;

      p { margin: 0; }
    }
    .aviso-preco {
      color: #94a3b8;
      font-style: italic;
    }
    .empresa-info {
      font-weight: 500;
      color: #475569;
    }
    .badges-empresa {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .badge-br {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #047857;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .redes-sociais {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .rede-btn {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #475569;
      display: grid;
      place-items: center;
      font-size: 10px;
      font-weight: 700;
      text-decoration: none;
      text-transform: lowercase;
      transition: all 120ms ease;

      &:hover {
        background: #0f172a;
        color: #ffffff;
      }

      &.rede-btn-ig {
        background: transparent;
        padding: 0;
        &:hover {
          background: transparent;
          transform: scale(1.15);
        }
      }
    }
    .rede-custom-img {
      width: 26px;
      height: 26px;
      object-fit: contain;
      display: block;
    }

    /* Coluna de Selos e Certificados */
    .selos-col {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .selos-titulo {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .selos-grid {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .selo-card {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 10px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);

      .selo-icon {
        font-size: 20px;
        color: #0f172a;
      }
      .selo-info {
        display: flex;
        flex-direction: column;
        line-height: 1.2;

        strong {
          font-size: 11px;
          font-weight: 700;
          color: #0f172a;
        }
        span {
          font-size: 9.5px;
          color: #64748b;
        }
      }
    }

    .copyright-row {
      text-align: center;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #94a3b8;
    }

    /* Barra Slim de CEP Mobile (Oculta no Desktop) */
    .cep-mobile-strip {
      display: none;
    }

    /* Barra Inferior Fixa (Oculta no Desktop) */
    .mobile-bottom-nav {
      display: none;
    }

    @media (max-width: 1260px) {
      .televendas-btn {
        display: none;
      }
    }

    @media (max-width: 1100px) {
      .pedidos-btn .header-item-sub,
      .cep-desktop-btn .header-item-sub {
        display: none;
      }
      .topo-container {
        gap: 12px;
        padding: 0 var(--hw-space-3);
      }
    }

    @media (max-width: 960px) {
      .pedidos-btn {
        display: none;
      }
      .header-carrinho-txt {
        display: none;
      }
    }

    /* -------------------------------------------------------------
       Mobile Responsivo (Viewport 430x932 iPhone 14/15 Pro Max & Smartphones)
       ------------------------------------------------------------- */
    @media (max-width: 768px) {
      .topo {
        height: auto;
        padding: 8px 0 6px;
      }

      .topo-container {
        flex-wrap: wrap;
        row-gap: 6px;
        column-gap: 6px;
        padding: 0 14px;
      }

      /* Linha 1: Categorias + Logo à esquerda; Ações à direita */
      .cats {
        order: 1;
      }
      .cats-trigger {
        height: 36px;
        width: 36px;
        padding: 0;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: #f8fafc;
      }
      .cats-trigger .cats-label,
      .cats-trigger .icone-seta {
        display: none;
      }
      .icone-grade {
        font-size: 20px;
        color: #0f172a;
      }

      .logo {
        order: 2;
        gap: 4px;
      }
      .logo-txt {
        font-size: 18px;
        letter-spacing: -0.02em;
      }
      .logo-tag {
        font-size: 9px;
        padding: 0 4px;
      }

      .acoes {
        order: 3;
        margin-left: auto;
        gap: 2px;
      }

      .televendas-btn,
      .pedidos-btn {
        display: none;
      }

      .cep-desktop-btn {
        display: none;
      }

      .conta-btn {
        padding: 4px;
        min-width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 50%;
      }
      .conta-btn .header-item-txt,
      .conta-btn .seta-sub {
        display: none;
      }
      .conta-btn .avatar-iniciais {
        width: 28px;
        height: 28px;
        font-size: 11px;
      }
      .conta-btn .header-item-icone {
        font-size: 22px;
      }

      .icone-topo-btn {
        width: 36px;
        height: 36px;
        .material-symbols-outlined {
          font-size: 20px;
        }
      }

      .carrinho-btn {
        padding: 4px;
        min-width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
      }
      .header-carrinho-txt {
        display: none;
      }
      .icone-carrinho-wrap .header-item-icone {
        font-size: 22px;
      }

      /* Linha 2: Barra de Busca (100% de largura) */
      .busca-wrap {
        order: 10;
        max-width: none;
        flex-basis: 100%;
        width: 100%;
        margin-top: 2px;
      }
      .busca-box {
        height: 40px;
        padding-left: 12px;
        border-radius: 8px;
      }
      .busca-box input {
        font-size: 13px;
      }
      .btn-busca-acao {
        width: 44px;
        .material-symbols-outlined {
          font-size: 18px;
        }
      }

      /* Linha 3: Faixa Slim de Entrega / CEP (Padrão Amazon / Magalu Mobile) */
      .cep-mobile-strip {
        order: 11;
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        height: 32px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 0 10px;
        cursor: pointer;
        text-decoration: none;
        color: var(--hw-text);
        font-family: var(--hw-font-sans);
        transition: background 120ms ease;

        &:hover {
          background: #f1f5f9;
        }
      }
      .cep-mobile-esq {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        line-height: 1;
        min-width: 0;
      }
      .cep-mobile-pin {
        font-size: 16px;
        color: #0f172a;
        flex-shrink: 0;
      }
      .cep-mobile-custom-pin {
        width: 15px;
        height: 15px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .cep-mobile-label {
        color: #64748b;
        font-weight: 450;
      }
      .cep-mobile-val {
        color: #0f172a;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cep-mobile-seta {
        font-size: 16px;
        color: #94a3b8;
        flex-shrink: 0;
      }

      /* Espaçamento do Conteúdo e Rodapé para a Barra Inferior Fixa */
      .conteudo {
        padding: var(--hw-space-4) 14px;
        padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
      }
      .rodape {
        padding: 32px 0 20px;
        padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
      }
      .rodape-container {
        padding: 0 16px;
        gap: 24px;
      }
      .rodape-grid {
        grid-template-columns: 1fr;
        gap: 24px;
      }
      .subcolunas-cat {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .bottom-content-grid {
        flex-direction: column;
        gap: 20px;
      }
      .selos-grid {
        width: 100%;
      }
      .selo-card {
        flex: 1;
        min-width: 140px;
      }
      .marcas-bloco {
        flex-direction: column;
        align-items: flex-start;
      }
      .bottom-links-row {
        justify-content: flex-start;
        gap: 6px;
      }

      /* Barra de Navegação Inferior Nativa / Mobile Bottom Bar */
      .mobile-bottom-nav {
        display: flex;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: calc(56px + env(safe-area-inset-bottom, 0px));
        padding-bottom: env(safe-area-inset-bottom, 0px);
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-top: 1px solid var(--hw-border);
        z-index: 1000;
        align-items: center;
        justify-content: space-around;
        box-shadow: 0 -2px 10px rgba(15, 23, 42, 0.04);
      }
      .mobile-nav-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        flex: 1;
        height: 100%;
        background: transparent;
        border: 0;
        text-decoration: none;
        color: #64748b;
        cursor: pointer;
        padding: 4px 0;
        transition: color 120ms ease;
        font-family: var(--hw-font-sans);

        .material-symbols-outlined {
          font-size: 21px;
          color: inherit;
        }
        .mob-custom-icone {
          width: 20px;
          height: 20px;
          object-fit: contain;
          transition: transform 120ms ease;
        }
        span:last-child {
          font-size: 10.5px;
          font-weight: 500;
          line-height: 1;
        }
        &:hover,
        &.ativo {
          color: #0f172a;
          .material-symbols-outlined {
            color: #0f172a;
          }
          .mob-custom-icone {
            transform: scale(1.1);
          }
          span:last-child {
            font-weight: 700;
          }
        }
      }
      .mob-cart-icone-wrap {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;

        .badge-contador {
          top: -4px;
          right: -8px;
        }
      }
    }
  `,
})
export class Shell implements OnInit {
  auth = inject(AuthStore);
  carrinho = inject(CarrinhoService);
  private rt = inject(RealtimeService);
  readonly notifs = inject(NotificacoesService);
  private catalogo = inject(CatalogoService);
  private busca = inject(BuscaService);
  private router = inject(Router);

  cep = signal<string>(localStorage.getItem('hw_cep') || '');
  readonly alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  buscaCtrl = new FormControl('');
  sugestoes = signal<SugestaoBusca[]>([]);
  categorias = signal<Categoria[]>([]);
  buscaFoco = signal(false);

  categoriasRaiz = computed(() => this.categorias().filter((c) => !c.categoria_pai_id));
  filhasDe(id: number): Categoria[] {
    return this.categorias().filter((c) => c.categoria_pai_id === id);
  }

  primeiroNome(nome?: string): string {
    if (!nome) return 'Comprador';
    return nome.trim().split(/\s+/)[0];
  }

  aplicarCep(val: string): void {
    const limpo = (val || '').replace(/\D/g, '');
    if (limpo.length >= 8) {
      const formatado = `${limpo.substring(0, 5)}-${limpo.substring(5, 8)}`;
      this.cep.set(formatado);
      localStorage.setItem('hw_cep', formatado);
    } else if (!limpo) {
      this.cep.set('');
      localStorage.removeItem('hw_cep');
    }
  }

  ngOnInit(): void {
    if (this.auth.autenticado()) {
      void this.auth.carregarPerfil();
      void this.carrinho.atual().catch(() => {});
      this.catalogo.categorias().then((c) => this.categorias.set(c)).catch(() => {});
    }
    this.buscaCtrl.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe((q) => {
      const termo = (q ?? '').trim();
      if (termo.length < 2) {
        this.sugestoes.set([]);
        return;
      }
      this.busca.sugestoes(termo).then((s) => this.sugestoes.set(s)).catch(() => this.sugestoes.set([]));
    });
  }

  onBlurBusca(): void {
    setTimeout(() => this.buscaFoco.set(false), 200);
  }

  abrirNotif(n: Notificacao): void {
    void this.notifs.abrir(n);
  }

  getIconeNotif(n: Notificacao): string {
    const m = (n.mensagem || '').toLowerCase();
    const t = (n.titulo || '').toLowerCase();
    if (m.includes('entregue') || m.includes('concluido')) return 'check_circle';
    if (m.includes('enviado') || m.includes('transporte')) return 'local_shipping';
    if (m.includes('faturado') || m.includes('pagamento') || m.includes('boleto')) return 'receipt_long';
    if (m.includes('cancelado')) return 'cancel';
    if (t.includes('pedido') || n.tipo.startsWith('pedido.')) return 'shopping_bag';
    return 'notifications';
  }

  getTipoClasse(n: Notificacao): string {
    const m = (n.mensagem || '').toLowerCase();
    if (m.includes('entregue') || m.includes('concluido')) return 'sucesso';
    if (m.includes('enviado') || m.includes('transporte')) return 'envio';
    if (m.includes('faturado') || m.includes('pagamento')) return 'financeiro';
    if (m.includes('cancelado')) return 'cancelado';
    return 'padrao';
  }

  buscar(termo?: string): void {
    const q = (termo ?? this.buscaCtrl.value ?? '').trim();
    if (!q) return;
    this.sugestoes.set([]);
    this.buscaFoco.set(false);
    void this.router.navigate(['/busca'], { queryParams: { q } });
  }

  obterIniciais(nome: string): string {
    if (!nome) return 'HW';
    const partes = nome.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  async sair(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
