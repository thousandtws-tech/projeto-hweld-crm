import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { BuscaService } from '../../core/servicos';
import { SugestaoBusca } from '../../core/models';

/** Busca instantânea do cabeçalho com flyout de sugestões. */
@Component({
  selector: 'hw-search-box',
  imports: [ReactiveFormsModule],
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
})
export class HwSearchBox {
  private busca = inject(BuscaService);
  private router = inject(Router);

  readonly buscaCtrl = new FormControl('');
  readonly sugestoes = signal<SugestaoBusca[]>([]);
  readonly buscaFoco = signal(false);

  constructor() {
    this.buscaCtrl.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe((q) => {
      const termo = (q ?? '').trim();
      if (termo.length < 2) {
        this.sugestoes.set([]);
        return;
      }
      this.busca
        .sugestoes(termo)
        .then((s) => this.sugestoes.set(s))
        .catch(() => this.sugestoes.set([]));
    });
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
