import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HwInstitucionalNav } from './institucional-nav';

interface ItemFaq {
  id: string;
  categoria: string;
  pergunta: string;
  resposta: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, HwInstitucionalNav],
  templateUrl: './faq.html',
  styleUrl: './faq.scss',
})
export class FaqPage {
  buscaCtrl = new FormControl('');
  // valueChanges como signal — o computed de filtro reage a cada tecla.
  private readonly termoBusca = toSignal(this.buscaCtrl.valueChanges, { initialValue: '' });
  categoriaAtiva = signal('todas');
  itemAberto = signal<string | null>('fat-1');

  readonly categorias = [
    { id: 'todas', nome: 'Todas as Dúvidas' },
    { id: 'faturamento', nome: 'Faturamento PJ & Boletos' },
    { id: 'entrega', nome: 'Prazos & Logística' },
    { id: 'tabela', nome: 'Tabela de Preços & Cadastro' },
    { id: 'garantia', nome: 'Garantia & Assistência' },
  ];

  readonly faqData: ItemFaq[] = [
    {
      id: 'fat-1',
      categoria: 'faturamento',
      pergunta: 'Como funciona o faturamento via boleto a prazo para empresas (PJ)?',
      resposta:
        'O faturamento a prazo (28, 56 ou 84 dias) é concedido para clientes cadastrados com CNPJ ativo e aprovação prévia de crédito por nossa mesa financeira. Ao finalizar o pedido pelo portal, selecione a opção "Boleto Faturado PJ". A NF-e e os boletos são emitidos e enviados para o e-mail cadastrado.',
    },
    {
      id: 'fat-2',
      categoria: 'faturamento',
      pergunta: 'Onde encontro a 2ª via de boletos e o arquivo XML da Nota Fiscal (NF-e)?',
      resposta:
        'Todos os pedidos faturados contam com a chave de acesso, PDF do DANFE e boleto bancário disponíveis diretamente no painel <a href="/conta/pedidos" style="color: #0f172a; font-weight: 600;">Meus Pedidos</a>. Além disso, o XML é transmitido automaticamente para o e-mail fiscal do seu cadastro no ato do faturamento.',
    },
    {
      id: 'fat-3',
      categoria: 'faturamento',
      pergunta: 'A HWeld aceita cartão BNDES ou FINAME para financiamento de maquinário?',
      resposta:
        'Sim. Financiamos inversores industriais, alimentadores e equipamentos de corte plasma via Cartão BNDES e linhas de crédito industrial. Para simulação e formalização do pedido BNDES, selecione o canal de <a href="/institucional/atendimento" style="color: #0f172a; font-weight: 600;">Vendas Corporativas</a>.',
    },
    {
      id: 'ent-1',
      categoria: 'entrega',
      pergunta: 'Qual o prazo médio de entrega para equipamentos pesados e consumíveis?',
      resposta:
        'Para o estado de São Paulo e Grande SP, pedidos de consumíveis (arames e eletrodos) aprovados até as 13h contam com entrega expressa em até 24h a 48h úteis. Para outros estados e equipamentos pesados com paletização industrial, o prazo médio varia de 3 a 7 dias úteis via transportadora dedicada.',
    },
    {
      id: 'ent-2',
      categoria: 'entrega',
      pergunta: 'Vocês entregam diretamente em canteiros de obras ou filiais com CNPJs distintos?',
      resposta:
        'Sim! No fechamento da compra, você pode especificar o endereço de entrega desejado, mesmo que divirja do endereço da matriz, desde que haja identificação no campo de observações fiscais e preposto autorizado para receber o Conhecimento de Transporte (CT-e).',
    },
    {
      id: 'tab-1',
      categoria: 'tabela',
      pergunta: 'Por que os preços dos produtos variam conforme o login da minha empresa?',
      resposta:
        'A HWeld opera no modelo B2B dinâmico. O portal calcula os impostos (ICMS interestadual, DIFAL e IPI) e aplica a tabela comercial negociada para o seu CNPJ (ex: Distribuidor, Indústria Metalúrgica ou Integrador). Por isso, ao se autenticar, você visualiza os preços líquidos aprovados para sua conta.',
    },
    {
      id: 'tab-2',
      categoria: 'tabela',
      pergunta: 'Os consumíveis (arames e eletrodos) acompanham Certificado de Qualidade?',
      resposta:
        'Sim, 100% dos consumíveis fornecidos pela HWeld acompanham o Certificado de Análise Química e Mecânica conforme normas AWS (American Welding Society) e ASME, com rastreabilidade por número de lote impressa na embalagem e disponível digitalmente.',
    },
    {
      id: 'gar-1',
      categoria: 'garantia',
      pergunta: 'Qual o prazo de garantia das máquinas inversoras de solda?',
      resposta:
        'As fontes e inversores industriais HWeld contam com <strong>24 meses de garantia de fábrica</strong> (sendo 3 meses de garantia legal + 21 meses de garantia contratual contra defeitos de projeto ou fabricação). Para mais detalhes e prazos de tochas e consumíveis, acesse a página de <a href="/institucional/garantia" style="color: #0f172a; font-weight: 600;">Garantia Técnica</a>.',
    },
    {
      id: 'gar-2',
      categoria: 'garantia',
      pergunta: 'Como solicitar assistência técnica para equipamentos em garantia?',
      resposta:
        'Você pode abrir o chamado de R.M.A. pelo canal de Atendimento Técnico com o número da Nota Fiscal em mãos. Nossa equipe agiliza a coleta do equipamento sem custos de transporte e disponibiliza laudo técnico conclusivo em até 5 dias úteis.',
    },
  ];

  itensFiltrados = computed(() => {
    const q = (this.termoBusca() || '').trim().toLowerCase();
    const cat = this.categoriaAtiva();

    return this.faqData.filter((item) => {
      const matchCat = cat === 'todas' || item.categoria === cat;
      const matchBusca =
        !q || item.pergunta.toLowerCase().includes(q) || item.resposta.toLowerCase().includes(q);
      return matchCat && matchBusca;
    });
  });

  toggle(id: string): void {
    this.itemAberto.update((curr) => (curr === id ? null : id));
  }
}
