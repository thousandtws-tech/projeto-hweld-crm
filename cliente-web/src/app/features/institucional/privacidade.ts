import { Component } from '@angular/core';
import { HwInstitucionalNav } from './institucional-nav';

@Component({
  standalone: true,
  imports: [HwInstitucionalNav],
  template: `
    <div class="institucional-layout">
      <hw-institucional-nav paginaAtual="LGPD & Privacidade" />

      <main class="institucional-conteudo">
        <header class="pagina-topo">
          <span class="tag-secao">Segurança & Conformidade</span>
          <h1>LGPD & Política de Privacidade</h1>
          <p class="pagina-sub">
            Conheça o nosso compromisso com a proteção de dados corporativos e pessoais, em total conformidade com a Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados).
          </p>
        </header>

        <!-- Destaques de Segurança -->
        <div class="destaques-grid">
          <div class="destaque-card">
            <span class="material-symbols-outlined destaque-icon">lock</span>
            <strong>Criptografia 256-bit</strong>
            <p>Tráfego 100% protegido por protocolo TLS/HTTPS de ponta a ponta em todas as transações.</p>
          </div>

          <div class="destaque-card">
            <span class="material-symbols-outlined destaque-icon">verified</span>
            <strong>Finalidade Exclusiva</strong>
            <p>Dados corporativos utilizados estritamente para faturamento fiscal (NF-e) e logística de entrega.</p>
          </div>

          <div class="destaque-card">
            <span class="material-symbols-outlined destaque-icon">block</span>
            <strong>Sem Venda de Dados</strong>
            <p>A HWeld jamais comercializa, aluga ou cede informações cadastrais de clientes a terceiros.</p>
          </div>

          <div class="destaque-card">
            <span class="material-symbols-outlined destaque-icon">shield_person</span>
            <strong>Canal DPO Ativo</strong>
            <p>Encarregado de Proteção de Dados à disposição para atender solicitações em até 15 dias corridos.</p>
          </div>
        </div>

        <!-- Seções do Documento -->
        <div class="termos-corpo">
          <section class="termo-secao">
            <h2>1. Controlador dos Dados & Identificação</h2>
            <p>
              A <strong>HWeld Tecnologia em Soldagem S.A.</strong>, inscrita no CNPJ sob nº 12.345.678/0001-90, com sede na Av. Industrial, 1500, Distrito Industrial, São Paulo/SP, figura como Controladora dos dados coletados durante a navegação e operações comerciais no portal B2B.
            </p>
          </section>

          <section class="termo-secao">
            <h2>2. Dados Coletados & Finalidade do Tratamento</h2>
            <p>Tratamos apenas os dados indispensáveis para o relacionamento B2B:</p>
            <ul>
              <li><strong>Dados Cadastrais da Empresa:</strong> Razão Social, Nome Fantasia, CNPJ, Inscrição Estadual, endereço fiscal e de entrega para emissão legal de Documentos Fiscais Eletrônicos (NF-e, MDF-e);</li>
              <li><strong>Dados de Contato dos Prepostos:</strong> Nome completo, cargo, e-mail corporativo e telefone comercial para confirmação de cotações, envio de boletos e alinhamento logístico;</li>
              <li><strong>Registros Eletrônicos (Logs):</strong> Endereço IP, data e hora de acesso, mantidos em conformidade com o Artigo 15 do Marco Civil da Internet (Lei nº 12.965/2014) para prevenção a fraudes corporativas.</li>
            </ul>
          </section>

          <section class="termo-secao">
            <h2>3. Compartilhamento Responsável de Dados</h2>
            <p>
              O compartilhamento de dados ocorre exclusivamente com operadores homologados sob rigorosos acordos de confidencialidade (NDAs):
            </p>
            <ul>
              <li><strong>Órgãos Fiscais e Governamentais:</strong> Secretarias de Estado da Fazenda (SEFAZ) e Receita Federal do Brasil para validação de notas fiscais e tributos;</li>
              <li><strong>Operadores Logísticos:</strong> Transportadoras parceiras para a efetivação física da entrega da carga e emissão do Conhecimento de Transporte (CT-e);</li>
              <li><strong>Instituições Financeiras:</strong> Bancos emissores para geração e registro de boletos bancários PJ e liquidação de pagamentos.</li>
            </ul>
          </section>

          <section class="termo-secao">
            <h2>4. Armazenamento, Retenção & Medidas de Segurança</h2>
            <p>
              Os dados são armazenados em infraestrutura de nuvem certificada (ISO 27001 e SOC 2) com controle rígido de privilégios de acesso baseado em funções (RBAC), registro de auditoria imutável e backup redundante. Dados fiscais são retidos pelo prazo legal obrigatório de 5 anos conforme previsto no Código Tributário Nacional.
            </p>
          </section>

          <section class="termo-secao">
            <h2>5. Direitos do Titular & Canal do Encarregado (DPO)</h2>
            <p>
              A qualquer momento, o titular dos dados cadastrados pode exercer seus direitos previstos no Artigo 18 da LGPD (confirmação da existência de tratamento, acesso, correção de dados incompletos ou inexatos, anonimização ou exclusão quando cabível).
            </p>
          </section>
        </div>

        <!-- Box Canal DPO -->
        <div class="dpo-box">
          <div class="dpo-info">
            <span class="material-symbols-outlined dpo-icon">admin_panel_settings</span>
            <div>
              <h3>Canal do Encarregado de Dados (DPO)</h3>
              <p>Para dúvidas sobre privacidade, revogação de consentimento ou solicitações da LGPD:</p>
              <a href="mailto:dpo@hweld.com.br" class="dpo-email">dpo&#64;hweld.com.br</a>
            </div>
          </div>
          <span class="dpo-prazo">Prazo de resposta: até 15 dias corridos (Art. 19 da LGPD)</span>
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

    /* Destaques */
    .destaques-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
    }
    .destaque-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;

      strong { font-size: 13.5px; color: #0f172a; }
      p { font-size: 12px; color: #64748b; line-height: 1.45; margin: 0; }
    }
    .destaque-icon {
      font-size: 24px;
      color: #0f172a;
      margin-bottom: 2px;
    }

    /* Termos */
    .termos-corpo {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .termo-secao {
      display: flex;
      flex-direction: column;
      gap: 8px;

      h2 {
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
        margin: 0;
      }
      p {
        font-size: 13.5px;
        color: #475569;
        line-height: 1.6;
        margin: 0;
      }
      ul {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        li { font-size: 13px; color: #334155; line-height: 1.5; }
      }
    }

    /* DPO */
    .dpo-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px 24px;
      flex-wrap: wrap;
    }
    .dpo-info {
      display: flex;
      align-items: flex-start;
      gap: 14px;

      .dpo-icon {
        font-size: 28px;
        color: #0f172a;
        margin-top: 2px;
        flex-shrink: 0;
      }
      h3 { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 2px; }
      p { font-size: 12.5px; color: #64748b; margin: 0 0 6px; }
    }
    .dpo-email {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
    .dpo-prazo {
      font-size: 11.5px;
      color: #94a3b8;
    }

    @media (max-width: 860px) {
      .institucional-layout { grid-template-columns: 1fr; gap: 20px; }
      .termos-corpo { padding: 20px; }
      .dpo-box { flex-direction: column; align-items: flex-start; }
    }
  `,
})
export class PrivacidadePage {}
