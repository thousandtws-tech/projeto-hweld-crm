/** Endpoints do backend hweld (OpenAPI + realtime Phoenix). */
export const API_URL =
  (import.meta.env.VITE_HW_API_URL as string | undefined) ?? "http://localhost:8080/api/v1";

/** hweld-operations-api (Java) — orquestração fiscal, billing e notificações. */
export const OPS_API_URL =
  (import.meta.env.VITE_HW_OPS_API_URL as string | undefined) ?? "http://localhost:8090/api/v1";

// Vazio = mesma origem — em dev o Vite faz proxy de `/events` → :4100
// (ver vite.config.ts), eliminando o preflight CORS do SSE.
export const REALTIME_URL = (import.meta.env.VITE_HW_REALTIME_URL as string | undefined) ?? "";
