import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MeuPerfil, Tokens } from '../models';

const KEY_ACCESS = 'hw_access';
const KEY_REFRESH = 'hw_refresh';

interface ClaimsJwt {
  tipo: 'staff' | 'portal';
}

/** Decodifica o payload do JWT (base64url) — só para UX; a autorização é do backend. */
function tipoDoToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    return (
      (JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as ClaimsJwt).tipo ?? null
    );
  } catch {
    return null;
  }
}

interface LoginPortalResp extends Tokens {
  contato: { id: number; nome: string; empresa_id: number };
}

/**
 * Sessão do portal B2B (token `portal:<contato_id>`).
 * Access token em memória + sessionStorage (persiste reload, morre com a aba).
 * Refresh opaco — o backend rotaciona a cada uso e invalida a sessão
 * se um refresh revogado for reutilizado (nesse caso: logout forçado).
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  private readonly _accessToken = signal<string | null>(sessionStorage.getItem(KEY_ACCESS));
  private readonly _refreshToken = signal<string | null>(sessionStorage.getItem(KEY_REFRESH));
  readonly perfil = signal<MeuPerfil | null>(null);
  readonly autenticado = computed(() => {
    const t = this._accessToken();
    return t !== null && tipoDoToken(t) === 'portal';
  });

  accessToken(): string | null {
    return this._accessToken();
  }

  async login(email: string, senha: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginPortalResp>(`${this.api}/auth/portal/login`, { email, senha }),
    );
    this.aplicarSessaoPortal(res, email);
    await this.carregarPerfil();
  }

  /** Aplica tokens + semeia o perfil com o contato retornado pelo login. */
  private aplicarSessaoPortal(res: LoginPortalResp, email: string): void {
    this.setTokens(res);
    // O login já traz { id, nome, empresa_id } — semeia o perfil mesmo sem GET /portal/me.
    this.perfil.set({
      contato: {
        id: res.contato.id,
        nome: res.contato.nome,
        email,
        telefone: null,
        cargo: null,
        is_principal: false,
      },
      empresa: {
        id: res.contato.empresa_id,
        razao_social: '',
        nome_fantasia: null,
        cnpj: null,
        segmento: null,
      },
      tabela_preco: null,
    });
  }

  async carregarPerfil(): Promise<void> {
    try {
      const perfil = await firstValueFrom(this.http.get<MeuPerfil>(`${this.api}/portal/me`));
      this.perfil.set(perfil);
    } catch {
      this.perfil.set(null);
    }
  }

  /** Renova o access token rotacionando o refresh. Falha = sessão encerrada. */
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
        /* logout local mesmo se a chamada falhar */
      }
    }
    this.limpar();
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
    this.perfil.set(null);
    sessionStorage.removeItem(KEY_ACCESS);
    sessionStorage.removeItem(KEY_REFRESH);
  }
}
