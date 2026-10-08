import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HwInstitucionalNav } from './institucional-nav';

@Component({
  standalone: true,
  imports: [RouterLink, HwInstitucionalNav],
  template: `
    <div class="institucional-layout">
      <hw-institucional-nav paginaAtual="Garantia de Equipamentos" />

      <main class="institucional-conteudo">
        <header class="pagina-topo">
          <span class="tag-secao">Qualidade & Confiabilidade</span>
          <h1>Garantia Técnica de Equipamentos</h1>
          <p class="pagina-sub">
            Conheça as condições, prazos e procedimentos da garantia industrial HWeld para máquinas de solda, corte plasma e acessórios.
          </p>
        </header>

        <!-- Tabela Resumo de Prazos de Garantia -->
        <section class="tabela-secao">
          <h2 class="secao-tit">Prazos de Garantia por Linha de Produto</h2>
          <div class="tabela-card">
            <table class="garantia-tabela">
              <thead>
                <tr>
                  <th>Linha de Equipamento</th>
                  <th>Garantia Legal</th>
                  <th>Garantia Contratual HWeld</th>
                  <th>Garantia Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Fontes Inversoras MIG/MAG e TIG Industriais</strong>
                    <span>Linhas Pro, Pulsada e Synergy</span>
                  </td>
                  <td class="hw-numeric">90 dias</td>
                  <td class="hw-numeric">21 meses</td>
                  <td><span class="badge-prazo destaque">24 Meses (2 Anos)</span></td>
                </tr>
                <tr>
                  <td>
                    <strong>Sistemas de Corte Plasma Manual & CNC</strong>
                    <span>Equipamentos com tocha de alta frequência</span>
                  </td>
                  <td class="hw-numeric">90 dias</td>
                  <td class="hw-numeric">9 meses</td>
                  <td><span class="badge-prazo">12 Meses (1 Ano)</span></td>
                </tr>
                <tr>
                  <td>
                    <strong>Máquinas de Solda Eletrodo Revestido (MMA)</strong>
                    <span>Modelos portáteis e serralheria</span>
                  </td>
                  <td class="hw-numeric">90 dias</td>
                  <td class="hw-numeric">9 meses</td>
                  <td><span class="badge-prazo">12 Meses (1 Ano)</span></td>
                </tr>
                <tr>
                  <td>
                    <strong>Tochas MIG, TIG e Plasma & Reguladores de Pressão</strong>
                    <span>Equipamentos periféricos</span>
                  </td>
                  <td class="hw-numeric">90 dias</td>
                  <td class="hw-numeric">90 dias</td>
                  <td><span class="badge-prazo">6 Meses</span></td>
                </tr>
                <tr>
                  <td>
                    <strong>Consumíveis e Peças de Desgaste Natural</strong>
                    <span>Bicos de contato, bocais, difusores e eletrodos</span>
                  </td>
                  <td class="hw-numeric">90 dias</td>
                  <td>—</td>
                  <td><span class="badge-prazo muted">90 Dias (Legal)</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- O que Cobre vs O que Não Cobre -->
        <section class="cobertura-secao">
          <h2 class="secao-tit">Condições de Cobertura da Garantia</h2>
          <div class="cobertura-grid">
            <div class="cobertura-card cobre">
              <div class="card-cabecalho">
                <span class="material-symbols-outlined icon-status">check_circle</span>
                <strong>O que a Garantia HWeld Cobre</strong>
              </div>
              <ul>
                <li>Defeitos de fabricação em placas eletrônicas e componentes internos;</li>
                <li>Falhas em transformadores, reatores e módulos IGBT de potência;</li>
                <li>Vícios de montagem ou soldas frias de circuitos;</li>
                <li>Mão de obra especializada gratuita na rede de assistência autorizada;</li>
                <li>Substituição por peças originais de fábrica sem qualquer ônus.</li>
              </ul>
            </div>

            <div class="cobertura-card nao-cobre">
              <div class="card-cabecalho">
                <span class="material-symbols-outlined icon-status">cancel</span>
                <strong>O que Não é Coberto pela Garantia</strong>
              </div>
              <ul>
                <li>Danos causados por ligação em tensão elétrica inadequada (ex: 380V em 220V);</li>
                <li>Quedas, batidas mecânicas, entrada de água ou fluidos corrosivos;</li>
                <li>Acúmulo excessivo de poeira metálica por falta de limpeza preventiva;</li>
                <li>Violação de lacres ou conserto por oficina não homologada pela HWeld;</li>
                <li>Desgaste natural de cabos, garras terra e alicates porta-eletrodo.</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Como Acionar o R.M.A. (Assistência Técnica) -->
        <section class="rma-secao">
          <h2 class="secao-tit">Como Acionar a Assistência Técnica (R.M.A.)</h2>
          <div class="rma-passos">
            <div class="rma-passo">
              <span class="rma-num">1</span>
              <div>
                <strong>Localize a Nota Fiscal</strong>
                <p>O comprovante de compra ou NF-e é obrigatório para comprovação do período de garantia.</p>
              </div>
            </div>

            <div class="rma-passo">
              <span class="rma-num">2</span>
              <div>
                <strong>Abertura do Chamado</strong>
                <p>Entre em contato pelo e-mail ou WhatsApp informando o número de série da máquina e o sintoma da falha.</p>
              </div>
            </div>

            <div class="rma-passo">
              <span class="rma-num">3</span>
              <div>
                <strong>Envio ou Visita Técnica</strong>
                <p>Nossa engenharia emite a autorização de transporte ou indica o posto autorizado mais próximo da sua indústria.</p>
              </div>
            </div>

            <div class="rma-passo">
              <span class="rma-num">4</span>
              <div>
                <strong>Laudo & Devolução</strong>
                <p>Em até 5 dias úteis, o equipamento é inspecionado, reparado com peças genuínas e retornado pronto para operação.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Box CTA de Acionamento -->
        <div class="garantia-cta">
          <div>
            <h3>Precisa acionar a garantia ou tirar dúvidas técnicas?</h3>
            <p>Nossos engenheiros de aplicação estão disponíveis para atendimento rápido.</p>
          </div>
          <div class="botoes-cta">
            <a routerLink="/institucional/atendimento" class="btn-acao primario">Abrir Chamado de Garantia</a>
            <a href="tel:1135089979" class="btn-acao secundario hw-numeric">Ligar (11) 3508-9979</a>
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

    /* Tabela */
    .tabela-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow-x: auto;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
    }
    .garantia-tabela {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;

      th {
        background: #f8fafc;
        padding: 14px 16px;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        border-bottom: 1px solid #e2e8f0;
        white-space: nowrap;
      }

      td {
        padding: 14px 16px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
        vertical-align: middle;

        strong { display: block; color: #0f172a; font-size: 13.5px; }
        span { font-size: 11.5px; color: #64748b; }
      }

      tr:last-child td { border-bottom: 0; }
    }
    .badge-prazo {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      background: #f1f5f9;
      color: #0f172a;
      white-space: nowrap;

      &.destaque {
        background: #0f172a;
        color: #ffffff;
      }
      &.muted {
        color: #64748b;
        font-weight: 500;
      }
    }

    /* Cobertura */
    .cobertura-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .cobertura-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;

      ul {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        li { font-size: 13px; color: #475569; line-height: 1.45; }
      }

      &.cobre {
        border-top: 3px solid #059669;
        .icon-status { color: #059669; }
      }
      &.nao-cobre {
        border-top: 3px solid #dc2626;
        .icon-status { color: #dc2626; }
      }
    }
    .card-cabecalho {
      display: flex;
      align-items: center;
      gap: 10px;
      strong { font-size: 15px; color: #0f172a; }
      .icon-status { font-size: 22px; }
    }

    /* RMA Passos */
    .rma-passos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }
    .rma-passo {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 16px;
      display: flex;
      gap: 12px;

      strong { font-size: 13.5px; color: #0f172a; display: block; margin-bottom: 3px; }
      p { font-size: 12px; color: #64748b; margin: 0; line-height: 1.4; }
    }
    .rma-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #0f172a;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    /* CTA */
    .garantia-cta {
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
    .botoes-cta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn-acao {
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
      .cobertura-grid { grid-template-columns: 1fr; }
      .garantia-cta { flex-direction: column; align-items: flex-start; }
      .botoes-cta { width: 100%; flex-direction: column; }
      .btn-acao { width: 100%; justify-content: center; }
    }
  `,
})
export class GarantiaPage {}
