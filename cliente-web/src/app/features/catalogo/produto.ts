import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CatalogoService, CarrinhoService } from '../../core/servicos';
import { ProdutoPortal } from '../../core/models';
import { QtyPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwPrice, HwQty, HwSkeleton, HwEmpty } from '../../shared/ui/misc';
import { ToastService } from '../../shared/ui/toast';

/** S05 — PDP: Página de detalhes do produto com Angular Material e UX minimalista. */
@Component({
  standalone: true,
  imports: [
    RouterLink,
    MatTabsModule,
    MatButtonModule,
    MatTooltipModule,
    HwButton,
    HwPrice,
    HwQty,
    HwSkeleton,
    HwEmpty,
    QtyPipe,
  ],
  template: `
    @if (carregando()) {
      <div class="pdp-skeleton">
        <hw-skeleton style="height: 480px; border-radius: 16px;" />
        <div class="col-skeleton">
          <hw-skeleton style="height: 36px; width: 40%;" />
          <hw-skeleton style="height: 28px; width: 85%;" />
          <hw-skeleton style="height: 60px; width: 100%;" />
          <hw-skeleton style="height: 120px; width: 100%;" />
        </div>
      </div>
    } @else if (erro()) {
      <hw-empty
        titulo="Produto não encontrado"
        descricao="O item solicitado não existe ou pode ter sido removido do catálogo da sua empresa."
        icone="help_outline"
      >
        <a routerLink="/" hwButton>Voltar ao catálogo</a>
      </hw-empty>
    } @else if (produto(); as p) {
      <!-- Breadcrumb Minimalista -->
      <nav class="crumb" aria-label="Caminho de navegação">
        <a routerLink="/">Início</a>
        <span class="material-symbols-outlined sep" aria-hidden="true">chevron_right</span>
        @if (p.marca) {
          <span>{{ p.marca }}</span>
          <span class="material-symbols-outlined sep" aria-hidden="true">chevron_right</span>
        }
        <span class="atual">{{ p.nome }}</span>
      </nav>

      <!-- Layout PDP Principal -->
      <div class="pdp-layout">
        <!-- Coluna da Galeria -->
        <div class="galeria-col">
          <div class="principal-box">
            @if (imgAtiva(); as img) {
              <img class="img-principal" [src]="img.url" [alt]="img.alt_text ?? p.nome" />
            } @else {
              <div class="sem-img">
                <span class="material-symbols-outlined sem-img-icone">inventory_2</span>
              </div>
            }
          </div>

          @if (p.imagens.length > 1) {
            <div class="thumbs-row">
              @for (img of p.imagens; track img.id) {
                <button
                  type="button"
                  class="thumb-btn"
                  [class.ativa]="img.id === imgAtiva()?.id"
                  (click)="imgAtiva.set(img)"
                  [attr.aria-label]="'Visualizar foto ' + img.ordem"
                >
                  <img [src]="img.url" [alt]="img.alt_text ?? ''" />
                </button>
              }
            </div>
          }
        </div>

        <!-- Coluna de Informações e Compra -->
        <div class="info-col">
          <div class="tags-row">
            <span class="sku-badge hw-numeric">SKU: {{ p.sku }}</span>
            @if (p.marca) {
              <span class="marca-badge">{{ p.marca }}</span>
            }
            <span class="status-badge" [class.indisponivel]="!p.disponivel">
              <span class="dot" aria-hidden="true"></span>
              {{ p.disponivel ? 'Pronta entrega' : 'Sob consulta' }}
            </span>
          </div>

          <h1 class="produto-titulo">{{ p.nome }}</h1>

          @if (p.descricao_curta) {
            <p class="descricao-curta">{{ p.descricao_curta }}</p>
          }

          <!-- Caixa de Preço B2B -->
          <div class="preco-card">
            <div class="preco-header">
              <span class="preco-label">Preço da sua tabela cadastrada</span>
              <span class="material-symbols-outlined preco-info-icon" matTooltip="Preço líquido calculado para o CNPJ da sua empresa">info</span>
            </div>
            <hw-price class="hw-price-lg" [valor]="p.preco_efetivo" />
            <span class="preco-aviso">Faturamento em até 28/56 dias conforme cadastro aprovado</span>
          </div>

          <!-- Ações de Compra -->
          <div class="compra-row">
            <div class="stepper-wrap">
              <span class="compra-label">Quantidade ({{ p.unidade_medida ?? 'UN' }}):</span>
              <hw-qty [valor]="qtd()" [decimal]="usaDecimal(p.unidade_medida)" [mudar]="setQtd" />
            </div>

            <button
              hwButton
              size="lg"
              class="btn-adicionar"
              [loading]="adicionando()"
              texto="Adicionando ao carrinho…"
              [disabled]="!p.disponivel"
              (click)="adicionar()"
            >
              <span class="material-symbols-outlined" aria-hidden="true">add_shopping_cart</span>
              {{ p.disponivel ? 'Adicionar ao carrinho' : 'Item indisponível' }}
            </button>
          </div>

          @if (!p.disponivel) {
            <div class="aviso-estoque" role="status">
              <span class="material-symbols-outlined">schedule</span>
              <span>Lote em reposição. Entre em contato com seu vendedor para reserva antecipada.</span>
            </div>
          }

          <!-- Garantias B2B / Selos de Confiança -->
          <div class="garantias-grid">
            <div class="garantia-item">
              <span class="material-symbols-outlined">verified</span>
              <div>
                <strong>Garantia HWeld</strong>
                <span>Procedência 100% industrial rastreada</span>
              </div>
            </div>
            <div class="garantia-item">
              <span class="material-symbols-outlined">description</span>
              <div>
                <strong>NFe & Faturamento PJ</strong>
                <span>Emissão automática no faturamento</span>
              </div>
            </div>
            <div class="garantia-item">
              <span class="material-symbols-outlined">support_agent</span>
              <div>
                <strong>Suporte Técnico</strong>
                <span>Especialistas em processos de soldagem</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Abas de Especificações Técnicas e Descrição com Angular Material -->
      <section class="detalhes-secao">
        <mat-tab-group animationDuration="200ms" class="mat-tabs-minimal">
          @if (temSpecs(p)) {
            <mat-tab label="Especificações Técnicas">
              <div class="tab-corpo">
                <dl class="specs-grid">
                  @if (p.ncm) {
                    <div class="spec-row">
                      <dt>Classificação Fiscal (NCM)</dt>
                      <dd class="hw-numeric">{{ p.ncm }}</dd>
                    </div>
                  }
                  @if (p.unidade_medida) {
                    <div class="spec-row">
                      <dt>Unidade de Medida</dt>
                      <dd>{{ p.unidade_medida }}</dd>
                    </div>
                  }
                  @if (p.peso_kg) {
                    <div class="spec-row">
                      <dt>Peso Líquido</dt>
                      <dd>{{ p.peso_kg | qty:'kg' }}</dd>
                    </div>
                  }
                  @if (p.altura_cm && p.largura_cm && p.comprimento_cm) {
                    <div class="spec-row">
                      <dt>Dimensões (Alt × Larg × Comp)</dt>
                      <dd class="hw-numeric">{{ p.altura_cm }} × {{ p.largura_cm }} × {{ p.comprimento_cm }} cm</dd>
                    </div>
                  }
                  @if (p.origem_mercadoria) {
                    <div class="spec-row">
                      <dt>Origem da Mercadoria</dt>
                      <dd>{{ p.origem_mercadoria }}</dd>
                    </div>
                  }
                </dl>
              </div>
            </mat-tab>
          }

          @if (p.descricao_tecnica) {
            <mat-tab label="Descrição Detalhada">
              <div class="tab-corpo">
                <div class="descricao-tecnica-texto">
                  {{ p.descricao_tecnica }}
                </div>
              </div>
            </mat-tab>
          }
        </mat-tab-group>
      </section>
    }
  `,
  styles: `
    .crumb {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: var(--hw-text-muted);
      margin-bottom: var(--hw-space-6);
      a { color: var(--hw-text-muted); text-decoration: none; &:hover { color: var(--hw-accent); } }
      .sep { font-size: 16px; color: var(--hw-text-faint); }
      .atual { color: var(--hw-text); font-weight: 500; }
    }

    .pdp-skeleton {
      display: grid;
      grid-template-columns: minmax(320px, 480px) 1fr;
      gap: var(--hw-space-10);
    }
    .col-skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-4);
    }

    .pdp-layout {
      display: grid;
      grid-template-columns: minmax(320px, 480px) 1fr;
      gap: var(--hw-space-10);
      align-items: start;
    }

    /* Galeria Minimalista */
    .galeria-col {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
    }
    .principal-box {
      width: 100%;
      aspect-ratio: 1;
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-lg);
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    .img-principal {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: var(--hw-space-6);
    }
    .sem-img {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--hw-text-faint);
    }
    .sem-img-icone {
      font-size: 72px;
    }
    .thumbs-row {
      display: flex;
      gap: var(--hw-space-2);
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .thumb-btn {
      width: 64px;
      height: 64px;
      padding: 4px;
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-sm);
      background: var(--hw-surface-raised);
      cursor: pointer;
      overflow: hidden;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);

      img { width: 100%; height: 100%; object-fit: contain; }
      &:hover { border-color: var(--hw-border-input); }
      &.ativa { border-color: var(--hw-accent); box-shadow: 0 0 0 1px var(--hw-accent); }
    }

    /* Coluna de Informações */
    .info-col {
      display: flex;
      flex-direction: column;
    }
    .tags-row {
      display: flex;
      align-items: center;
      gap: var(--hw-space-2);
      margin-bottom: var(--hw-space-3);
      flex-wrap: wrap;
    }
    .sku-badge {
      font-family: var(--hw-font-mono);
      font-size: 11px;
      color: var(--hw-text-muted);
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-xs);
      padding: 2px 8px;
    }
    .marca-badge {
      font-size: 11px;
      font-weight: 600;
      color: var(--hw-accent);
      background: var(--hw-accent-tint);
      border: 1px solid rgba(29, 79, 216, 0.2);
      border-radius: var(--hw-radius-xs);
      padding: 2px 8px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: var(--hw-success);
      background: var(--hw-chip-success-bg);
      border-radius: var(--hw-radius-pill);
      padding: 2px 10px;
      .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      &.indisponivel {
        color: var(--hw-warning);
        background: var(--hw-chip-warning-bg);
      }
    }

    .produto-titulo {
      font-family: var(--hw-font-sans);
      font-size: 26px;
      font-weight: 800;
      line-height: 1.25;
      letter-spacing: -0.02em;
      color: var(--hw-text);
      margin: 0 0 var(--hw-space-3);
    }
    .descricao-curta {
      font-size: 14.5px;
      line-height: 1.5;
      color: var(--hw-text-muted);
      margin: 0 0 var(--hw-space-6);
    }

    /* Caixa de Preço */
    .preco-card {
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      padding: var(--hw-space-5);
      margin-bottom: var(--hw-space-6);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .preco-header {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .preco-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--hw-text-muted);
    }
    .preco-info-icon {
      font-size: 16px;
      color: var(--hw-text-faint);
      cursor: help;
    }
    .preco-aviso {
      font-size: 12px;
      color: var(--hw-text-muted);
      margin-top: 4px;
    }

    /* Bloco de Compra */
    .compra-row {
      display: flex;
      align-items: flex-end;
      gap: var(--hw-space-4);
      margin-bottom: var(--hw-space-6);
      flex-wrap: wrap;
    }
    .stepper-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .compra-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--hw-text-muted);
    }
    .btn-adicionar {
      flex: 1;
      min-width: 220px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .aviso-estoque {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: var(--hw-space-3) var(--hw-space-4);
      background: var(--hw-chip-warning-bg);
      border: 1px solid rgba(217, 119, 6, 0.2);
      border-radius: var(--hw-radius-sm);
      color: var(--hw-warning);
      font-size: 13px;
      margin-bottom: var(--hw-space-6);
      .material-symbols-outlined { font-size: 18px; }
    }

    /* Garantias */
    .garantias-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--hw-space-4);
      padding: var(--hw-space-5) 0;
      border-top: 1px solid var(--hw-border);
      border-bottom: 1px solid var(--hw-border);
    }
    .garantia-item {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      .material-symbols-outlined { font-size: 20px; color: var(--hw-accent); margin-top: 2px; }
      div { display: flex; flex-direction: column; gap: 2px; }
      strong { font-size: 12.5px; color: var(--hw-text); }
      span { font-size: 11.5px; color: var(--hw-text-muted); }
    }

    /* Abas de Detalhes */
    .detalhes-secao {
      margin-top: var(--hw-space-12);
    }
    .tab-corpo {
      padding: var(--hw-space-6) 0;
    }
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--hw-space-4);
      margin: 0;
    }
    .spec-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: var(--hw-space-3);
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-sm);
      dt { font-size: 11.5px; font-weight: 500; color: var(--hw-text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
      dd { margin: 0; font-size: 14px; font-weight: 600; color: var(--hw-text); }
    }
    .descricao-tecnica-texto {
      white-space: pre-line;
      font-size: 14px;
      line-height: 1.7;
      color: var(--hw-text-muted);
      max-width: 80ch;
    }

    @media (max-width: 768px) {
      .pdp-layout {
        grid-template-columns: 1fr;
        gap: var(--hw-space-6);
      }
      .garantias-grid {
        grid-template-columns: 1fr;
      }
      .produto-titulo {
        font-size: 20px;
      }
      .compra-row {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      .btn-adicionar {
        width: 100%;
        min-width: 0;
      }
    }
  `,
})
export class ProdutoPage implements OnInit {
  private route = inject(ActivatedRoute);
  private catalogo = inject(CatalogoService);
  private carrinho = inject(CarrinhoService);
  private toast = inject(ToastService);

  produto = signal<ProdutoPortal | null>(null);
  carregando = signal(true);
  erro = signal(false);
  adicionando = signal(false);
  qtd = signal(1);
  imgAtiva = signal<ProdutoPortal['imagens'][number] | null>(null);

  setQtd = (v: number) => this.qtd.set(v);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const idSlug = params.get('idslug') ?? '';
      const id = Number(idSlug.split('-')[0]);
      if (!id) {
        this.erro.set(true);
        this.carregando.set(false);
        return;
      }
      this.catalogo.produto(id)
        .then((p) => {
          this.produto.set(p);
          this.imgAtiva.set(p.imagens.find((i) => i.is_principal) ?? p.imagens[0] ?? null);
        })
        .catch(() => this.erro.set(true))
        .finally(() => this.carregando.set(false));
    });
  }

  usaDecimal(um: string | null): boolean {
    return ['kg', 'm', 'l'].includes((um ?? '').toLowerCase());
  }

  temSpecs(p: ProdutoPortal): boolean {
    return !!(p.ncm || p.unidade_medida || p.peso_kg || (p.altura_cm && p.largura_cm) || p.origem_mercadoria);
  }

  async adicionar(): Promise<void> {
    const p = this.produto();
    if (!p || this.adicionando()) return;
    this.adicionando.set(true);
    try {
      await this.carrinho.adicionar(p.id, this.qtd());
      this.toast.ok(`${p.nome} adicionado ao carrinho.`);
    } catch {
      this.toast.erro('Não foi possível adicionar o produto ao carrinho.');
    } finally {
      this.adicionando.set(false);
    }
  }
}
