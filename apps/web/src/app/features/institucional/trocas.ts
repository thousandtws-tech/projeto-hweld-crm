import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HwInstitucionalNav } from './institucional-nav';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HwInstitucionalNav],
  templateUrl: './trocas.html',
  styleUrl: './trocas.scss',
})
export class TrocasPage {}
