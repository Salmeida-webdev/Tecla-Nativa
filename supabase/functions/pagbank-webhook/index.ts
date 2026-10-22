import { verifyPagbankSignature } from '../_shared/pagbank-signature.ts';
import { sha256Hex } from '../_shared/sha256.ts';

const MAX_BODY_BYTES = 256 * 1024;
const PAGBANK_SANDBOX = 'https://sandbox.api.pagseguro.com';
const PUBLIC_KEY_CACHE_MS = 60 * 60 * 1000;
const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;
type CachedPublicKey = { value: string; expiresAt: number };

let publicKeyCache: CachedPublicKey | null = null;
let lastForcedKeyRefreshAt = 0;

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

async function getPagbankPublicKey(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && publicKeyCache && publicKeyCache.expiresAt > now) {
    return publicKeyCache.value;
  }

  const configuredBase = requiredEnv('PAGBANK_API_BASE_URL').replace(/\/$/, '');
  if (configuredBase !== PAGBANK_SANDBOX) throw new Error('sandbox_configuration_required');

  const token = requiredEnv('PAGBANK_ACCESS_TOKEN');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`${PAGBANK_SANDBOX}/public-keys?type=webhook`, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`pagbank_public_key_http_${response.status}`);
    const result = await response.json() as JsonRecord;
    if (typeof result.public_key !== 'string' || result.public_key.length < 80) {
      throw new Error('pagbank_public_key_missing');
    }

    publicKeyCache = { value: result.public_key, expiresAt: now + PUBLIC_KEY_CACHE_MS };
    return result.public_key;
  } catch (error) {
    // A previously trusted key remains useful during a short PagBank key API outage.
    if (publicKeyCache) return publicKeyCache.value;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function nonEmptyString(value: unknown, max = 120): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function safeInteger(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function safeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
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

function extractEvent(payload: JsonRecord): {
  orderId: string;
  providerEventIdSeed: string;
  eventStatus: string;
  checkoutId: string | null;
  chargeId: string | null;
  amountCents: number | null;
  currency: string | null;
  paidAt: string | null;
  safeMetadata: JsonRecord;
} | null {
  const referenceId = nonEmptyString(payload.reference_id, 64);
  const resourceId = nonEmptyString(payload.id, 120);
  if (!referenceId || !ORDER_ID_PATTERN.test(referenceId) || !resourceId) return null;

  const charges = Array.isArray(payload.charges)
    ? payload.charges.map(record).filter((value): value is JsonRecord => value !== null)
    : [];
  const charge = charges.find((item) => item.status === 'PAID') ?? charges.at(-1) ?? null;
  const checkoutExpired = payload.status === 'EXPIRED';
  const eventStatus = nonEmptyString(checkoutExpired ? 'EXPIRED' : charge?.status ?? payload.status, 40)?.toUpperCase();
  if (!eventStatus || !/^[A-Z_]{2,40}$/.test(eventStatus)) return null;

  const chargeId = nonEmptyString(charge?.id, 120);
  const amount = record(charge?.amount);
  const amountCents = safeInteger(amount?.value);
  const currency = nonEmptyString(amount?.currency, 3)?.toUpperCase() ?? null;
  const paidAt = safeTimestamp(charge?.paid_at);
  const checkoutId = resourceId.startsWith('CHEC_')
    ? resourceId
    : nonEmptyString(payload.checkout_id, 120);
  const eventStamp = paidAt ?? nonEmptyString(charge?.updated_at, 64)
    ?? nonEmptyString(charge?.created_at, 64)
    ?? nonEmptyString(payload.updated_at, 64)
    ?? '';

  return {
    orderId: referenceId,
    providerEventIdSeed: `${resourceId}|${chargeId ?? ''}|${eventStatus}|${eventStamp}`,
    eventStatus,
    checkoutId,
    chargeId,
    amountCents,
    currency,
    paidAt,
    safeMetadata: {
      resource_id: resourceId,
      checkout_id: checkoutId,
      charge_id: chargeId,
      event_status: eventStatus,
      amount_cents: amountCents,
      currency,
    },
  };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return json({ error: 'unsupported_media_type' }, 415);

  const rawBody = await readLimitedBody(request);
  if (!rawBody) return json({ error: 'payload_too_large' }, 413);

  try {
    const signatureHeader = request.headers.get('x-payload-signature');
    if (!signatureHeader?.trim()) return json({ error: 'invalid_signature' }, 401);

    let publicKey = await getPagbankPublicKey();
    let signatureValid = await verifyPagbankSignature({
      rawBody,
      signatureHeader,
      publicKeyBase64: publicKey,
    });

    // Refresh the cached key once on a mismatch to support a PagBank key rotation.
    const now = Date.now();
    if (!signatureValid && publicKeyCache && publicKeyCache.expiresAt > now
      && now - lastForcedKeyRefreshAt >= 5 * 60 * 1000) {
      lastForcedKeyRefreshAt = now;
      publicKey = await getPagbankPublicKey(true);
      signatureValid = await verifyPagbankSignature({
        rawBody,
        signatureHeader,
        publicKeyBase64: publicKey,
      });
    }

    if (!signatureValid) return json({ error: 'invalid_signature' }, 401);

    let payload: JsonRecord;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(rawBody));
      const parsedRecord = record(parsed);
      if (!parsedRecord) return json({ error: 'invalid_payload' }, 400);
      payload = parsedRecord;
    } catch {
      return json({ error: 'invalid_payload' }, 400);
    }

    const event = extractEvent(payload);
    if (!event) {
      // A valid but unrecognized notification has no order reference to mutate.
      return new Response(null, { status: 204 });
    }

    const result = await postgrestRpc('apply_pagbank_webhook', {
      p_order_id: event.orderId,
      p_provider_event_id: await sha256Hex(event.providerEventIdSeed),
      p_event_status: event.eventStatus,
      p_payload_sha256: await sha256Hex(rawBody),
      p_checkout_id: event.checkoutId,
      p_charge_id: event.chargeId,
      p_amount_cents: event.amountCents,
      p_currency: event.currency,
      p_paid_at: event.paidAt,
      p_safe_metadata: event.safeMetadata,
    });

    if (result === 'event_conflict' || result === 'duplicate_capture_review') {
      console.warn('PagBank webhook needs review', { result, eventId: await sha256Hex(event.providerEventIdSeed) });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('PagBank webhook processing failed', { code: message.slice(0, 80) });
    // Non-2xx asks PagBank to retry when the provider or database is temporarily unavailable.
    return json({ error: 'webhook_processing_unavailable' }, 503);
  }
});
