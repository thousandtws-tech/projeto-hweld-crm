import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HwInstitucionalNav } from './institucional-nav';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HwInstitucionalNav],
  templateUrl: './privacidade.html',
  styleUrl: './privacidade.scss',
})
export class PrivacidadePage {}
