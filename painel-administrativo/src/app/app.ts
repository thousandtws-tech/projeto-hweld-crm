import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/ui/toast';

@Component({
  imports: [RouterOutlet, ToastHost],
  selector: 'app-root',
  template: `<router-outlet /><hw-toast-host />`,
})
export class App {}
