import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, from, switchMap, catchError, throwError } from 'rxjs';
import { AuthStore } from '../auth/auth.store';

/** Uma única renovação por vez — demais 401s aguardam na fila. */
let refreshEmAndamento: Subject<boolean> | null = null;

function requisitarRefresh(auth: AuthStore): Subject<boolean> {
  if (!refreshEmAndamento) {
    refreshEmAndamento = new Subject<boolean>();
    from(auth.refresh()).subscribe({
      next: (ok) => {
        refreshEmAndamento!.next(ok);
        refreshEmAndamento!.complete();
        refreshEmAndamento = null;
      },
      error: () => {
        refreshEmAndamento!.next(false);
        refreshEmAndamento!.complete();
        refreshEmAndamento = null;
      },
    });
  }
  return refreshEmAndamento;
}

const isAuthCall = (url: string) =>
  url.includes('/auth/login') ||
  url.includes('/auth/portal/login') ||
  url.includes('/auth/refresh');

/**
 * Anexa `Authorization: Bearer <access>`; em 401 tenta refresh uma vez
 * (fila compartilhada) e repete a requisição. Se o refresh falhar, a sessão
 * morreu — redireciona para login com estado `expired`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const token = auth.accessToken();
  const authReq =
    token && !isAuthCall(req.url)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || isAuthCall(req.url)) {
        return throwError(() => err);
      }
      return requisitarRefresh(auth).pipe(
        switchMap((ok) => {
          if (!ok) {
            void router.navigate(['/login'], { queryParams: { expired: '1' } });
            return throwError(() => err);
          }
          const novo = auth.accessToken();
          return next(novo ? req.clone({ setHeaders: { Authorization: `Bearer ${novo}` } }) : req);
        }),
      );
    }),
  );
};
