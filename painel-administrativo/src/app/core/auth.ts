import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Perfil, Tokens, Usuario } from './models';

const KEY_ACCESS = 'hw_staff_access';
const KEY_REFRESH = 'hw_staff_refresh';

const PERFIS: Perfil[] = ['admin', 'vendedor', 'financeiro', 'estoque', 'tecnico'];

interface ClaimsJwt {
  sub: string;
  tipo: 'staff' | 'portal';
  perfil?: string;
}

/** Decodifica o payload do JWT (base64url) — só para UX; a autorização é do backend. */
function decodificar(token: string): ClaimsJwt | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as ClaimsJwt;
  } catch {
    return null;
  }
}

/** Sessão staff (token `staff:<id>`) com perfil lido do claim JWT para RBAC do menu/rotas. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  private readonly _accessToken = signal<string | null>(sessionStorage.getItem(KEY_ACCESS));
  private readonly _refreshToken = signal<string | null>(sessionStorage.getItem(KEY_REFRESH));
  readonly usuario = signal<Usuario | null>(null);

  readonly autenticado = computed(() => {
    const t = this._accessToken();
    return t !== null && decodificar(t)?.tipo === 'staff';
  });
  readonly perfil = computed<Perfil | null>(() => {
    const t = this._accessToken();
    if (!t) return null;
    const p = decodificar(t)?.perfil;
    return PERFIS.includes(p as Perfil) ? (p as Perfil) : null;
  });
  readonly usuarioId = computed<number | null>(() => {
    const t = this._accessToken();
    if (!t) return null;
    const id = Number(decodificar(t)?.sub);
    return Number.isFinite(id) ? id : null;
  });

  accessToken(): string | null {
    return this._accessToken();
  }

  pode(...perfis: Perfil[]): boolean {
    const p = this.perfil();
    return p !== null && perfis.includes(p);
  }

  async login(email: string, senha: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<Tokens>(`${this.api}/auth/staff/login`, { email, senha }),
    );
    this.setTokens(res);
  }

  async refresh(): Promise<boolean> {
    const refreshToken = this._refreshToken();
    if (!refreshToken) return false;
    try {
      const res = await firstValueFrom(
        this.http.post<Tokens>(`${this.api}/auth/refresh`, { refresh_token: refreshToken }),
      );
      this.setTokens(res);
      return true;
    } catch {
      this.limpar();
      return false;
    }
  }

  async logout(): Promise<void> {
    const refreshToken = this._refreshToken();
    if (refreshToken) {
      try {
        await firstValueFrom(
          this.http.post(`${this.api}/auth/logout`, { refresh_token: refreshToken }),
        );
      } catch {
        /* limpa local mesmo se a revogação falhar */
      }
    }
    this.limpar();
  }

  /** Troca a própria senha — 422 = senha atual incorreta. */
  async trocarSenha(senha_atual: string, nova_senha: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/auth/senha`, { senha_atual, nova_senha }),
    );
  }

  private setTokens(t: Tokens): void {
    this._accessToken.set(t.access_token);
    this._refreshToken.set(t.refresh_token);
    sessionStorage.setItem(KEY_ACCESS, t.access_token);
    sessionStorage.setItem(KEY_REFRESH, t.refresh_token);
  }

  private limpar(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this.usuario.set(null);
    sessionStorage.removeItem(KEY_ACCESS);
    sessionStorage.removeItem(KEY_REFRESH);
  }
}
