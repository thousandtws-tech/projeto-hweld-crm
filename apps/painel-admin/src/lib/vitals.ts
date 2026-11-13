import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

import { API_URL } from "./config";

/**
 * Web Vitals → `POST /api/v1/telemetria/vitals` no core-api.
 *
 * Envia via `navigator.sendBeacon` (sobrevive ao unload da página — é onde
 * CLS/LCP/INP reportam) com fallback para `fetch` keepalive. O endpoint loga
 * estruturado (`target: "web_vitals"`) para o agregador; não persiste nada.
 *
 * Opt-out em dev por padrão: `import.meta.env.DEV` → console.debug.
 */

const APP = "painel";

function endpoint(): string {
  // API_URL já inclui `/api/v1` (ver lib/config.ts).
  return `${API_URL}/telemetria/vitals`;
}

function enviar(m: Metric) {
  const payload = JSON.stringify({
    name: m.name,
    value: m.value,
    delta: m.delta,
    rating: m.rating,
    id: m.id,
    path: location.pathname,
    app: APP,
  });

  if (import.meta.env.DEV) {
    console.debug(`[vitals] ${m.name}`, m.value, m.rating);
    return;
  }

  const blob = new Blob([payload], { type: "application/json" });
  const ok = navigator.sendBeacon?.(endpoint(), blob);
  if (!ok) {
    void fetch(endpoint(), {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {
      /* telemetria é best-effort — nunca impacta a UX */
    });
  }
}

/** Registra os 5 vitals uma vez por sessão. Chamar no bootstrap do app. */
export function iniciarVitals() {
  onLCP(enviar);
  onINP(enviar);
  onCLS(enviar);
  onFCP(enviar);
  onTTFB(enviar);
}
