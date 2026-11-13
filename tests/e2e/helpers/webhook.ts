import { createHmac } from "node:crypto";

import { req, uuid } from "./api";
import { CFG } from "./env";

/**
 * Dispara webhook do provider stub contra o operations-api, com a assinatura
 * HMAC-SHA256 real (`X-Signature: sha256=<hex>`) — o mesmo contrato que um
 * PSP usaria. Se `E2E_WEBHOOK_SECRET` divergir do servidor, o endpoint
 * responde 401 e o teste aponta a causa.
 */
export async function webhookStub(
  externalId: string,
  status: "CONFIRMED" | "FAILED" | "EXPIRED" | "PROCESSING",
  opts: { eventId?: string; assinar?: boolean } = {},
) {
  const corpo = JSON.stringify({
    eventId: opts.eventId ?? uuid(),
    externalId,
    status,
  });
  const assinar = opts.assinar ?? true;
  const sig = assinar
    ? `sha256=${createHmac("sha256", CFG.webhookSecret).update(corpo).digest("hex")}`
    : undefined;

  return req<{ aceito?: boolean; duplicado?: boolean; resultado?: string; erro?: string }>(
    CFG.opsApi,
    "POST",
    "/api/v1/webhooks/stub",
    {
      rawBody: corpo,
      headers: sig ? { "x-signature": sig } : {},
    },
  );
}

/** Envelope de evento do realtime-engine (`POST /ingest`). */
export async function ingest(opts: {
  tipo: string;
  escopo: "staff" | "todos" | "empresa";
  empresaId?: number;
  dados: Record<string, unknown>;
  token?: string;
}) {
  return req<{ aceito?: boolean; entregas?: number; erro?: string }>(
    CFG.realtime,
    "POST",
    "/ingest",
    {
      token: opts.token ?? CFG.motorToken,
      body: {
        tipo: opts.tipo,
        audiencia:
          opts.escopo === "empresa"
            ? { escopo: "empresa", empresa_id: opts.empresaId }
            : { escopo: opts.escopo },
        dados: opts.dados,
      },
    },
  );
}
