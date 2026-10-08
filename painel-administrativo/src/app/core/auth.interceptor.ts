import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, from, switchMap, catchError, throwError } from 'rxjs';
import { AuthStore } from './auth';

let refreshEmAndamento: Subject<boolean> | null = null;

function requisitarRefresh(auth: AuthStore): Subject<boolean> {
  if (!refreshEmAndamento) {
    refreshEmAndamento = new Subject<boolean>();
    from(auth.refresh()).subscribe({
      next: (ok) => { refreshEmAndamento!.next(ok); refreshEmAndamento!.complete(); refreshEmAndamento = null; },
      error: () => { refreshEmAndamento!.next(false); refreshEmAndamento!.complete(); refreshEmAndamento = null; },
    });
  }
  return refreshEmAndamento;
}

const isAuthCall = (url: string) => url.includes('/auth/staff/login') || url.includes('/auth/refresh');

/** Bearer staff + refresh com fila (mesma estratégia do portal). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const token = auth.accessToken();
  const authReq = token && !isAuthCall(req.url)
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
