import { verifyMelhorEnvioSignature } from '../_shared/hmac.ts';
import { extractMelhorEnvioShipmentEvent } from '../_shared/melhor-envio-event.ts';
import { sha256Hex } from '../_shared/sha256.ts';

const MAX_BODY_BYTES = 256 * 1024;

type JsonRecord = Record<string, unknown>;

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

async function readLimitedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

async function postgrestRpc(name: string, payload: JsonRecord): Promise<unknown> {
  const url = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`database_rpc_http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return json({ error: 'unsupported_media_type' }, 415);
  const signatureHeader = request.headers.get('x-me-signature');
  if (!signatureHeader?.trim()) return json({ error: 'invalid_signature' }, 401);

  const rawBody = await readLimitedBody(request);
  if (!rawBody) return json({ error: 'payload_too_large' }, 413);

  try {
    const signatureValid = await verifyMelhorEnvioSignature({
      rawBody,
      signatureHeader,
      appSecret: requiredEnv('MELHOR_ENVIO_CLIENT_SECRET'),
    });
    if (!signatureValid) return json({ error: 'invalid_signature' }, 401);

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return json({ error: 'invalid_payload' }, 400);
    }

    const event = await extractMelhorEnvioShipmentEvent(payload);
    // A valid notification from a newer provider event can be acknowledged safely;
    // only the explicit allowlist above is allowed to reach the database.
    if (!event) return new Response(null, { status: 204 });

    const payloadHash = await sha256Hex(rawBody);
    const result = await postgrestRpc('apply_melhor_envio_webhook', {
      p_provider_shipment_id: event.providerShipmentId,
      // Melhor Envio does not send a distinct event ID in its documented body;
      // hashing the exact signed payload makes retries deterministic.
      p_provider_event_id: payloadHash,
      p_event_type: event.eventType,
      p_payload_sha256: payloadHash,
      p_target_status: event.targetStatus,
      p_tracking_code: event.trackingCode,
      p_occurred_at: event.occurredAt,
      p_safe_metadata: event.safeMetadata,
    });

    if (result === 'event_conflict') {
      console.warn('Melhor Envio webhook needs review', {
        result,
        eventId: payloadHash,
      });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('Melhor Envio webhook processing failed', { code: message.slice(0, 80) });
    // Temporary failures are non-2xx so Melhor Envio can retry this notification.
    return json({ error: 'webhook_processing_unavailable' }, 503);
  }
});
