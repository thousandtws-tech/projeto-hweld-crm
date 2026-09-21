import { apiFetch } from "@/lib/api";
import {
  ChangePasswordRequest,
  LoginCredentials,
  LoginPortalResponse,
  LoginStaffResponse,
  LogoutRequest,
  RefreshRequest,
  RefreshResponse,
} from "@/types/auth";

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

export async function loginStaff(credentials: LoginCredentials): Promise<LoginStaffResponse> {
  const data = await apiFetch<LoginStaffResponse>("/api/v1/auth/staff/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function loginPortal(credentials: LoginCredentials): Promise<LoginPortalResponse> {
  const data = await apiFetch<LoginPortalResponse>("/api/v1/auth/portal/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function refreshSession(): Promise<RefreshResponse> {
  const { refresh } = getTokens();
  if (!refresh) {
    throw new Error("Refresh token ausente");
  }
  const data = await apiFetch<RefreshResponse>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refresh } satisfies RefreshRequest),
  });
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function logout(): Promise<void> {
  const { refresh } = getTokens();
  if (refresh) {
    await apiFetch("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh } satisfies LogoutRequest),
    }).catch(() => {});
  }
  clearTokens();
}

export async function changePassword(payload: ChangePasswordRequest): Promise<void> {
  await apiFetch("/api/v1/auth/senha", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
