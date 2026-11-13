import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, from, switchMap, catchError, throwError } from 'rxjs';
import { AuthStore } from '../auth/auth.store';

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

const GUEST_SID_KEY = 'hweld.guest.sid';

let guestSidCache: string | null = null;

function obterGuestSessionId(): string {
  if (guestSidCache) return guestSidCache;
  try {
    let sid = localStorage.getItem(GUEST_SID_KEY);
    if (!sid) {
      sid =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(GUEST_SID_KEY, sid);
    }
    guestSidCache = sid;
    return sid;
  } catch {
    return 'guest-local';
  }
}

const isAuthCall = (url: string) =>
  url.includes('/auth/login') ||
  url.includes('/auth/portal/login') ||
  url.includes('/auth/refresh');

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const token = auth.accessToken();
  const headers: Record<string, string> = { 'X-Session-Id': obterGuestSessionId() };
  if (token && !isAuthCall(req.url)) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const authReq = req.clone({ setHeaders: headers });

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (
        !(err instanceof HttpErrorResponse) ||
        err.status !== 401 ||
        isAuthCall(req.url) ||
        !token
      ) {
        return throwError(() => err);
      }
      return requisitarRefresh(auth).pipe(
        switchMap((ok) => {
          if (!ok) {
            void router.navigate(['/login'], { queryParams: { expired: '1' } });
            return throwError(() => err);
          }
          const novo = auth.accessToken();
          return next(
            novo
              ? req.clone({
                  setHeaders: { ...headers, Authorization: `Bearer ${novo}` },
                })
              : authReq,
          );
        }),
      );
    }),
  );
};
