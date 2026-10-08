import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { CarrinhoService, ContaService } from '../../core/servicos';
import { Endereco } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwStatusChip, HwSkeleton, HwEmpty } from '../../shared/ui/misc';
import { ToastService } from '../../shared/ui/toast';

/** S07 — Checkout minimalista corporativo com Angular Material. */
@Component({
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    HwButton,
    HwSkeleton,
    HwEmpty,
    BrlPipe,
  ],
  template: `
    <div class="checkout-header">
      <h1>Finalizar Pedido</h1>
      <span class="subtitulo">Revise os endereços de faturamento, entrega e condições comerciais</span>
    </div>

    @if (carregando()) {
      <div class="layout">
        <hw-skeleton style="height: 520px; border-radius: 16px;" />
        <hw-skeleton style="height: 340px; border-radius: 16px;" />
      </div>
    } @else if (semEnderecos()) {
      <hw-empty
        titulo="Endereço não cadastrado"
        icone="location_on"
        descricao="Sua empresa ainda não possui endereço de cobrança ou entrega cadastrado. Entre em contato com seu vendedor para homologar o cadastro antes de prosseguir."
      />
    } @else {
      <form class="layout" [formGroup]="form" (ngSubmit)="confirmar()">
        <div class="passos">
          <!-- Passo 1: Faturamento -->
          <section class="passo-card">
            <div class="passo-header">
              <span class="passo-numero">1</span>
              <div>
                <h2>Endereço de Faturamento (Cobrança)</h2>
                <span class="passo-desc">Endereço vinculado ao CNPJ onde a NFe será emitida</span>
              </div>
            </div>

            <div class="enderecos-grid" role="radiogroup" aria-label="Endereço de faturamento">
              @for (e of enderecosFaturamento(); track e.id) {
                <label class="endereco-card" [class.sel]="form.controls.faturamento.value === e.id">
                  <div class="radio-indicator">
                    <input type="radio" formControlName="faturamento" [value]="e.id" />
                    <span class="radio-circulo" aria-hidden="true"></span>
                  </div>
                  <div class="endereco-detalhes">
                    <ng-container *ngTemplateOutlet="enderecoTpl; context: { $implicit: e }" />
                  </div>
                </label>
              }
            </div>
          </section>

          <!-- Passo 2: Entrega -->
          <section class="passo-card">
            <div class="passo-header">
              <span class="passo-numero">2</span>
              <div>
                <h2>Endereço de Entrega</h2>
                <span class="passo-desc">Local físico para descarregamento das mercadorias</span>
              </div>
            </div>

            <div class="enderecos-grid" role="radiogroup" aria-label="Endereço de entrega">
              @for (e of enderecosEntrega(); track e.id) {
                <label class="endereco-card" [class.sel]="form.controls.entrega.value === e.id">
                  <div class="radio-indicator">
                    <input type="radio" formControlName="entrega" [value]="e.id" />
                    <span class="radio-circulo" aria-hidden="true"></span>
                  </div>
                  <div class="endereco-detalhes">
                    <ng-container *ngTemplateOutlet="enderecoTpl; context: { $implicit: e }" />
                  </div>
                </label>
              }
            </div>
          </section>

          <!-- Passo 3: Condição de Pagamento -->
          <section class="passo-card">
            <div class="passo-header">
              <span class="passo-numero">3</span>
              <div>
                <h2>Condição de Pagamento</h2>
                <span class="passo-desc">Termos comerciais cadastrados para o seu CNPJ</span>
              </div>
            </div>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Condição de Pagamento</mat-label>
              <mat-select formControlName="condicao">
                <mat-option value="">Combinar com o vendedor / Tabela Padrão</mat-option>
                <mat-option value="faturado_28">Faturado 28 dias</mat-option>
                <mat-option value="faturado_28_56">Faturado 28 / 56 dias</mat-option>
                <mat-option value="boleto">Boleto Bancário à Vista</mat-option>
                <mat-option value="antecipado">Pagamento Antecipado</mat-option>
              </mat-select>
            </mat-form-field>
          </section>

          <!-- Passo 4: Observações -->
          <section class="passo-card">
            <div class="passo-header">
              <span class="passo-numero">4</span>
              <div>
                <h2>Instruções e Observações (Opcional)</h2>
                <span class="passo-desc">Número do seu pedido de compra (PO), horários de recebimento, etc.</span>
              </div>
            </div>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Observações do Pedido</mat-label>
              <textarea
                matInput
                formControlName="observacoes"
                rows="3"
                maxlength="500"
                placeholder="Ex.: Número da Ordem de Compra: OC-9821 / Recebimento de carga até as 17h."
              ></textarea>
            </mat-form-field>
          </section>
        </div>

        <!-- Sidebar Resumo -->
        <aside class="resumo-sidebar">
          <h2>Resumo do Pedido</h2>

          <div class="itens-preview">
            @for (i of itens(); track i.produto_id) {
              <div class="item-linha">
                <div class="item-nome-col">
                  <span class="item-nome">{{ i.produto?.nome ?? 'Produto ' + i.produto_id }}</span>
                  <span class="item-qtd-unit hw-numeric">{{ i.quantidade }} × {{ i.preco_unitario | brl }}</span>
                </div>
                <span class="item-subtotal hw-numeric">{{ (Number(i.quantidade) * Number(i.preco_unitario)).toFixed(2) | brl }}</span>
              </div>
            }
          </div>

          <div class="divisor"></div>

          <div class="total-linha">
            <span>Total a Faturar</span>
            <strong class="total-num hw-numeric">{{ subtotal() | brl }}</strong>
          </div>

          @if (erro()) {
            <div class="alerta-erro" role="alert">
              <span class="material-symbols-outlined">error</span>
              <span>{{ erro() }}</span>
            </div>
          }

          <button
            hwButton
            size="lg"
            type="submit"
            class="btn-confirmar"
            [loading]="enviando()"
            texto="Enviando pedido…"
            [disabled]="form.invalid"
          >
            <span>Confirmar e Enviar Pedido</span>
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
          </button>

          <span class="aviso-seguro">
            <span class="material-symbols-outlined">lock</span>
            <span>Ambiente B2B autenticado e criptografado.</span>
          </span>
        </aside>
      </form>
    }

    <!-- Template de exibição do endereço -->
    <ng-template #enderecoTpl let-e>
      <div class="tag-tipo">{{ e.tipo }}</div>
      <strong class="end-logradouro">{{ e.logradouro }}, {{ e.numero }}{{ e.complemento ? ' · ' + e.complemento : '' }}</strong>
      <span class="end-cidade">{{ e.bairro }} — {{ e.cidade }}/{{ e.uf }} · CEP {{ e.cep }}</span>
    </ng-template>
  `,
  styles: `
    .checkout-header {
      margin-bottom: var(--hw-space-8);
      padding-bottom: var(--hw-space-4);
      border-bottom: 1px solid var(--hw-border);
      h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
      .subtitulo { font-size: 14px; color: var(--hw-text-muted); }
    }

    .layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: var(--hw-space-8);
      align-items: start;
    }

    .passos {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-6);
    }

    .passo-card {
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      padding: var(--hw-space-6);
    }

    .passo-header {
      display: flex;
      gap: var(--hw-space-3);
      align-items: flex-start;
      margin-bottom: var(--hw-space-4);
    }
    .passo-numero {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--hw-accent-tint);
      color: var(--hw-accent);
      font-size: 13px;
      font-weight: 700;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .passo-header h2 {
      font-size: 16px;
      font-weight: 700;
      color: var(--hw-text);
      margin: 0;
    }
    .passo-desc {
      font-size: 12.5px;
      color: var(--hw-text-muted);
    }

    .enderecos-grid {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
    }
    .endereco-card {
      display: flex;
      gap: var(--hw-space-3);
      padding: var(--hw-space-4);
      border: 1.5px solid var(--hw-border);
      border-radius: var(--hw-radius-sm);
      cursor: pointer;
      background: var(--hw-surface);
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);

      &:hover {
        border-color: var(--hw-border-input);
      }
      &.sel {
        border-color: var(--hw-accent);
        background: rgba(29, 79, 216, 0.02);
        box-shadow: 0 0 0 1px var(--hw-accent);
        .radio-circulo { border-color: var(--hw-accent); background: var(--hw-accent); }
      }
    }
    .radio-indicator {
      position: relative;
      padding-top: 2px;
      input { position: absolute; opacity: 0; cursor: pointer; }
    }
    .radio-circulo {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--hw-border-input);
      display: block;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);
    }
    .endereco-detalhes {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .tag-tipo {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--hw-accent);
    }
    .end-logradouro {
      font-size: 13.5px;
      color: var(--hw-text);
    }
    .end-cidade {
      font-size: 12px;
      color: var(--hw-text-muted);
    }

    .w-full {
      width: 100%;
    }

    /* Resumo Lateral */
    .resumo-sidebar {
      background: var(--hw-surface);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-lg);
      padding: var(--hw-space-6);
      position: sticky;
      top: calc(var(--hw-header-h) + var(--hw-space-4));
      h2 { font-size: 18px; font-weight: 700; margin: 0 0 var(--hw-space-4); }
    }
    .itens-preview {
      display: flex;
      flex-direction: column;
      gap: var(--hw-space-3);
      max-height: 240px;
      overflow-y: auto;
      margin-bottom: var(--hw-space-4);
    }
    .item-linha {
      display: flex;
      justify-content: space-between;
      gap: var(--hw-space-3);
      font-size: 13px;
    }
    .item-nome-col {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .item-nome {
      font-weight: 500;
      color: var(--hw-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }
    .item-qtd-unit {
      font-size: 11.5px;
      color: var(--hw-text-muted);
    }
    .item-subtotal {
      font-weight: 600;
      color: var(--hw-text);
    }

    .divisor {
      height: 1px;
      background: var(--hw-border);
      margin: var(--hw-space-4) 0;
    }
    .total-linha {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: var(--hw-space-5);
    }
    .total-num {
      font-size: 22px;
      font-weight: 800;
      color: var(--hw-accent);
      letter-spacing: -0.02em;
    }
    .btn-confirmar {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .alerta-erro {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: var(--hw-space-3);
      background: var(--hw-chip-danger-bg);
      border-radius: var(--hw-radius-sm);
      color: var(--hw-danger);
      font-size: 12.5px;
      margin-bottom: var(--hw-space-4);
      .material-symbols-outlined { font-size: 18px; flex-shrink: 0; }
    }
    .aviso-seguro {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 11.5px;
      color: var(--hw-text-muted);
      margin-top: var(--hw-space-3);
      .material-symbols-outlined { font-size: 14px; }
    }

    @media (max-width: 860px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class CheckoutPage implements OnInit {
  private carrinho = inject(CarrinhoService);
  private conta = inject(ContaService);
  private toast = inject(ToastService);
  private router = inject(Router);

  readonly Number = Number;

  carregando = signal(true);
  enviando = signal(false);
  erro = signal<string | null>(null);
  enderecos = signal<Endereco[]>([]);
  itens = signal<{ produto_id: number; quantidade: string; preco_unitario: string; produto?: { nome: string } }[]>([]);

  form = new FormGroup({
    faturamento: new FormControl<number | null>(null, { validators: [Validators.required] }),
    entrega: new FormControl<number | null>(null, { validators: [Validators.required] }),
    condicao: new FormControl('', { nonNullable: true }),
    observacoes: new FormControl('', { nonNullable: true }),
  });

  enderecosFaturamento = computed(() => this.enderecos().filter((e) => e.tipo === 'faturamento' || e.tipo === 'cobranca' || e.principal));
  enderecosEntrega = computed(() => this.enderecos().filter((e) => e.tipo === 'entrega' || e.principal));
  semEnderecos = computed(() => this.enderecosFaturamento().length === 0 || this.enderecosEntrega().length === 0);

  ngOnInit(): void {
    Promise.all([this.carrinho.atual(), this.conta.enderecos()])
      .then(([c, enderecos]) => {
        this.itens.set(c.itens);
        this.enderecos.set(enderecos);
        const fat = this.enderecosFaturamento()[0];
        const ent = this.enderecosEntrega()[0];
        if (fat) this.form.controls.faturamento.setValue(fat.id);
        if (ent) this.form.controls.entrega.setValue(ent.id);
      })
      .catch(() => this.erro.set('Não foi possível carregar os dados de checkout.'))
      .finally(() => this.carregando.set(false));
  }

  subtotal(): string {
    return this.itens().reduce((a, i) => a + Number(i.quantidade) * Number(i.preco_unitario), 0).toFixed(2);
  }

  async confirmar(): Promise<void> {
    if (this.form.invalid || this.enviando()) return;
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const v = this.form.getRawValue();
      const pedido = await this.carrinho.checkout({
        endereco_faturamento_id: v.faturamento!,
        endereco_entrega_id: v.entrega!,
        condicao_pagamento: v.condicao || undefined,
        observacoes: v.observacoes || undefined,
      });
      await this.router.navigate(['/checkout/sucesso', pedido.id]);
    } catch {
      this.erro.set('Não foi possível concluir o pedido. Revise os dados e tente novamente.');
      this.toast.erro('Checkout falhou.');
    } finally {
      this.enviando.set(false);
    }
  }
}

/** S08 — Confirmação de pedido com visual moderno e limpo. */
@Component({
  standalone: true,
  imports: [RouterLink, HwStatusChip, HwButton],
  template: `
    <div class="sucesso-card">
      <div class="check-circulo" aria-hidden="true">
        <span class="material-symbols-outlined">check</span>
      </div>
      <h1>Pedido {{ numero() }} Confirmado</h1>
      <hw-status-chip [status]="'aguardando_pagamento'" />
      <p class="sucesso-msg">
        Seu pedido foi registrado no sistema comercial da HWeld. Nossa equipe iniciará a conferência e o faturamento.
      </p>

      <div class="sucesso-acoes">
        <a routerLink="/conta/pedidos" hwButton size="lg">
          <span class="material-symbols-outlined">receipt_long</span>
          <span>Acompanhar meus pedidos</span>
        </a>
        <a routerLink="/" hwButton variant="secondary" size="lg">
          <span>Voltar ao catálogo</span>
        </a>
      </div>
    </div>
  `,
  styles: `
    .sucesso-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--hw-space-16) var(--hw-space-6);
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-lg);
      max-width: 600px;
      margin: var(--hw-space-6) auto;
      gap: var(--hw-space-3);
    }
    .check-circulo {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--hw-chip-success-bg);
      color: var(--hw-chip-success-fg);
      display: grid;
      place-items: center;
      .material-symbols-outlined { font-size: 36px; }
      margin-bottom: var(--hw-space-2);
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0;
    }
    .sucesso-msg {
      font-size: 14.5px;
      color: var(--hw-text-muted);
      max-width: 44ch;
      line-height: 1.5;
      margin: var(--hw-space-2) 0 var(--hw-space-4);
    }
    .sucesso-acoes {
      display: flex;
      gap: var(--hw-space-3);
      flex-wrap: wrap;
      justify-content: center;
    }
  `,
})
export class CheckoutSucessoPage {
  private route = inject(ActivatedRoute);
  numero = signal(this.route.snapshot.paramMap.get('id'));
}
