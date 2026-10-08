import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { NotificacoesService } from '../core/notificacoes';

/** Sino de notificações da topbar — badge + dropdown persistente. */
@Component({
  selector: 'app-sino',
  standalone: true,
  imports: [NgbDropdownModule, DatePipe],
  template: `
    <div class="sino" ngbDropdown placement="bottom-end" container="body"
         (openChange)="abriu($event)">
      <button type="button" class="sino-btn" ngbDropdownToggle
              aria-label="Notificações" [attr.aria-expanded]="false">
        <i class="bi bi-bell" aria-hidden="true"></i>
        @if (svc.naoLidas() > 0) {
          <span class="badge" aria-label="{{ svc.naoLidas() }} não lidas">
            {{ svc.naoLidas() > 99 ? '99+' : svc.naoLidas() }}
          </span>
        }
      </button>
      <div class="dropdown-menu sino-menu" ngbDropdownMenu>
        <div class="sino-head">
          <strong>Notificações</strong>
          @if (svc.naoLidas() > 0) {
            <button type="button" class="btn btn-link btn-sm p-0" (click)="svc.marcarTodas()">
              Marcar todas lidas
            </button>
          }
        </div>
        <div class="sino-list" role="list">
          @if (svc.itens().length === 0) {
            <p class="sino-vazio">Nenhuma notificação.</p>
          }
          @for (n of svc.itens(); track n.id) {
            <button type="button" class="sino-item" role="listitem"
                    [class.nao-lida]="!n.lida_em" (click)="svc.abrir(n)">
              <span class="dot" [class.ativo]="!n.lida_em" aria-hidden="true"></span>
              <span class="txt">
                <strong>{{ n.titulo }}</strong>
                <small>{{ n.mensagem }}</small>
                <time>{{ n.created_at | date:'dd/MM HH:mm' }}</time>
              </span>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .sino-btn { position: relative; border: none; background: none; padding: 6px 10px;
      border-radius: var(--hw-radius-sm); cursor: pointer; color: var(--hw-text-2);
      font-size: 1.05rem; }
    .sino-btn:hover { background: var(--hw-surface); }
    .sino-btn::after { display: none; }
    .badge { position: absolute; top: 0; right: 0; min-width: 17px; height: 17px;
      border-radius: 9px; background: var(--hw-danger); color: #fff;
      font-size: .65rem; font-weight: 700; display: grid; place-items: center;
      padding: 0 4px; }
    .sino-menu { min-width: 340px; max-width: 380px; padding: 0; overflow: hidden; }
    .sino-head { display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; border-bottom: 1px solid var(--hw-border);
      font-size: .85rem; }
    .sino-list { max-height: 380px; overflow-y: auto; }
    .sino-vazio { padding: var(--hw-space-6); text-align: center;
      color: var(--hw-text-3); font-size: .85rem; margin: 0; }
    .sino-item { display: flex; gap: 10px; width: 100%; border: none; background: none;
      text-align: left; padding: 10px 14px; cursor: pointer;
      border-bottom: 1px solid var(--hw-border); }
    .sino-item:last-child { border-bottom: none; }
    .sino-item:hover { background: var(--hw-surface); }
    .sino-item.nao-lida { background: rgb(29 79 216 / 5%); }
    .sino-item .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px;
      flex-shrink: 0; background: transparent; }
    .sino-item .dot.ativo { background: var(--hw-accent); }
    .sino-item .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .sino-item strong { font-size: .82rem; color: var(--hw-text); }
    .sino-item small { font-size: .78rem; color: var(--hw-text-2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sino-item time { font-size: .7rem; color: var(--hw-text-3); }
  `,
})
export class SinoNotificacoes {
  readonly svc = inject(NotificacoesService);

  abriu(aberto: boolean): void {
    if (aberto) void this.svc.atualizar();
  }
}
