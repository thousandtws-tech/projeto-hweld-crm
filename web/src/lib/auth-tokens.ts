/**
 * Persistência de sessão no browser (staff e portal compartilham o mesmo par
 * de tokens — o escopo é decidido no login e propagado pelo BFF).
 */
const TOKEN_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

export function setTokens(access: string, refresh: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  }
}

export function getTokens() {
  if (typeof window === "undefined") return { access: null, refresh: null };
  return {
    access: localStorage.getItem(TOKEN_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
  };
}

export function clearTokens() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}
