import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ContaService } from '../../core/servicos';
import { MeuPerfil } from '../../core/models';
import { HwSkeleton } from '../../shared/ui/skeleton';
import { CnpjPipe } from '../../shared/ui/cnpj.pipe';
import { HwContaNav } from './conta-nav';

/** S11 — Minha conta: dados cadastrais, empresa e tabela comercial. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HwSkeleton, HwContaNav, CnpjPipe],
  templateUrl: './conta.html',
  styleUrl: './conta.scss',
})
export class ContaPage implements OnInit {
  private conta = inject(ContaService);
  perfil = signal<MeuPerfil | null>(null);

  ngOnInit(): void {
    void this.conta
      .me()
      .then((p) => this.perfil.set(p))
      .catch(() => {});
  }
}
