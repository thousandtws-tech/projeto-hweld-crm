import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatRippleModule } from '@angular/material/core';
import { ItemCatalogoPortal } from '../../core/models';
import { HwPrice } from './misc';

/**
 * Card de produto minimalista para e-commerce B2B.
 * Focado no produto, tipografia refinada, imagem com micro-interação e preço da tabela do cliente.
 */
@Component({
  selector: 'hw-product-card',
  standalone: true,
  imports: [RouterLink, MatRippleModule, HwPrice],
  template: `
    <a class="card" [routerLink]="['/p', item().id + '-' + item().slug]" mat-ripple>
      <div class="thumb-container">
        @if (imagem(); as img) {
          <img [src]="img" [alt]="item().nome" class="thumb-img" loading="lazy" />
        } @else {
          <div class="sem-img">
            <span class="material-symbols-outlined sem-img-icone" aria-hidden="true">inventory_2</span>
          </div>
        }
        @if (item().marca) {
          <span class="badge-marca">{{ item().marca }}</span>
        }
      </div>

      <div class="card-corpo">
        <div class="meta-row">
          <span class="sku hw-numeric">{{ item().sku }}</span>
          <span class="status-dot ativo" title="Catálogo ativo"></span>
        </div>

        <h3 class="nome" [title]="item().nome">{{ item().nome }}</h3>

        <div class="card-footer">
          <hw-price [valor]="item().preco_efetivo ?? item().preco_venda" [tabela]="'Preço PJ'" />
          <span class="btn-detalhes" aria-hidden="true">
            <span class="material-symbols-outlined">arrow_forward</span>
          </span>
        </div>
      </div>
    </a>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .card {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--hw-surface-raised);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-md);
      color: var(--hw-text);
      text-decoration: none;
      overflow: hidden;
      position: relative;
      transition: all var(--hw-motion-base) var(--hw-motion-ease);
    }
    .card:hover {
      border-color: var(--hw-border-input);
      box-shadow: var(--hw-shadow-hover);
      transform: translateY(-3px);
      text-decoration: none;
    }
    .card:hover .thumb-img {
      transform: scale(1.04);
    }
    .card:hover .btn-detalhes {
      background: var(--hw-accent);
      color: var(--hw-on-accent);
      border-color: var(--hw-accent);
      transform: translateX(2px);
    }
    .thumb-container {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      background: var(--hw-surface);
      overflow: hidden;
      border-bottom: 1px solid var(--hw-border-subtle);
    }
    .thumb-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: var(--hw-space-3);
      transition: transform var(--hw-motion-smooth) var(--hw-motion-ease);
    }
    .sem-img {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      color: var(--hw-text-faint);
    }
    .sem-img-icone {
      font-size: 44px;
    }
    .badge-marca {
      position: absolute;
      top: var(--hw-space-2);
      left: var(--hw-space-2);
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(6px);
      border: 1px solid var(--hw-border);
      border-radius: var(--hw-radius-pill);
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--hw-text-muted);
      letter-spacing: 0.02em;
    }
    .card-corpo {
      display: flex;
      flex-direction: column;
      flex: 1;
      padding: var(--hw-space-3) var(--hw-space-4) var(--hw-space-4);
      gap: var(--hw-space-2);
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sku {
      font-family: var(--hw-font-mono);
      font-size: 11px;
      font-weight: 500;
      color: var(--hw-text-muted);
      letter-spacing: 0.02em;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--hw-text-faint);
    }
    .status-dot.ativo {
      background: var(--hw-success);
    }
    .nome {
      margin: 0;
      font-family: var(--hw-font-sans);
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      color: var(--hw-text);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 40px;
    }
    .card-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin-top: auto;
      padding-top: var(--hw-space-2);
    }
    .btn-detalhes {
      width: 32px;
      height: 32px;
      border-radius: var(--hw-radius-pill);
      border: 1px solid var(--hw-border);
      background: var(--hw-surface);
      color: var(--hw-text-muted);
      display: grid;
      place-items: center;
      transition: all var(--hw-motion-fast) var(--hw-motion-ease);
    }
    .btn-detalhes .material-symbols-outlined {
      font-size: 16px;
    }

    @media (max-width: 640px) {
      .card-corpo {
        padding: 8px 10px 10px;
        gap: 4px;
      }
      .nome {
        font-size: 13px;
        line-height: 18px;
        min-height: 36px;
      }
      .btn-detalhes {
        width: 28px;
        height: 28px;
        .material-symbols-outlined {
          font-size: 14px;
        }
      }
    }
  `,
})
export class HwProductCard {
  item = input.required<ItemCatalogoPortal>();

  imagem(): string | null {
    const p = this.item() as ItemCatalogoPortal & { imagens?: { url: string; is_principal: boolean }[] };
    const principal = p.imagens?.find((i) => i.is_principal) ?? p.imagens?.[0];
    return principal?.url ?? null;
  }
}
