import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HwInstitucionalNav } from './institucional-nav';

@Component({
  standalone: true,
  imports: [RouterLink, HwInstitucionalNav],
  template: `
    <div class="institucional-layout">
      <hw-institucional-nav paginaAtual="Trocas e Devoluções" />

      <main class="institucional-conteudo">
        <header class="pagina-topo">
          <span class="tag-secao">Políticas Corporativas</span>
          <h1>Trocas e Devoluções</h1>
          <p class="pagina-sub">
            Conheça as diretrizes de logística reversa, troca e devolução de mercadorias para clientes pessoa jurídica (PJ).
          </p>
        </header>

        <!-- Passo a Passo Ilustrado -->
        <section class="passos-secao">
          <h2 class="secao-tit">Como funciona a devolução em 4 etapas</h2>
          <div class="passos-grid">
            <div class="passo-card">
              <span class="passo-num">01</span>
              <strong>Abertura do Chamado</strong>
              <p>Envie o número da NF-e, código do item e o motivo da solicitação via portal ou e-mail de suporte.</p>
            </div>

            <div class="passo-card">
              <span class="passo-num">02</span>
              <strong>Autorização de Devolução</strong>
              <p>Nossa equipe fiscal orienta a emissão da Nota Fiscal de Devolução (CFOP de retorno) conforme regras da SEFAZ.</p>
            </div>

            <div class="passo-card">
              <span class="passo-num">03</span>
              <strong>Coleta sem Custos</strong>
              <p>A transportadora parceira realiza a coleta do equipamento ou consumíveis no endereço da sua indústria.</p>
            </div>

            <div class="passo-card">
              <span class="passo-num">04</span>
              <strong>Substituição ou Estorno</strong>
              <p>Após conferência física no CD, emitimos nova mercadoria, crédito comercial ou estorno bancário em até 48h.</p>
            </div>
          </div>
        </section>

        <!-- Motivos e Prazos Legais -->
        <section class="regras-secao">
          <h2 class="secao-tit">Motivos de Devolução & Prazos</h2>

          <div class="regras-grid">
            <div class="regra-card">
              <div class="regra-topo">
                <span class="material-symbols-outlined regra-icon">local_shipping</span>
                <strong>Avaria no Transporte</strong>
              </div>
              <p>
                No momento do recebimento, confira as embalagens e os paletes. Caso identifique caixa amassada, perfurações ou indício de violação:
              </p>
              <ul>
                <li>Recuse a entrega e registre a ressalva no verso do Conhecimento de Transporte (CT-e);</li>
                <li>Caso a avaria seja identificada internamente, notifique nossa equipe em até <strong>48 horas</strong> corridas com fotos.</li>
              </ul>
            </div>

            <div class="regra-card">
              <div class="regra-topo">
                <span class="material-symbols-outlined regra-icon">compare_arrows</span>
                <strong>Divergência de Mercadoria</strong>
              </div>
              <p>
                Caso receba um modelo de inversora, bitola de arame ou especificação de tocha diferente do constante no Pedido de Compra:
              </p>
              <ul>
                <li>Mantenha a mercadoria em sua embalagem original sem violação dos lacres e sem uso;</li>
                <li>Comunique em até <strong>7 dias úteis</strong> para providenciarmos a troca expressa.</li>
              </ul>
            </div>

            <div class="regra-card">
              <div class="regra-topo">
                <span class="material-symbols-outlined regra-icon">undo</span>
                <strong>Direito de Arrependimento</strong>
              </div>
              <p>
                Conforme o Artigo 49 do Código de Defesa do Consumidor e políticas de compras eletrônicas:
              </p>
              <ul>
                <li>Prazo de até <strong>7 dias corridos</strong> após o recebimento;</li>
                <li>O produto deve estar completo com manuais, cabos e acessórios originais;</li>
                <li>Ressarcimento integral de valores pagos incluindo o frete.</li>
              </ul>
            </div>

            <div class="regra-card">
              <div class="regra-topo">
                <span class="material-symbols-outlined regra-icon">build_circle</span>
                <strong>Defeito Técnico / Vício de Fábrica</strong>
              </div>
              <p>
                Se a máquina ou acessório apresentar falha funcional durante a operação:
              </p>
              <ul>
                <li>Até 90 dias: devolução ou reparo prioritário com frete pago pela HWeld;</li>
                <li>Após 90 dias e até 24 meses: atendimento pela rede autorizada sob os termos da <a routerLink="/institucional/garantia" style="color: #0f172a; font-weight: 600;">Garantia de Equipamentos</a>.</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Emissão de Nota Fiscal de Devolução (B2B) -->
        <section class="fiscal-secao">
          <div class="fiscal-card">
            <span class="material-symbols-outlined fiscal-icon">receipt_long</span>
            <div class="fiscal-texto">
              <h3>Orientações Fiscais para Clientes PJ (Contribuintes de ICMS)</h3>
              <p>
                Clientes com Inscrição Estadual ativa devem emitir <strong>Nota Fiscal Própria de Devolução</strong> com destaque de ICMS e IPI idênticos à NF-e de venda da HWeld, referenciando a chave de acesso original.
              </p>
              <p class="fiscal-obs">
                Caso sua empresa seja optante pelo Simples Nacional ou não-contribuinte, nossa equipe fornecerá a minuta de declaração de transporte e o espelho fiscal pronto para emissão.
              </p>
            </div>
          </div>
        </section>

        <!-- CTA para Chamado -->
        <div class="cta-suporte">
          <div>
            <h3>Precisa solicitar uma troca ou devolução agora?</h3>
            <p>Tenha em mãos o número da Nota Fiscal (NF-e) ou acesse o seu painel de pedidos.</p>
          </div>
          <div class="cta-botoes">
            <a routerLink="/conta/pedidos" class="btn-cta primario">Ver Meus Pedidos</a>
            <a routerLink="/institucional/atendimento" class="btn-cta secundario">Falar com o Suporte</a>
          </div>
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
      gap: 32px;
      min-width: 0;
    }

    .pagina-topo {
      display: flex;
      flex-direction: column;
      gap: 6px;
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
      margin: 0;
      max-width: 65ch;
    }

    .secao-tit {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
      margin: 0 0 16px;
    }

    /* Passos */
    .passos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .passo-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;

      strong { font-size: 14px; color: #0f172a; }
      p { font-size: 12.5px; color: #64748b; line-height: 1.45; margin: 0; }
    }
    .passo-num {
      font-family: var(--hw-font-mono, monospace);
      font-size: 20px;
      font-weight: 800;
      color: #cbd5e1;
      line-height: 1;
    }

    /* Regras */
    .regras-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .regra-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;

      p { font-size: 13px; color: #475569; line-height: 1.5; margin: 0; }
      ul {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        li { font-size: 12.5px; color: #334155; line-height: 1.45; }
      }
    }
    .regra-topo {
      display: flex;
      align-items: center;
      gap: 10px;
      strong { font-size: 14.5px; color: #0f172a; }
      .regra-icon { font-size: 22px; color: #0f172a; }
    }

    /* Fiscal */
    .fiscal-card {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;

      .fiscal-icon {
        font-size: 28px;
        color: #0f172a;
        margin-top: 2px;
        flex-shrink: 0;
      }
    }
    .fiscal-texto {
      display: flex;
      flex-direction: column;
      gap: 6px;
      h3 { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0; }
      p { font-size: 13px; color: #475569; line-height: 1.5; margin: 0; }
    }
    .fiscal-obs {
      font-size: 12px !important;
      color: #64748b !important;
    }

    /* CTA */
    .cta-suporte {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      background: #0f172a;
      color: #ffffff;
      border-radius: 14px;
      padding: 24px 28px;
      flex-wrap: wrap;

      h3 { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
      p { font-size: 13px; color: #94a3b8; margin: 0; }
    }
    .cta-botoes {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn-cta {
      display: inline-flex;
      align-items: center;
      height: 40px;
      padding: 0 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: all 120ms ease;

      &.primario {
        background: #ffffff;
        color: #0f172a;
        &:hover { background: #f1f5f9; }
      }
      &.secundario {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        &:hover { background: rgba(255, 255, 255, 0.2); }
      }
    }

    @media (max-width: 860px) {
      .institucional-layout { grid-template-columns: 1fr; gap: 20px; }
      .cta-suporte { flex-direction: column; align-items: flex-start; }
      .cta-botoes { width: 100%; flex-direction: column; }
      .btn-cta { width: 100%; justify-content: center; }
    }
  `,
})
export class TrocasPage {}
