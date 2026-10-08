import { Component, computed, signal } from '@angular/core';
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
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, HwInstitucionalNav],
  template: `
    <div class="institucional-layout">
      <hw-institucional-nav paginaAtual="Central de Ajuda & FAQ" />

      <main class="institucional-conteudo">
        <header class="pagina-topo">
          <span class="tag-secao">Dúvidas Frequentes</span>
          <h1>Central de Ajuda & FAQ</h1>
          <p class="pagina-sub">
            Encontre respostas imediatas sobre faturamento para empresas, prazos de entrega, garantias e pedidos no portal.
          </p>

          <!-- Busca Instantânea no FAQ -->
          <div class="faq-busca-box">
            <span class="material-symbols-outlined busca-icone">search</span>
            <input
              type="search"
              [formControl]="buscaCtrl"
              placeholder="Digite sua dúvida (ex: boleto faturado, prazo, garantia, xml)..."
              aria-label="Buscar pergunta no FAQ"
            />
            @if (buscaCtrl.value) {
              <button type="button" class="btn-limpar" (click)="buscaCtrl.setValue('')" aria-label="Limpar">
                <span class="material-symbols-outlined">close</span>
              </button>
            }
          </div>
        </header>

        <!-- Filtros por Categoria -->
        <div class="categorias-pills">
          @for (cat of categorias; track cat.id) {
            <button
              type="button"
              class="cat-pill"
              [class.ativo]="categoriaAtiva() === cat.id"
              (click)="categoriaAtiva.set(cat.id)"
            >
              {{ cat.nome }}
            </button>
          }
        </div>

        <!-- Lista de Perguntas (Acordeão) -->
        <div class="faq-lista" role="region" aria-label="Lista de dúvidas">
          @for (item of itensFiltrados(); track item.id) {
            <div class="faq-item" [class.aberto]="itemAberto() === item.id">
              <button
                type="button"
                class="faq-trigger"
                (click)="toggle(item.id)"
                [attr.aria-expanded]="itemAberto() === item.id"
              >
                <span class="faq-pergunta">{{ item.pergunta }}</span>
                <span class="material-symbols-outlined faq-seta" aria-hidden="true">
                  {{ itemAberto() === item.id ? 'remove' : 'add' }}
                </span>
              </button>
              @if (itemAberto() === item.id) {
                <div class="faq-resposta">
                  <p [innerHTML]="item.resposta"></p>
                </div>
              }
            </div>
          }
          @if (itensFiltrados().length === 0) {
            <div class="faq-vazio">
              <span class="material-symbols-outlined">help_center</span>
              <strong>Nenhuma dúvida encontrada para "{{ buscaCtrl.value }}"</strong>
              <p>Tente outros termos ou entre em contato diretamente com nossa equipe de suporte.</p>
              <a routerLink="/institucional/atendimento" class="btn-contatar">Falar com o Atendimento</a>
            </div>
          }
        </div>

        <!-- Box de Dúvidas Não Resolvidas -->
        <div class="suporte-box">
          <div class="suporte-esq">
            <span class="material-symbols-outlined suporte-icon">support_agent</span>
            <div>
              <strong>Ainda precisa de ajuda especializada?</strong>
              <p>Nossa equipe de consultores técnicos e comerciais atende de Segunda a Sexta das 08h às 18h.</p>
            </div>
          </div>
          <a routerLink="/institucional/atendimento" class="btn-suporte">Contatar Consultor</a>
        </div>
      </main>
    </div>
  `,
  styles: `
    .institucional-layout {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 36px;
      align-items: start;
    }
    .institucional-conteudo {
      display: flex;
      flex-direction: column;
      gap: 28px;
      min-width: 0;
    }

    .pagina-topo {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tag-secao {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0f172a;
      margin: 0;
    }
    .pagina-sub {
      font-size: 14.5px;
      color: #475569;
      line-height: 1.5;
      margin: 0 0 8px;
      max-width: 65ch;
    }

    /* Caixa de Busca */
    .faq-busca-box {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      height: 46px;
      padding: 0 14px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      transition: all 120ms ease;

      &:focus-within {
        border-color: #0f172a;
        box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.06);
      }

      .busca-icone { font-size: 20px; color: #64748b; }

      input {
        flex: 1;
        height: 100%;
        border: 0;
        outline: none;
        font-family: inherit;
        font-size: 14px;
        color: #0f172a;
        background: transparent;
      }

      .btn-limpar {
        background: transparent;
        border: 0;
        color: #94a3b8;
        cursor: pointer;
        display: grid;
        place-items: center;
        padding: 0;
        .material-symbols-outlined { font-size: 18px; }
        &:hover { color: #0f172a; }
      }
    }

    /* Pílulas de Categoria */
    .categorias-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .cat-pill {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 12.5px;
      font-weight: 500;
      color: #475569;
      cursor: pointer;
      transition: all 120ms ease;

      &:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      &.ativo {
        background: #0f172a;
        border-color: #0f172a;
        color: #ffffff;
        font-weight: 600;
      }
    }

    /* Acordeão */
    .faq-lista {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .faq-item {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      transition: border-color 120ms ease;

      &.aberto {
        border-color: #cbd5e1;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
      }
    }
    .faq-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      width: 100%;
      padding: 16px 20px;
      background: transparent;
      border: 0;
      text-align: left;
      cursor: pointer;
      color: #0f172a;
      font-family: inherit;

      &:hover {
        background: #fafbfc;
      }
    }
    .faq-pergunta {
      font-size: 14.5px;
      font-weight: 600;
      line-height: 1.35;
    }
    .faq-seta {
      font-size: 20px;
      color: #64748b;
      flex-shrink: 0;
    }

    .faq-resposta {
      padding: 0 20px 18px;
      border-top: 1px solid #f8fafc;
      font-size: 13.5px;
      color: #475569;
      line-height: 1.6;

      p { margin: 0; }
    }

    .faq-vazio {
      text-align: center;
      padding: 40px 20px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;

      .material-symbols-outlined { font-size: 40px; color: #94a3b8; }
      strong { font-size: 15px; color: #0f172a; }
      p { font-size: 13px; color: #64748b; margin: 0 0 12px; }
      .btn-contatar {
        padding: 8px 16px;
        background: #0f172a;
        color: #ffffff;
        border-radius: 6px;
        font-size: 12.5px;
        font-weight: 600;
        text-decoration: none;
      }
    }

    /* Box de Suporte Inferior */
    .suporte-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 22px;
      flex-wrap: wrap;
    }
    .suporte-esq {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .suporte-icon {
      font-size: 28px;
      color: #0f172a;
      flex-shrink: 0;
    }
    .suporte-esq strong {
      font-size: 14px;
      color: #0f172a;
      display: block;
    }
    .suporte-esq p {
      font-size: 12.5px;
      color: #64748b;
      margin: 2px 0 0;
    }
    .btn-suporte {
      display: inline-flex;
      align-items: center;
      height: 38px;
      padding: 0 18px;
      border-radius: 8px;
      background: #0f172a;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: background 120ms ease;
      &:hover { background: #1e293b; }
    }

    @media (max-width: 860px) {
      .institucional-layout { grid-template-columns: 1fr; gap: 20px; }
      .suporte-box { flex-direction: column; align-items: flex-start; }
      .btn-suporte { width: 100%; justify-content: center; }
    }
  `,
})
export class FaqPage {
  buscaCtrl = new FormControl('');
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
      resposta: 'O faturamento a prazo (28, 56 ou 84 dias) é concedido para clientes cadastrados com CNPJ ativo e aprovação prévia de crédito por nossa mesa financeira. Ao finalizar o pedido pelo portal, selecione a opção "Boleto Faturado PJ". A NF-e e os boletos são emitidos e enviados para o e-mail cadastrado.',
    },
    {
      id: 'fat-2',
      categoria: 'faturamento',
      pergunta: 'Onde encontro a 2ª via de boletos e o arquivo XML da Nota Fiscal (NF-e)?',
      resposta: 'Todos os pedidos faturados contam com a chave de acesso, PDF do DANFE e boleto bancário disponíveis diretamente no painel <a href="/conta/pedidos" style="color: #0f172a; font-weight: 600;">Meus Pedidos</a>. Além disso, o XML é transmitido automaticamente para o e-mail fiscal do seu cadastro no ato do faturamento.',
    },
    {
      id: 'fat-3',
      categoria: 'faturamento',
      pergunta: 'A HWeld aceita cartão BNDES ou FINAME para financiamento de maquinário?',
      resposta: 'Sim. Financiamos inversores industriais, alimentadores e equipamentos de corte plasma via Cartão BNDES e linhas de crédito industrial. Para simulação e formalização do pedido BNDES, selecione o canal de <a href="/institucional/atendimento" style="color: #0f172a; font-weight: 600;">Vendas Corporativas</a>.',
    },
    {
      id: 'ent-1',
      categoria: 'entrega',
      pergunta: 'Qual o prazo médio de entrega para equipamentos pesados e consumíveis?',
      resposta: 'Para o estado de São Paulo e Grande SP, pedidos de consumíveis (arames e eletrodos) aprovados até as 13h contam com entrega expressa em até 24h a 48h úteis. Para outros estados e equipamentos pesados com paletização industrial, o prazo médio varia de 3 a 7 dias úteis via transportadora dedicada.',
    },
    {
      id: 'ent-2',
      categoria: 'entrega',
      pergunta: 'Vocês entregam diretamente em canteiros de obras ou filiais com CNPJs distintos?',
      resposta: 'Sim! No fechamento da compra, você pode especificar o endereço de entrega desejado, mesmo que divirja do endereço da matriz, desde que haja identificação no campo de observações fiscais e preposto autorizado para receber o Conhecimento de Transporte (CT-e).',
    },
    {
      id: 'tab-1',
      categoria: 'tabela',
      pergunta: 'Por que os preços dos produtos variam conforme o login da minha empresa?',
      resposta: 'A HWeld opera no modelo B2B dinâmico. O portal calcula os impostos (ICMS interestadual, DIFAL e IPI) e aplica a tabela comercial negociada para o seu CNPJ (ex: Distribuidor, Indústria Metalúrgica ou Integrador). Por isso, ao se autenticar, você visualiza os preços líquidos aprovados para sua conta.',
    },
    {
      id: 'tab-2',
      categoria: 'tabela',
      pergunta: 'Os consumíveis (arames e eletrodos) acompanham Certificado de Qualidade?',
      resposta: 'Sim, 100% dos consumíveis fornecidos pela HWeld acompanham o Certificado de Análise Química e Mecânica conforme normas AWS (American Welding Society) e ASME, com rastreabilidade por número de lote impressa na embalagem e disponível digitalmente.',
    },
    {
      id: 'gar-1',
      categoria: 'garantia',
      pergunta: 'Qual o prazo de garantia das máquinas inversoras de solda?',
      resposta: 'As fontes e inversores industriais HWeld contam com <strong>24 meses de garantia de fábrica</strong> (sendo 3 meses de garantia legal + 21 meses de garantia contratual contra defeitos de projeto ou fabricação). Para mais detalhes e prazos de tochas e consumíveis, acesse a página de <a href="/institucional/garantia" style="color: #0f172a; font-weight: 600;">Garantia Técnica</a>.',
    },
    {
      id: 'gar-2',
      categoria: 'garantia',
      pergunta: 'Como solicitar assistência técnica para equipamentos em garantia?',
      resposta: 'Você pode abrir o chamado de R.M.A. pelo canal de Atendimento Técnico com o número da Nota Fiscal em mãos. Nossa equipe agiliza a coleta do equipamento sem custos de transporte e disponibiliza laudo técnico conclusivo em até 5 dias úteis.',
    },
  ];

  itensFiltrados = computed(() => {
    const q = (this.buscaCtrl.value || '').trim().toLowerCase();
    const cat = this.categoriaAtiva();

    return this.faqData.filter((item) => {
      const matchCat = cat === 'todas' || item.categoria === cat;
      const matchBusca =
        !q ||
        item.pergunta.toLowerCase().includes(q) ||
        item.resposta.toLowerCase().includes(q);
      return matchCat && matchBusca;
    });
  });

  toggle(id: string): void {
    this.itemAberto.update((curr) => (curr === id ? null : id));
  }
}
