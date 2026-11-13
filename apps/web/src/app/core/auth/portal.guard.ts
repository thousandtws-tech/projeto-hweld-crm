import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthStore } from './auth.store';

/** Rotas do portal exigem token de contexto `portal:`. */
export const portalGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.autenticado() ? true : router.parseUrl('/login');
};
