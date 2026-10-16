import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HwInstitucionalNav } from './institucional-nav';

@Component({
  imports: [RouterLink, HwInstitucionalNav],
  templateUrl: './garantia.html',
  styleUrl: './garantia.scss',
})
export class GarantiaPage {}
