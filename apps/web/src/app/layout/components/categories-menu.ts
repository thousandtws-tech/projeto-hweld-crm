import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { CategoriasStore } from '../../core/categorias.store';
import { Categoria } from '../../core/models';

/** Ícone Material por slug de categoria raiz — fallback neutro para não mapeadas. */
const ICONES: Record<string, string> = {
  soldas: 'electric_bolt',
  'maquinas-de-solda': 'precision_manufacturing',
  'consumiveis-de-solda': 'inventory_2',
  'corte-e-goivagem': 'content_cut',
  'gases-e-cilindros': 'propane_tank',
  'epis-seguranca': 'health_and_safety',
  'acessorios-soldagem': 'handyman',
  'abrasivos-acabamento': 'album',
  'ferramentas-eletricas': 'electrical_services',
  'ferramentas-manuais': 'build',
  'quimicos-vedantes': 'science',
  'medicao-instrumentos': 'straighten',
  'automacao-posicionamento': 'smart_toy',
};

/**
 * Menu de categorias — coluna única de departamentos com ícones.
 * `variant="desktop"` → gatilho do cabeçalho; `variant="mobile"` → bottom-nav
 * (no mobile as subcategorias aparecem inline sob cada raiz).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-categories-menu',
  imports: [RouterLink, MatMenuModule],
  templateUrl: './categories-menu.html',
  styleUrl: './categories-menu.scss',
})
export class HwCategoriesMenu implements OnInit {
  readonly store = inject(CategoriasStore);
  readonly variant = input<'desktop' | 'mobile'>('desktop');

  ngOnInit(): void {
    this.store.carregar();
  }

  icone(cat: Categoria): string {
    return ICONES[cat.slug] ?? 'category';
  }
}
