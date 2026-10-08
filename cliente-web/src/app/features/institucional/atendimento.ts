import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HwInstitucionalNav } from './institucional-nav';
import { ToastService } from '../../shared/ui/toast';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, HwInstitucionalNav],
  template: `
    <div class="institucional-layout">
      <hw-institucional-nav paginaAtual="Atendimento ao Cliente" />

      <main class="institucional-conteudo">
        <header class="pagina-topo">
          <span class="tag-secao">Canais Oficiais</span>
          <h1>Atendimento ao Cliente</h1>
          <p class="pagina-sub">
            Estamos prontos para atender a sua indústria com agilidade técnica, cotações corporativas e suporte pós-venda.
          </p>
        </header>

        <!-- Grid de Canais de Contato -->
        <div class="canais-grid">
          <div class="canal-card">
            <div class="canal-icone-box">
              <span class="material-symbols-outlined">headset_mic</span>
            </div>
            <div class="canal-dados">
              <strong>Televendas & Suporte</strong>
              <a href="tel:1135089979" class="canal-valor hw-numeric">(11) 3508-9979</a>
              <span class="canal-desc">Segunda a Sexta das 08h às 18h</span>
            </div>
          </div>

          <div class="canal-card">
            <div class="canal-icone-box">
              <span class="material-symbols-outlined">business_center</span>
            </div>
            <div class="canal-dados">
              <strong>Vendas Corporativas (B2B)</strong>
              <a href="tel:1131856786" class="canal-valor hw-numeric">(11) 3185-6786</a>
              <span class="canal-desc">Grandes contas e compras em escala</span>
            </div>
          </div>

          <div class="canal-card">
            <div class="canal-icone-box">
              <span class="material-symbols-outlined">chat</span>
            </div>
            <div class="canal-dados">
              <strong>WhatsApp Comercial</strong>
              <a href="https://wa.me/551135089979" target="_blank" rel="noopener" class="canal-valor hw-numeric">
                (11) 3508-9979
              </a>
              <span class="canal-desc">Resposta média em menos de 15 minutos</span>
            </div>
          </div>

          <div class="canal-card">
            <div class="canal-icone-box">
              <span class="material-symbols-outlined">mail</span>
            </div>
            <div class="canal-dados">
              <strong>E-mail Corporativo</strong>
              <a href="mailto:corporativo@hweld.com.br" class="canal-valor">corporativo&#64;hweld.com.br</a>
              <span class="canal-desc">Cotações formais e envio de pedidos</span>
            </div>
          </div>
        </div>

        <!-- Formulário de Mensagem -->
        <section class="form-secao">
          <div class="form-header">
            <h2>Envie uma Mensagem</h2>
            <p>Preencha os dados abaixo para direcionarmos sua solicitação ao consultor da sua região.</p>
          </div>

          @if (enviado()) {
            <div class="alerta-sucesso">
              <span class="material-symbols-outlined">check_circle</span>
              <div>
                <strong>Mensagem enviada com sucesso!</strong>
                <p>Nossa equipe técnica entrará em contato em até 2 horas úteis pelo e-mail ou telefone informado.</p>
              </div>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="enviar()" class="form-contato">
              <div class="form-grid">
                <div class="campo-grupo">
                  <label for="empresa">Empresa / Razão Social *</label>
                  <input id="empresa" type="text" formControlName="empresa" placeholder="Nome da sua empresa" />
                  @if (form.controls.empresa.touched && form.controls.empresa.invalid) {
                    <span class="erro-msg">Informe o nome da empresa</span>
                  }
                </div>

                <div class="campo-grupo">
                  <label for="cnpj">CNPJ *</label>
                  <input id="cnpj" type="text" formControlName="cnpj" placeholder="00.000.000/0000-00" class="hw-numeric" />
                  @if (form.controls.cnpj.touched && form.controls.cnpj.invalid) {
                    <span class="erro-msg">Informe o CNPJ</span>
                  }
                </div>

                <div class="campo-grupo">
                  <label for="nome">Nome do Responsável *</label>
                  <input id="nome" type="text" formControlName="nome" placeholder="Seu nome completo" />
                  @if (form.controls.nome.touched && form.controls.nome.invalid) {
                    <span class="erro-msg">Informe seu nome</span>
                  }
                </div>

                <div class="campo-grupo">
                  <label for="email">E-mail Corporativo *</label>
                  <input id="email" type="email" formControlName="email" placeholder="seu.nome@empresa.com.br" />
                  @if (form.controls.email.touched && form.controls.email.invalid) {
                    <span class="erro-msg">Informe um e-mail válido</span>
                  }
                </div>

                <div class="campo-grupo">
                  <label for="telefone">Telefone / WhatsApp *</label>
                  <input id="telefone" type="tel" formControlName="telefone" placeholder="(11) 99999-9999" class="hw-numeric" />
                  @if (form.controls.telefone.touched && form.controls.telefone.invalid) {
                    <span class="erro-msg">Informe um telefone</span>
                  }
                </div>

                <div class="campo-grupo">
                  <label for="assunto">Assunto Principal *</label>
                  <select id="assunto" formControlName="assunto">
                    <option value="cotacao">Cotação de Equipamentos & Inversoras</option>
                    <option value="consumiveis">Fornecimento Recorrente de Consumíveis</option>
                    <option value="faturamento">Dúvidas de Faturamento & Tabela PJ</option>
                    <option value="posvenda">Pós-venda e Acompanhamento de Pedido</option>
                    <option value="assistencia">Assistência Técnica e Garantia</option>
                    <option value="outro">Outros Assuntos</option>
                  </select>
                </div>

                <div class="campo-grupo span-2">
                  <label for="mensagem">Mensagem / Especificações do Pedido *</label>
                  <textarea
                    id="mensagem"
                    rows="4"
                    formControlName="mensagem"
                    placeholder="Descreva os produtos, quantidades ou a sua dúvida técnica..."
                  ></textarea>
                  @if (form.controls.mensagem.touched && form.controls.mensagem.invalid) {
                    <span class="erro-msg">Descreva sua solicitação</span>
                  }
                </div>
              </div>

              <div class="form-acoes">
                <button type="submit" class="btn-enviar" [disabled]="enviando()">
                  <span class="material-symbols-outlined">send</span>
                  <span>{{ enviando() ? 'Enviando mensagem…' : 'Enviar Solicitação' }}</span>
                </button>
              </div>
            </form>
          }
        </section>

        <!-- Informações de Sede & Horários -->
        <section class="sede-secao">
          <div class="sede-card">
            <span class="material-symbols-outlined sede-icon">location_on</span>
            <div>
              <strong>Centro de Distribuição & Fábrica HWeld</strong>
              <p>Av. Industrial, 1500 - Distrito Industrial - São Paulo/SP - CEP 01310-100</p>
              <span class="sede-nota">Visitas técnicas e demonstrações de soldagem mediante agendamento prévio com o departamento de engenharia.</span>
            </div>
          </div>
        </section>
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

    /* Grid de Canais */
    .canais-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .canal-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
      transition: all 150ms ease;

      &:hover {
        border-color: #cbd5e1;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
      }
    }
    .canal-icone-box {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      display: grid;
      place-items: center;
      color: #0f172a;
      flex-shrink: 0;
      .material-symbols-outlined { font-size: 22px; }
    }
    .canal-dados {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;

      strong {
        font-size: 12px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
    }
    .canal-valor {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      &:hover { text-decoration: underline; }
    }
    .canal-desc {
      font-size: 11.5px;
      color: #94a3b8;
    }

    /* Formulário */
    .form-secao {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
    }
    .form-header {
      margin-bottom: 20px;
      h2 {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 4px;
      }
      p {
        font-size: 13px;
        color: #64748b;
        margin: 0;
      }
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .span-2 {
      grid-column: 1 / -1;
    }
    .campo-grupo {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label {
        font-size: 12px;
        font-weight: 600;
        color: #334155;
      }

      input, select, textarea {
        height: 40px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 12px;
        font-family: inherit;
        font-size: 13.5px;
        color: #0f172a;
        background: #ffffff;
        outline: none;
        transition: all 120ms ease;

        &:focus {
          border-color: #0f172a;
          box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.06);
        }
      }

      textarea {
        height: auto;
        padding: 10px 12px;
        resize: vertical;
      }
    }
    .erro-msg {
      font-size: 11px;
      color: #dc2626;
    }

    .form-acoes {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
    .btn-enviar {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      padding: 0 24px;
      border-radius: 8px;
      background: #0f172a;
      color: #ffffff;
      border: 0;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 120ms ease;

      .material-symbols-outlined { font-size: 17px; }
      &:hover:not([disabled]) {
        background: #1e293b;
        transform: translateY(-1px);
      }
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .alerta-sucesso {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 10px;
      padding: 16px;
      color: #065f46;

      .material-symbols-outlined {
        font-size: 24px;
        color: #059669;
        flex-shrink: 0;
      }
      strong { font-size: 14px; font-weight: 700; display: block; }
      p { font-size: 12.5px; margin: 3px 0 0; }
    }

    /* Sede */
    .sede-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;

      .sede-icon {
        font-size: 22px;
        color: #0f172a;
        margin-top: 2px;
        flex-shrink: 0;
      }
      strong {
        font-size: 13.5px;
        color: #0f172a;
        display: block;
      }
      p {
        font-size: 12.5px;
        color: #475569;
        margin: 2px 0 6px;
      }
    }
    .sede-nota {
      font-size: 11.5px;
      color: #94a3b8;
      font-style: italic;
    }

    @media (max-width: 860px) {
      .institucional-layout { grid-template-columns: 1fr; gap: 20px; }
      .form-grid { grid-template-columns: 1fr; }
      .span-2 { grid-column: auto; }
      .btn-enviar { width: 100%; justify-content: center; }
    }
  `,
})
export class AtendimentoPage {
  private toast = inject(ToastService);
  enviado = signal(false);
  enviando = signal(false);

  form = new FormGroup({
    empresa: new FormControl('', [Validators.required]),
    cnpj: new FormControl('', [Validators.required]),
    nome: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    telefone: new FormControl('', [Validators.required]),
    assunto: new FormControl('cotacao', [Validators.required]),
    mensagem: new FormControl('', [Validators.required]),
  });

  enviar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    setTimeout(() => {
      this.enviando.set(false);
      this.enviado.set(true);
      this.toast.ok('Mensagem enviada com sucesso! Em breve entraremos em contato.');
    }, 600);
  }
}
