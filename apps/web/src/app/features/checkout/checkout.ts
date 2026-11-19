import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { CarrinhoService, ContaService, PagamentoService } from '../../core/servicos';
import { RealtimeService } from '../../core/realtime';
import { Endereco, MetodoPagamento } from '../../core/models';
import { BrlPipe } from '../../core/pipes';
import { HwButton } from '../../shared/ui/button';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { HwEmpty } from '../../shared/ui/empty';
import { ToastService } from '../../shared/ui/toast';

/** S07 — Checkout minimalista corporativo com Angular Material. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  private pagamentos = inject(PagamentoService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private rt = inject(RealtimeService);

  readonly Number = Number;

  carregando = signal(true);
  enviando = signal(false);
  salvandoEndereco = signal(false);
  buscandoCep = signal(false);
  cepLocalizado = signal(false);
  mostrandoFormEndereco = signal(false);
  erro = signal<string | null>(null);
  enderecos = signal<Endereco[]>([]);
  itens = signal<
    {
      produto_id: number;
      quantidade: string;
      preco_unitario: string;
      produto?: { nome: string; sku?: string; imagem_url?: string | null };
    }[]
  >([]);

  form = new FormGroup({
    faturamento: new FormControl<number | null>(null, { validators: [Validators.required] }),
    entrega: new FormControl<number | null>(null, { validators: [Validators.required] }),
    condicao: new FormControl('', { nonNullable: true }),
    /** '' = combinar com o vendedor (sem cobrança online). */
    metodo: new FormControl<'' | MetodoPagamento>('', { nonNullable: true }),
    observacoes: new FormControl('', { nonNullable: true }),
  });

  /** Formulário inline de endereço com autopreenchimento por CEP (padrão Mercado Livre / Amazon). */
  enderecoForm = new FormGroup({
    cep: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    logradouro: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    numero: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    complemento: new FormControl('', { nonNullable: true }),
    bairro: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    cidade: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    uf: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(2)],
    }),
    usarParaAmbos: new FormControl(true, { nonNullable: true }),
    tipo: new FormControl<'entrega' | 'fiscal'>('entrega', { nonNullable: true }),
  });

  enderecosFaturamento = computed(() => {
    const todos = this.enderecos();
    const filtrados = todos.filter(
      (e) =>
        e.tipo === 'fiscal' || e.tipo === 'faturamento' || e.tipo === 'cobranca' || e.principal,
    );
    return filtrados.length > 0 ? filtrados : todos;
  });

  enderecosEntrega = computed(() => {
    const todos = this.enderecos();
    const filtrados = todos.filter((e) => e.tipo === 'entrega' || e.principal);
    return filtrados.length > 0 ? filtrados : todos;
  });

  semEnderecos = computed(() => this.enderecos().length === 0);
  /** Carrinho vazio não deve chegar ao formulário — o backend rejeita e
   *  marketplaces redirecionam pra página do carrinho. */
  carrinhoVazio = computed(() => !this.carregando() && this.itens().length === 0);

  constructor() {
    // Mudança de catálogo/preço durante o checkout revalida os itens — o
    // backend também reconfirma no submit, mas o usuário vê o valor atualizado.
    // `enviando` lido no predicado (untracked interno): nunca reconcilia
    // no meio de um submit.
    this.rt.reagirA(
      (e) =>
        (e.tipo === 'catalogo.precos' || e.tipo === 'catalogo.produtos') && !this.enviando(),
      () =>
        void this.carrinho
          .atual()
          .then((c) => this.itens.set(c.itens))
          .catch(() => {}),
    );
  }

  ngOnInit(): void {
    Promise.all([this.carrinho.atual(), this.conta.enderecos()])
      .then(([c, enderecos]) => {
        this.itens.set(c.itens);
        this.enderecos.set(enderecos);
        this.selecionarEnderecosPadrao();
        if (enderecos.length === 0) {
          this.mostrandoFormEndereco.set(true);
        }
      })
      .catch(() => this.erro.set('Não foi possível carregar os dados de checkout.'))
      .finally(() => this.carregando.set(false));
  }

  private selecionarEnderecosPadrao(): void {
    const fat = this.enderecosFaturamento()[0];
    const ent = this.enderecosEntrega()[0];
    if (fat && !this.form.controls.faturamento.value) {
      this.form.controls.faturamento.setValue(fat.id);
    }
    if (ent && !this.form.controls.entrega.value) {
      this.form.controls.entrega.setValue(ent.id);
    }
  }

  abrirNovoEndereco(tipo: 'entrega' | 'fiscal' = 'entrega'): void {
    this.enderecoForm.patchValue({ tipo, usarParaAmbos: this.enderecos().length === 0 });
    this.cepLocalizado.set(false);
    this.mostrandoFormEndereco.set(true);
  }

  /** Autopreenchimento de endereço por CEP (ViaCEP) — padrão grandes lojas virtuais. */
  async aoDigitarCep(): Promise<void> {
    const raw = this.enderecoForm.controls.cep.value;
    const digitos = raw.replace(/\D/g, '');
    if (digitos.length !== 8) {
      this.cepLocalizado.set(false);
      return;
    }
    this.buscandoCep.set(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      if (!res.ok) return;
      const dados = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (dados.erro) {
        this.toast.erro('CEP não encontrado. Preencha os dados manualmente.');
        return;
      }
      this.enderecoForm.patchValue({
        logradouro: dados.logradouro || this.enderecoForm.controls.logradouro.value,
        bairro: dados.bairro || this.enderecoForm.controls.bairro.value,
        cidade: dados.localidade || this.enderecoForm.controls.cidade.value,
        uf: (dados.uf || this.enderecoForm.controls.uf.value).toUpperCase(),
      });
      this.cepLocalizado.set(true);
    } catch {
      /* falha de rede no ViaCEP — permite preenchimento manual transparente */
    } finally {
      this.buscandoCep.set(false);
    }
  }

  async salvarEndereco(): Promise<void> {
    if (this.enderecoForm.invalid || this.salvandoEndereco()) {
      this.enderecoForm.markAllAsTouched();
      return;
    }
    const v = this.enderecoForm.getRawValue();
    const cepDigitos = v.cep.replace(/\D/g, '');
    if (cepDigitos.length !== 8) {
      this.toast.erro('Informe um CEP válido com 8 dígitos.');
      return;
    }

    this.salvandoEndereco.set(true);
    try {
      const criado = await this.conta.criarEndereco({
        tipo: v.tipo,
        cep: cepDigitos,
        logradouro: v.logradouro.trim(),
        numero: v.numero.trim(),
        complemento: v.complemento.trim() || null,
        bairro: v.bairro.trim(),
        cidade: v.cidade.trim(),
        uf: v.uf.trim().toUpperCase(),
        principal: v.usarParaAmbos || this.enderecos().length === 0,
      });

      this.enderecos.update((lista) => [criado, ...lista]);
      if (v.usarParaAmbos || !this.form.controls.faturamento.value) {
        this.form.controls.faturamento.setValue(criado.id);
      }
      if (v.usarParaAmbos || !this.form.controls.entrega.value) {
        this.form.controls.entrega.setValue(criado.id);
      }
      if (!v.usarParaAmbos) {
        if (v.tipo === 'fiscal') this.form.controls.faturamento.setValue(criado.id);
        else this.form.controls.entrega.setValue(criado.id);
      }

      this.mostrandoFormEndereco.set(false);
      this.enderecoForm.reset({
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
        usarParaAmbos: false,
        tipo: 'entrega',
      });
      this.toast.ok('Endereço cadastrado e selecionado para o pedido!');
    } catch {
      this.toast.erro('Não foi possível salvar o endereço. Verifique os campos informados.');
    } finally {
      this.salvandoEndereco.set(false);
    }
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
      // Pedido criado — se o cliente escolheu pagar online, gera a cobrança
      // no PSP (idempotente pela chave do pedido+método: retry nunca duplica).
      // Falha aqui não derruba o pedido — a tela de confirmação permite retentar.
      if (v.metodo) {
        try {
          await this.pagamentos.criar({
            pedidoId: pedido.id,
            method: v.metodo,
            idempotencyKey: `pedido-${pedido.id}-${v.metodo.toLowerCase()}`,
          });
        } catch {
          this.toast.erro(
            'Pedido criado, mas a cobrança online falhou. Você pode tentar novamente na tela do pedido.',
          );
        }
      }
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
