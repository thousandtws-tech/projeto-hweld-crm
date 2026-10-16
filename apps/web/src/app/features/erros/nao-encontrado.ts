import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HwButton } from '../../shared/ui/button';
import { HwEmpty } from '../../shared/ui/empty';

/** S13 — 404 genérico do portal. */
@Component({
  imports: [RouterLink, HwButton, HwEmpty],
  templateUrl: './nao-encontrado.html',
})
export class NaoEncontradoPage {}
