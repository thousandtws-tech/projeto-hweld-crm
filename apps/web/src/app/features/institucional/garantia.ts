import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HwInstitucionalNav } from './institucional-nav';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HwInstitucionalNav],
  templateUrl: './garantia.html',
  styleUrl: './garantia.scss',
})
export class GarantiaPage {}
