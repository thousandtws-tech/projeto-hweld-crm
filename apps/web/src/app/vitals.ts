import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

import { environment } from '../environments/environment';

/**
 * Web Vitals → `POST /api/v1/telemetria/vitals` no core-api (mesmo endpoint
 * do painel-admin). sendBeacon sobrevive ao unload — onde CLS/LCP/INP reportam.
 * Telemetria é best-effort: falha nunca impacta a UX.
 */

const APP = 'web';

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

  if (!environment.production) {
    console.debug(`[vitals] ${m.name}`, m.value, m.rating);
    return;
  }

  const url = `${environment.apiUrl}/telemetria/vitals`;
  const blob = new Blob([payload], { type: 'application/json' });
  const ok = navigator.sendBeacon?.(url, blob);
  if (!ok) {
    void fetch(url, {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => undefined);
  }
}

/** Registra os 5 vitals uma vez por sessão. Chamado no bootstrap. */
export function iniciarVitals() {
  onLCP(enviar);
  onINP(enviar);
  onCLS(enviar);
  onFCP(enviar);
  onTTFB(enviar);
}
