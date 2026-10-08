import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthStore } from './auth';
import { Perfil } from './models';

/** Qualquer staff autenticado. */
export const staffGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.autenticado() ? true : router.parseUrl('/login');
};

/** RBAC por perfil: `data: { perfis: ['admin','financeiro'] }` na rota. */
export function perfilGuard(...perfis: Perfil[]): CanActivateFn {
  return (): boolean | UrlTree => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    return auth.pode(...perfis) ? true : router.parseUrl('/sem-permissao');
  };
}
