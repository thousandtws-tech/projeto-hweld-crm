/**
 * Configuração server-side do BFF. Nunca exposta ao browser
 * (sem prefixo NEXT_PUBLIC_).
 */
export const serverEnv = {
  apiUrl: (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  ).replace(/\/$/, ""),
  /** Timeout das chamadas REST ao backend (ms). */
  apiTimeoutMs: Number(process.env.API_TIMEOUT_MS ?? 15_000),
} as const;
