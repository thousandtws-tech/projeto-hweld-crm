import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDividerModule } from '@angular/material/divider';

/** Rodapé institucional do portal (links, SEO, marcas A–Z e dados legais). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'hw-shell-footer',
  imports: [RouterLink, MatDividerModule],
  templateUrl: './shell-footer.html',
  styleUrl: './shell-footer.scss',
})
export class HwShellFooter {
  readonly alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
}
