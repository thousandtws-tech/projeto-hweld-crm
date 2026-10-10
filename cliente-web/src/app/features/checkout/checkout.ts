import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { CarrinhoService, ContaService } from '../../core/servicos';
import { Endereco } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwEmpty } from '../../shared/ui/empty';
import { ToastService } from '../../shared/ui/toast';

/** S07 — Checkout minimalista corporativo com Angular Material. */
@Component({
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    RouterLink,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    HwButton,
    HwSkeleton,
    HwEmpty,
    BrlPipe,
  ],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
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
  itens = signal<
    { produto_id: number; quantidade: string; preco_unitario: string; produto?: { nome: string } }[]
  >([]);

  form = new FormGroup({
    faturamento: new FormControl<number | null>(null, { validators: [Validators.required] }),
    entrega: new FormControl<number | null>(null, { validators: [Validators.required] }),
    condicao: new FormControl('', { nonNullable: true }),
    observacoes: new FormControl('', { nonNullable: true }),
  });

  enderecosFaturamento = computed(() =>
    this.enderecos().filter(
      (e) => e.tipo === 'faturamento' || e.tipo === 'cobranca' || e.principal,
    ),
  );
  enderecosEntrega = computed(() =>
    this.enderecos().filter((e) => e.tipo === 'entrega' || e.principal),
  );
  semEnderecos = computed(
    () => this.enderecosFaturamento().length === 0 || this.enderecosEntrega().length === 0,
  );
  /** Carrinho vazio não deve chegar ao formulário — o backend rejeita e
   *  marketplaces redirecionam pra página do carrinho. */
  carrinhoVazio = computed(() => !this.carregando() && this.itens().length === 0);

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
    return this.itens()
      .reduce((a, i) => a + Number(i.quantidade) * Number(i.preco_unitario), 0)
      .toFixed(2);
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
    } catch (e: unknown) {
      // Envelope ErroApp do backend: { erro: { codigo, mensagem } } — exibe a
      // razão real (ex.: itens indisponíveis, carrinho já convertido).
      const apiErro = (e as { error?: { erro?: { mensagem?: string } } })?.error?.erro;
      const msg = apiErro?.mensagem ?? 'Não foi possível concluir o pedido. Tente novamente.';
      this.erro.set(msg);
      this.toast.erro(msg);
    } finally {
      this.enviando.set(false);
    }
  }
}
