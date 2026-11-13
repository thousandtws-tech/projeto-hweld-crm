import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, from, of, switchMap } from 'rxjs';
import { BuscaService } from '../../core/servicos';
import { SugestaoBusca } from '../../core/models';

/** Busca instantânea do cabeçalho com flyout de sugestões. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-search-box',
  imports: [ReactiveFormsModule],
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
})
export class HwSearchBox {
  private busca = inject(BuscaService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly buscaCtrl = new FormControl('');
  readonly sugestoes = signal<SugestaoBusca[]>([]);
  readonly buscaFoco = signal(false);

  constructor() {
    // switchMap cancela a requisição anterior: respostas lentas fora de
    // ordem nunca sobrescrevem sugestões de um termo mais recente.
    this.buscaCtrl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const termo = (q ?? '').trim();
          if (termo.length < 2) return of([] as SugestaoBusca[]);
          return from(this.busca.sugestoes(termo)).pipe(
            catchError(() => of([] as SugestaoBusca[])),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((s) => this.sugestoes.set(s));
  }

  onBlurBusca(): void {
    setTimeout(() => this.buscaFoco.set(false), 200);
  }

  buscar(termo?: string): void {
    const q = (termo ?? this.buscaCtrl.value ?? '').trim();
    if (!q) return;
    this.sugestoes.set([]);
    this.buscaFoco.set(false);
    void this.router.navigate(['/busca'], { queryParams: { q } });
  }
}
