import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Banner de Newsletter e Ofertas VIP Industriais */
@Component({
  selector: 'hw-newsletter-banner',
  imports: [FormsModule],
  templateUrl: './newsletter-banner.html',
  styleUrl: './newsletter-banner.scss',
})
export class HwNewsletterBanner {
  email = '';
  inscrito = signal(false);

  inscrever(e: Event): void {
    e.preventDefault();
    if (this.email && this.email.includes('@')) {
      this.inscrito.set(true);
    }
  }
}
